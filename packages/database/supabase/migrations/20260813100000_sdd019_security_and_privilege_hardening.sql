-- ============================================================================
-- SDD019: Security, Privilege Lockdown & Database Hardening
-- Fecha: 2026-08-13
-- Fuente: Supabase Database Linter + verificación MCP de ACLs y callers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BLINDAJE DE TABLAS: REVOCAR TRUNCATE Y REFERENCES DE ROLES DE API
-- ----------------------------------------------------------------------------
-- TRUNCATE salta RLS. anon y authenticated NUNCA deben tener permiso de truncar.
REVOKE TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES ON TABLES FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. LOCKDOWN DE FUNCIONES Y RPCS
-- ----------------------------------------------------------------------------

-- Cat. 1: RPCs invocadas por cliente Web autenticado (revocar anon y PUBLIC, mantener authenticated)
REVOKE EXECUTE ON FUNCTION public.register_telegram_bot(uuid, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_escritura_blocks(uuid, uuid) FROM anon, PUBLIC;

-- Cat. 2: RPCs exclusivas de Backend / Service Role (revocar anon, authenticated, PUBLIC)
REVOKE EXECUTE ON FUNCTION public.approve_sale(uuid, uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_reservation(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_sale(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_reservation(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_sale_request_db(uuid, uuid, uuid, text, text, text, jsonb, text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_reservation_request_db(uuid, uuid, uuid, text, text, text, jsonb, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_project_sales(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_mcp_connection(uuid, uuid, text, text, text, text, text[]) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_default_document_blocks(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assert_sdd_007_project_lot_scope(text, uuid, uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_activate_project_sales(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_project_files(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_lot_operable(uuid, uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_project_vendible(uuid) FROM anon, authenticated, PUBLIC;

-- Cat. 3: Helpers de Políticas RLS (revocar anon y PUBLIC, mantener authenticated)
REVOKE EXECUTE ON FUNCTION public.is_org_user(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_project_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_project_vendor(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon, PUBLIC;

-- Cat. 4: Triggers y Validadores de Scope (revocar anon, authenticated, PUBLIC)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_profile_to_vendor() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_stage_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_legal_fields() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_lot_records_on_lot_insert() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_escritura_clause_immutability() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_escritura_template_immutability() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_minuta_generation_immutability() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_document_evidence_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_document_ingestion_job_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_escritura_case_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_escritura_deliveries_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_escritura_matrices_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_escritura_minuta_generations_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_escritura_template_clauses_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_legal_document_page_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_legal_review_decision_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_lot_legal_data_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_project_legal_data_sii_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_sdd_007_project_lot_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_title_analyses_scope() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_variable_resolution_scope() FROM anon, authenticated, PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. SEARCH PATH MUTABILITY FIX (SECURITY INVOKER)
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.validate_project_active_template_same_org() SET search_path = '';
ALTER FUNCTION public.validate_project_legal_data_same_org() SET search_path = '';
ALTER FUNCTION public.handle_update_timestamp() SET search_path = '';

-- ----------------------------------------------------------------------------
-- 4. TIMEOUTS POR ROL DE API (idle_in_transaction_session_timeout en ms)
-- ----------------------------------------------------------------------------
ALTER ROLE anon SET idle_in_transaction_session_timeout = '3000';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '8000';
ALTER ROLE authenticator SET idle_in_transaction_session_timeout = '10000';

-- ----------------------------------------------------------------------------
-- 5. LIMPIEZA DE ÍNDICES DUPLICADOS
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_telegram_bots_org;
DROP INDEX IF EXISTS public.escritura_template_clauses_template_idx;

-- ----------------------------------------------------------------------------
-- 6. HARDENING DEAD_LETTER_QUEUE (NOT NULL)
-- ----------------------------------------------------------------------------
ALTER TABLE public.dead_letter_queue
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN attempts SET NOT NULL;
