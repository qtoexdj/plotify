-- Migration: Scope repeatable sii.rol_avaluo_en_tramite_texto by unit_index
-- Adjust variable_resolutions_active_scope_idx unique index

DROP INDEX IF EXISTS public.variable_resolutions_active_scope_idx;

CREATE UNIQUE INDEX variable_resolutions_active_scope_idx ON public.variable_resolutions (
    project_id,
    COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(escritura_case_id, '00000000-0000-0000-0000-000000000000'::uuid),
    variable_key,
    (CASE
        WHEN variable_key = ANY (ARRAY['sii.unidad_nombre'::text, 'sii.pre_rol_lote'::text, 'sii.rol_avaluo_en_tramite_texto'::text]) THEN COALESCE(source_ref ->> 'unit_index', '')
        ELSE ''
    END)
) WHERE state <> 'superseded'::text;
