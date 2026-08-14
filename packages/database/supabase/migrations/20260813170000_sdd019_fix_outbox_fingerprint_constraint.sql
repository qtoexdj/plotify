-- ============================================================================
-- SDD019: Fix constraint workflow_outbox.event_fingerprint tras hash md5
-- Fecha: 2026-08-13
-- Contexto: 20260812225000 cambió approve_sale a event_fingerprint = md5(...)
-- (32 hex) por decisión del plan de CPU, pero dejó el CHECK en 64 hex (sha256).
-- Toda aprobación de venta nueva fallaba con 23514 al insertar en
-- workflow_outbox. El fix acepta ambos formatos para no invalidar las filas
-- históricas sha256 ya existentes.
-- ============================================================================

ALTER TABLE public.workflow_outbox
  DROP CONSTRAINT workflow_outbox_event_fingerprint_check;

ALTER TABLE public.workflow_outbox
  ADD CONSTRAINT workflow_outbox_event_fingerprint_check
  CHECK (event_fingerprint ~ '^([0-9a-f]{32}|[0-9a-f]{64})$');
