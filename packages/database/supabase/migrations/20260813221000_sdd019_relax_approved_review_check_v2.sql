-- Fase A1-bis (bug 2026-08-13): el puente operacional stagea comprador.*,
-- lote.*, servidumbre.*, transaccion.* con source_type IN ('system','geometry',
-- 'derived') tras una venta aprobada. Persistirlas como state='approved' o
-- 'derived' previene que la mesa del molde las cuente como "por aprobar" pese a
-- que su valor ya está sembrado y el admin ya aprobó la venta por Telegram. La
-- auditoría de la venta ya vive en approval_requests/workflow_outbox/
-- legal_review_decisions según corresponda; reviewed_by de variable_resolutions
-- no es authoritative para estos actos del sistema.
--
-- v2 extiende la excepción de la v1 (sólo source_type='legal_review') a los
-- source_type del puente (system/geometry/derived), exigiendo igualmente
-- reviewed_at NOT NULL para ellos.
ALTER TABLE public.variable_resolutions
  DROP CONSTRAINT variable_resolutions_approved_review_check;

ALTER TABLE public.variable_resolutions
  ADD CONSTRAINT variable_resolutions_approved_review_check
  CHECK (
    state <> 'approved'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (source_type IN ('legal_review', 'system', 'geometry', 'derived') AND reviewed_at IS NOT NULL)
  );
