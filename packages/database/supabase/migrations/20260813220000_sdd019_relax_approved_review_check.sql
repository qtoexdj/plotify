-- SDD017 exceptions_only (T010) + fix 2026-08-13 "Lote 26 queda variables_pending"
--
-- `variable_resolutions_approved_review_check` exigía que `state = 'approved'`
-- tuviera `reviewed_by` y `reviewed_at` NOT NULL. Esto vino del patrón humano
-- (SDD007): una variable se aprueba tras una revisión humana explícita.
--
-- Con SDD017 (aprobación por excepción) el sistema auto-siembra
-- `revision_juridica.estado = 'aprobada'` vía `_upsert_lot_variable(actor=
-- 'system')` en modo `exceptions_only`: decide el caso a nombre del sistema y
-- deja auditoría en `legal_review_decisions (origin='system', decided_by=NULL,
-- trigger='sale_validated'/'review_approved')`. Persistirla como `resolved`
-- (camino viejo) la dejaba eternamente como "por aprobar" en la mesa del
-- molde pese a que el gate ya estaba satisfecho (bug del Lote 26 Teno 2).
--
-- Se afloja el check: `approved` SÓlo exige `reviewed_by`/`reviewed_at` cuando
-- `source_type` NO sea `'legal_review'`. Para `source_type = 'legal_review'` la
-- auditoría vive en `legal_review_decisions` (tabla dedicada), no en `reviewed_*`.
ALTER TABLE public.variable_resolutions
  DROP CONSTRAINT variable_resolutions_approved_review_check;

ALTER TABLE public.variable_resolutions
  ADD CONSTRAINT variable_resolutions_approved_review_check
  CHECK (
    state <> 'approved'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (source_type = 'legal_review' AND reviewed_at IS NOT NULL)
  );

-- Saneo retroactivo: las 36 filas revision_juridica.* del proyecto Teno 2 que
-- quedaron state='resolved' pese a value_text='aprobada' las deja en
-- 'approved' (con reviewed_at = updated_at actual, ya no NULL). La mesa del
-- molde deja de mostrarlas como "por aprobar".
UPDATE public.variable_resolutions
SET state = 'approved',
    reviewed_at = COALESCE(reviewed_at, updated_at),
    updated_at = now()
WHERE variable_group = 'revision_juridica'
  AND state = 'resolved'
  AND source_type = 'legal_review'
  AND value_text IS NOT NULL
  AND approval_required = false
  AND escritura_case_id IS NULL
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL;