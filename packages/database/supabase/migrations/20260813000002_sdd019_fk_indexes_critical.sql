-- Migration: 20260813000002_sdd019_fk_indexes_critical.sql
-- SDD 019: Índices críticos para FKs sin covering index (Supabase Advisors: 107 findings / 37 tablas).
--
-- Problema: cada DELETE/UPDATE sobre una tabla referenciada por FK sin índice en la tabla hija
-- dispara un seq scan en la hija para verificar que no haya huérfanos. En tablas hot del cron de
-- outbox, audit y cascada de escritura, esto multiplica CPU y locks.
--
-- Solución: CREATE INDEX IF NOT EXISTS en las FKs más críticas del workflow de escrituras y audit/outbox.
-- No se cubren las 107; se priorizan las que tocan tablas hot observadas en el incidente del 6-7 ago.
--
-- Idempotente. No `CONCURRENTLY` (no soportado en bloques de transacción de migraciones Supabase);
-- el dataset cloud es pequeño (2 proyectos, 106 lotes, 23 matrices, 12 outbox rows) y la creación
-- bloquea brevemente pero no genera downtime.

-- ============================================================================
-- A. workflow_outbox (cron hot path del worker ARQ)
-- ============================================================================
CREATE INDEX IF NOT EXISTS workflow_outbox_aggregate_id_idx
  ON public.workflow_outbox(aggregate_id);
CREATE INDEX IF NOT EXISTS workflow_outbox_operation_id_idx
  ON public.workflow_outbox(operation_id);
CREATE INDEX IF NOT EXISTS workflow_outbox_organization_idx
  ON public.workflow_outbox(organization_id);

-- ============================================================================
-- B. audit_logs (escritura y lectura en cada RPC aprobadora)
-- ============================================================================
CREATE INDEX IF NOT EXISTS audit_logs_actor_user_id_idx
  ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS audit_logs_operation_id_idx
  ON public.audit_logs(operation_id);

-- ============================================================================
-- C. denied_operation_attempts (compensación durable)
-- ============================================================================
CREATE INDEX IF NOT EXISTS denied_operation_attempts_audit_log_id_idx
  ON public.denied_operation_attempts(audit_log_id);
CREATE INDEX IF NOT EXISTS denied_operation_attempts_organization_id_idx
  ON public.denied_operation_attempts(organization_id);

-- ============================================================================
-- D. escritura_cascade / cases / minuta_generations (cascada de aprobación)
-- ============================================================================
CREATE INDEX IF NOT EXISTS escritura_cases_organization_id_idx
  ON public.escritura_cases(organization_id);
CREATE INDEX IF NOT EXISTS escritura_approval_attempts_project_id_idx
  ON public.escritura_approval_attempts(project_id);
CREATE INDEX IF NOT EXISTS escritura_minuta_generations_approval_id_idx
  ON public.escritura_minuta_generations(approval_id);
CREATE INDEX IF NOT EXISTS escritura_minuta_generations_project_id_idx
  ON public.escritura_minuta_generations(project_id);
CREATE INDEX IF NOT EXISTS escritura_signature_events_project_id_idx
  ON public.escritura_signature_events(project_id);

-- ============================================================================
-- E. escritura_deliveries / delivery_capabilities (entrega durable)
-- ============================================================================
CREATE INDEX IF NOT EXISTS escritura_deliveries_active_capability_id_idx
  ON public.escritura_deliveries(active_capability_id);
CREATE INDEX IF NOT EXISTS escritura_deliveries_project_id_idx
  ON public.escritura_deliveries(project_id);
CREATE INDEX IF NOT EXISTS escritura_delivery_capabilities_last_audit_id_idx
  ON public.escritura_delivery_capabilities(last_audit_id);

-- ============================================================================
-- F. legal_documents (ingesta batch)
-- ============================================================================
CREATE INDEX IF NOT EXISTS legal_documents_lot_id_idx
  ON public.legal_documents(lot_id);
CREATE INDEX IF NOT EXISTS legal_documents_superseded_by_idx
  ON public.legal_documents(superseded_by);
CREATE INDEX IF NOT EXISTS legal_documents_uploaded_by_idx
  ON public.legal_documents(uploaded_by);

-- ============================================================================
-- G. production_readiness_findings / vendor_membership_operations (gate y auth compensation)
-- ============================================================================
CREATE INDEX IF NOT EXISTS production_readiness_findings_organization_id_idx
  ON public.production_readiness_findings(organization_id);
CREATE INDEX IF NOT EXISTS vendor_membership_operations_organization_id_idx
  ON public.vendor_membership_operations(organization_id);
CREATE INDEX IF NOT EXISTS vendor_membership_operations_target_project_id_idx
  ON public.vendor_membership_operations(target_project_id);

-- ============================================================================
-- H. feature_rollout / projects (rollout y CAM)
-- ============================================================================
CREATE INDEX IF NOT EXISTS feature_rollout_projects_project_id_idx
  ON public.feature_rollout_projects(project_id);
CREATE INDEX IF NOT EXISTS projects_approved_matrix_id_idx
  ON public.projects(approved_matrix_id);