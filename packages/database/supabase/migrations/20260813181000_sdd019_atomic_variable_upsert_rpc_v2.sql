-- ============================================================================
-- SDD019: RPC atómico v2 — FK superseded_by deferible
-- Fecha: 2026-08-13
-- Motivo: v1 (20260813180000) seteaba superseded_by ANTES de insertar la fila
-- nueva, y el FK variable_resolutions_superseded_by_fkey es IMMEDIATE →
-- 23503. Se convierte el FK a DEFERRABLE INITIALLY IMMEDIATE y la función
-- difiere los constraints dentro de su transacción: el supersede (que libera
-- el slot del índice único) y el link superseded_by se validan al COMMIT,
-- cuando ambas filas existen.
-- ============================================================================

ALTER TABLE public.variable_resolutions
  DROP CONSTRAINT variable_resolutions_superseded_by_fkey;

ALTER TABLE public.variable_resolutions
  ADD CONSTRAINT variable_resolutions_superseded_by_fkey
  FOREIGN KEY (superseded_by) REFERENCES public.variable_resolutions(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE OR REPLACE FUNCTION public.batch_upsert_variable_resolutions(p_rows jsonb)
RETURNS SETOF public.variable_resolutions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_row record;
    v_new_id uuid;
    v_inserted public.variable_resolutions;
    v_repeatable_keys constant text[] := ARRAY[
        'sii.unidad_nombre', 'sii.pre_rol_lote', 'sii.rol_avaluo_en_tramite_texto'
    ];
BEGIN
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
        RAISE EXCEPTION 'p_rows debe ser un array jsonb'
            USING ERRCODE = '22023';
    END IF;

    LOCK TABLE public.variable_resolutions IN SHARE ROW EXCLUSIVE MODE;
    SET CONSTRAINTS ALL DEFERRED;

    FOR v_row IN
        SELECT
            (r ->> 'organization_id')::uuid          AS organization_id,
            (r ->> 'project_id')::uuid               AS project_id,
            (r ->> 'lot_id')::uuid                   AS lot_id,
            (r ->> 'escritura_case_id')::uuid        AS escritura_case_id,
            r ->> 'variable_key'                     AS variable_key,
            COALESCE(r ->> 'variable_group', '')     AS variable_group,
            r ->> 'value_text'                       AS value_text,
            CASE
                WHEN r ? 'value_json' AND jsonb_typeof(r -> 'value_json') <> 'null'
                THEN r -> 'value_json'
                ELSE NULL
            END                                     AS value_json,
            COALESCE(r ->> 'state', 'missing')      AS state,
            COALESCE(r ->> 'source_type', 'system') AS source_type,
            COALESCE(r -> 'source_ref', '{}'::jsonb) AS source_ref,
            (r ->> 'confidence')::numeric           AS confidence,
            r ->> 'extractor_name'                  AS extractor_name,
            COALESCE((r ->> 'approval_required')::boolean, false) AS approval_required
        FROM jsonb_array_elements(p_rows) AS r
        WHERE r ? 'organization_id' AND r ? 'project_id' AND r ? 'variable_key'
    LOOP
        v_new_id := gen_random_uuid();

        UPDATE public.variable_resolutions vr
        SET state = 'superseded', superseded_by = v_new_id, updated_at = now()
        WHERE vr.project_id = v_row.project_id
          AND vr.variable_key = v_row.variable_key
          AND vr.state <> 'superseded'
          AND vr.lot_id IS NOT DISTINCT FROM v_row.lot_id
          AND vr.escritura_case_id IS NOT DISTINCT FROM v_row.escritura_case_id
          AND CASE
                WHEN v_row.variable_key = ANY(v_repeatable_keys)
                THEN COALESCE(vr.source_ref ->> 'unit_index', '') =
                     COALESCE(v_row.source_ref ->> 'unit_index', '')
                ELSE true
              END;

        INSERT INTO public.variable_resolutions (
            id, organization_id, project_id, lot_id, escritura_case_id,
            variable_key, variable_group, value_text, value_json, state,
            source_type, source_ref, confidence, extractor_name, approval_required
        ) VALUES (
            v_new_id, v_row.organization_id, v_row.project_id, v_row.lot_id,
            v_row.escritura_case_id, v_row.variable_key, v_row.variable_group,
            v_row.value_text, v_row.value_json, v_row.state,
            v_row.source_type, v_row.source_ref, v_row.confidence,
            v_row.extractor_name, v_row.approval_required
        )
        RETURNING * INTO v_inserted;

        RETURN NEXT v_inserted;
    END LOOP;

    RETURN;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.batch_upsert_variable_resolutions(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.batch_upsert_variable_resolutions(jsonb) TO service_role;
