-- SDD019 rollout: canonical_geometry_import pasa a GA.
-- 1) Backfill: habilita (mode='on') la feature en toda organización que no tenga
--    un control explícito en feature_rollout_controls. Controles ya seteados
--    (on/off/projects) se respetan y no se tocan.
-- 2) Provisión: trigger after insert en organizations para que toda organización
--    nueva nazca con la feature habilitada, con la misma ceremonia.
-- Ambos caminos pasan por claim_idempotency_operation + set_feature_rollout_control
-- + complete_idempotency_operation, así que queda audit log y operación durable.

create or replace function public.enable_canonical_geometry_import(
  p_organization_id uuid,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  op public.idempotency_operations;
  control public.feature_rollout_controls;
  req_hash text;
begin
  if exists (
    select 1 from public.feature_rollout_controls
    where organization_id = p_organization_id
      and feature_key = 'canonical_geometry_import'
  ) then
    return;
  end if;

  req_hash := encode(extensions.digest(
    concat_ws('|', 'canonical-geometry-import-ga-v1', p_organization_id, 'on'),
    'sha256'), 'hex');
  op := public.claim_idempotency_operation(
    p_organization_id,
    'service',
    p_actor,
    'rollout_control.set',
    concat('org:', p_organization_id, ':canonical_geometry_import'),
    'rollout:canonical_geometry_import:ga-v1',
    req_hash,
    'service',
    null);
  if op.status = 'succeeded' then
    return;
  end if;

  control := public.set_feature_rollout_control(
    p_organization_id,
    'canonical_geometry_import',
    'on',
    null,
    0,
    op.id,
    p_actor,
    'GA: import canonico de geometria KMZ/KML habilitado por defecto');

  perform public.complete_idempotency_operation(
    op.id,
    req_hash,
    'succeeded',
    'feature_rollout_controls',
    control.id,
    jsonb_build_object('feature', 'canonical_geometry_import', 'mode', control.mode, 'version', control.version),
    null);
end;
$$;

revoke all on function public.enable_canonical_geometry_import(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.enable_canonical_geometry_import(uuid, text) to service_role;

create or replace function public.organizations_enable_canonical_geometry_import()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enable_canonical_geometry_import(new.id, 'provision:organizations_canonical_geometry_import_ga');
  return new;
end;
$$;

revoke all on function public.organizations_enable_canonical_geometry_import() from public, anon, authenticated, service_role;

drop trigger if exists organizations_canonical_geometry_import_ga on public.organizations;
create trigger organizations_canonical_geometry_import_ga
  after insert on public.organizations
  for each row execute function public.organizations_enable_canonical_geometry_import();

do $$
declare
  org record;
begin
  for org in select id from public.organizations loop
    perform public.enable_canonical_geometry_import(org.id, 'migration:20260827120000_canonical_geometry_import_ga');
  end loop;
end;
$$;

comment on function public.enable_canonical_geometry_import(uuid, text) is
  'GA de canonical_geometry_import: crea el control mode=on con ceremonia SDD019 si la organizacion no tiene control explicito.';
