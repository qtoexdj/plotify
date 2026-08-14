-- Fase A1-bis (bug 2026-08-13): v2 exigía reviewed_at NOT NULL para
-- source_type IN ('legal_review','system','geometry','derived'), pero las filas
-- sembradas por el puente operacional no setean reviewed_at (no hay acto
-- humano individual que auditar — la auditoría de la venta vive en
-- approval_requests/workflow_outbox/legal_review_decisions). Se afloja el
-- check para no exigir reviewed_at en absoluto cuando el acto es del sistema:
-- basta con source_type IN ('legal_review','system','geometry','derived').
ALTER TABLE public.variable_resolutions
  DROP CONSTRAINT variable_resolutions_approved_review_check;

ALTER TABLE public.variable_resolutions
  ADD CONSTRAINT variable_resolutions_approved_review_check
  CHECK (
    state <> 'approved'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (source_type IN ('legal_review', 'system', 'geometry', 'derived'))
  );
