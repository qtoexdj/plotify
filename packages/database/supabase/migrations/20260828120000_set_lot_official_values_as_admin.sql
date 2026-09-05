-- Carga de valores oficiales de lote (cifras de plano + deslindes) con contexto
-- de admin, para procesos de carga masiva desde service_role.
--
-- `trg_guard_legal_fields` protege area_official_m2, boundaries_official y
-- verified_* : solo un project_admin puede escribirlos, y revierte en silencio
-- cualquier UPDATE que no traiga `request.jwt.claim.sub`. Un script con la
-- service key no lo trae, así que sus escrituras se perdían sin error.
--
-- Mismo patrón que verify_lot_as_admin / approve_sale: SECURITY DEFINER
-- expuesto solo a service_role, que fija el claim SOLO para la transacción
-- actual (set_config con is_local = true) tras comprobar que el actor es
-- admin de la organización dueña del lote.

create or replace function public.set_lot_official_values_as_admin(
  p_lot_id uuid,
  p_admin_id uuid,
  p_area_official_m2 numeric default null,
  p_superficie_neta_m2 numeric default null,
  p_servidumbre_m2 numeric default null,
  p_servidumbre_ancho_m numeric default null,
  p_servidumbre_ancho_label text default null,
  p_boundaries_official jsonb default null,
  p_verify boolean default false,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_project_id uuid;
  v_org_id uuid;
  v_prev_status text;
  v_prev_area numeric;
  v_now timestamptz := now();
begin
  select project_id, verified_status, area_official_m2
    into v_project_id, v_prev_status, v_prev_area
  from public.lots where id = p_lot_id for update;

  if v_project_id is null then
    raise exception 'Lot % not found', p_lot_id;
  end if;

  select organization_id into v_org_id from public.projects where id = v_project_id;

  if not exists (
    select 1 from public.organization_members
    where organization_id = v_org_id and user_id = p_admin_id and role = 'admin'
  ) then
    raise exception 'User % is not an admin of project %', p_admin_id, v_project_id;
  end if;

  -- Verificar exige deslindes: un lote verificado sin ellos es un estado que la
  -- propia app nunca produce y dejaría la escritura sin deslinde.
  if p_verify and coalesce(jsonb_array_length(
       coalesce(p_boundaries_official,
                (select boundaries_official from public.lots where id = p_lot_id))), 0) = 0 then
    raise exception 'BOUNDARIES_REQUIRED_TO_VERIFY';
  end if;

  perform set_config('request.jwt.claim.sub', p_admin_id::text, true);

  update public.lots set
    area_official_m2        = coalesce(p_area_official_m2, area_official_m2),
    superficie_neta_m2      = coalesce(p_superficie_neta_m2, superficie_neta_m2),
    servidumbre_m2          = coalesce(p_servidumbre_m2, servidumbre_m2),
    servidumbre_ancho_m     = coalesce(p_servidumbre_ancho_m, servidumbre_ancho_m),
    servidumbre_ancho_label = coalesce(p_servidumbre_ancho_label, servidumbre_ancho_label),
    boundaries_official     = coalesce(p_boundaries_official, boundaries_official),
    verified_status         = case when p_verify then 'verified_override' else verified_status end,
    verified_at             = case when p_verify then v_now else verified_at end,
    verified_by             = case when p_verify then p_admin_id else verified_by end,
    updated_at              = v_now
  where id = p_lot_id;

  insert into public.audit_logs (actor, action, entity, entity_id, organization_id, payload)
  values (
    p_admin_id::text,
    case when p_verify then 'VERIFY' else 'UPDATE' end,
    'lots', p_lot_id::text, v_org_id,
    jsonb_build_object(
      'type', 'official_override',
      'source', p_source,
      'bulk', true,
      'prev', jsonb_build_object('area_official_m2', v_prev_area, 'verified_status', v_prev_status),
      'next', jsonb_build_object(
        'area_official_m2', p_area_official_m2,
        'superficie_neta_m2', p_superficie_neta_m2,
        'servidumbre_m2', p_servidumbre_m2,
        'servidumbre_ancho_m', p_servidumbre_ancho_m,
        'verified_status', case when p_verify then 'verified_override' else v_prev_status end))
  );
end;
$function$;

revoke execute on function public.set_lot_official_values_as_admin(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,boolean,text) from anon, authenticated, public;
grant execute on function public.set_lot_official_values_as_admin(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,boolean,text) to service_role;

comment on function public.set_lot_official_values_as_admin(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,boolean,text) is
  'Carga masiva de valores oficiales de lote con contexto de admin; exige deslindes para verificar y deja auditoría.';
