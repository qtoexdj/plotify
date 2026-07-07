-- T057 fix: la verificación masiva de lotes escribe con la service role key
-- del backend, que no tiene sesión de usuario real, así que auth.uid() es
-- NULL y el trigger trg_guard_legal_fields (guard_legal_fields()) revierte
-- en silencio verified_status/verified_at/verified_by/área/perímetro/
-- deslindes oficiales a su valor anterior en cada UPDATE (sin lanzar error).
--
-- Este RPC re-verifica el rol admin server-side (defensa en profundidad,
-- Python ya lo valida antes de llamar) e impersona al admin seteando
-- request.jwt.claim.sub SOLO para la transacción actual (set_config con
-- is_local=true), para que guard_legal_fields() autorice la escritura.
-- Mismo patrón que ya usan approve_sale/register_telegram_bot: RPC
-- SECURITY DEFINER expuesto solo a service_role.

CREATE OR REPLACE FUNCTION public.verify_lot_as_admin(
  p_lot_id uuid,
  p_admin_id uuid,
  p_area_calc_m2 numeric,
  p_perimeter_calc_m numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_org_id uuid;
  v_prev_status text;
  v_area_official numeric;
  v_perimeter_official numeric;
  v_now timestamptz := now();
BEGIN
  SELECT project_id, verified_status, area_official_m2, perimeter_official_m
    INTO v_project_id, v_prev_status, v_area_official, v_perimeter_official
  FROM public.lots
  WHERE id = p_lot_id
  FOR UPDATE;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Lot % not found', p_lot_id;
  END IF;

  SELECT organization_id INTO v_org_id FROM public.projects WHERE id = v_project_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_id AND user_id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'User % is not an admin of project %', p_admin_id, v_project_id;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', p_admin_id::text, true);

  UPDATE public.lots
  SET verified_status = 'verified_exact',
      verified_at = v_now,
      verified_by = p_admin_id,
      updated_at = v_now,
      m2 = v_area_official
  WHERE id = p_lot_id;

  INSERT INTO public.audit_logs (actor, action, entity, entity_id, payload)
  VALUES (
    p_admin_id, 'VERIFY', 'lots', p_lot_id,
    jsonb_build_object(
      'type', 'lot_saved_and_verified',
      'verified_status', 'verified_exact',
      'official', jsonb_build_object(
        'area_official_m2', v_area_official,
        'perimeter_official_m', v_perimeter_official,
        'boundaries_official', null
      ),
      'calculated_snapshot', jsonb_build_object(
        'area_m2', p_area_calc_m2,
        'perimeter_m', p_perimeter_calc_m
      ),
      'prev_status', v_prev_status,
      'verified_at', v_now,
      'bulk', true
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.verify_lot_as_admin(uuid, uuid, numeric, numeric) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.verify_lot_as_admin(uuid, uuid, numeric, numeric) TO service_role;
