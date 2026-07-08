-- SDD 017 (T003, US1 FR-001/FR-002/FR-006): historial de corridas de la
-- cascada de aprobación por excepción. Cada venta validada (o reintento, o
-- aprobación de revisión) dispara una corrida que registra su resultado
-- (completed/exception/awaiting_review), las causas humanizadas si quedó en
-- excepción y qué pasos ejecutó/saltó (base de la idempotencia, research
-- D3/D6). La mesa deriva su vista del caso de la ÚLTIMA corrida + los datos
-- existentes (generaciones, entregas) — no hay columna de estado mutable en
-- escritura_cases, para no perder el historial de reintentos.

CREATE TABLE IF NOT EXISTS public.escritura_cascade_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    escritura_case_id UUID NOT NULL REFERENCES public.escritura_cases(id) ON DELETE CASCADE,
    trigger TEXT NOT NULL,
    outcome TEXT NOT NULL,
    causes JSONB NOT NULL DEFAULT '[]'::jsonb,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT escritura_cascade_runs_trigger_check
        CHECK (trigger = ANY (ARRAY['sale_validated'::text, 'review_approved'::text, 'manual_retry'::text])),
    CONSTRAINT escritura_cascade_runs_outcome_check
        CHECK (outcome = ANY (ARRAY['completed'::text, 'exception'::text, 'awaiting_review'::text]))
);

CREATE INDEX IF NOT EXISTS escritura_cascade_runs_case_created_idx
    ON public.escritura_cascade_runs (escritura_case_id, created_at DESC);

ALTER TABLE public.escritura_cascade_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY escritura_cascade_runs_admin_all ON public.escritura_cascade_runs
    FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin())
    WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());

CREATE POLICY escritura_cascade_runs_member_select ON public.escritura_cascade_runs
    FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());

CREATE POLICY escritura_cascade_runs_service_role ON public.escritura_cascade_runs
    TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.escritura_cascade_runs IS
  'SDD 017: historial de corridas de la cascada de aprobacion por excepcion (venta validada / revision aprobada / reintento manual), con causas humanizadas y pasos ejecutados/saltados para idempotencia.';

-- ── Origen de la aprobación (T005 D2): humano vs. sistema ───────────────────
--
-- Una aprobación automática deja approved_by/submitted_by NULL (no existe un
-- usuario "sistema" que contamine la membresía de la organización) y marca
-- approval_origin='system'. El detalle (que gatillo la disparo, que molde y
-- version hereda) vive en legal_review_decisions, extendida abajo.

ALTER TABLE public.escritura_matrices
  ADD COLUMN approval_origin TEXT NOT NULL DEFAULT 'human',
  ADD CONSTRAINT escritura_matrices_approval_origin_check
    CHECK (approval_origin = ANY (ARRAY['human'::text, 'system'::text]));

COMMENT ON COLUMN public.escritura_matrices.approval_origin IS
  'SDD 017: human (default, todas las filas historicas) o system cuando la cascada de aprobacion por excepcion aprobo el caso sin intervencion humana.';

-- ── Extensión de legal_review_decisions para decisiones del sistema ─────────
--
-- decided_by pasa a nullable: una decision origin='system' no tiene un
-- usuario humano detras. trigger/inherited_from_matriz_id/inherited_matriz_
-- version dan la trazabilidad completa exigida por FR-002/SC-005 (que
-- gatillo la cascada, que molde y version del proyecto heredo el caso).

ALTER TABLE public.legal_review_decisions
  ALTER COLUMN decided_by DROP NOT NULL,
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'human',
  ADD COLUMN trigger TEXT,
  ADD COLUMN inherited_from_matriz_id UUID REFERENCES public.escritura_matrices(id) ON DELETE SET NULL,
  ADD COLUMN inherited_matriz_version INTEGER,
  ADD CONSTRAINT legal_review_decisions_origin_check
    CHECK (origin = ANY (ARRAY['human'::text, 'system'::text])),
  ADD CONSTRAINT legal_review_decisions_trigger_check
    CHECK (trigger IS NULL OR trigger = ANY (ARRAY['sale_validated'::text, 'review_approved'::text, 'manual_retry'::text])),
  ADD CONSTRAINT legal_review_decisions_system_decided_by_check
    CHECK (origin <> 'system'::text OR decided_by IS NULL),
  ADD CONSTRAINT legal_review_decisions_human_decided_by_check
    CHECK (origin <> 'human'::text OR decided_by IS NOT NULL);

COMMENT ON COLUMN public.legal_review_decisions.origin IS
  'SDD 017: human (default) o system cuando la cascada de aprobacion por excepcion tomo la decision.';
COMMENT ON COLUMN public.legal_review_decisions.trigger IS
  'SDD 017: gatillo de la cascada que produjo esta decision (solo cuando origin=system): sale_validated, review_approved o manual_retry.';
COMMENT ON COLUMN public.legal_review_decisions.inherited_from_matriz_id IS
  'SDD 017: matriz de PROYECTO (molde) vigente al momento de la aprobacion automatica del caso.';
COMMENT ON COLUMN public.legal_review_decisions.inherited_matriz_version IS
  'SDD 017: version del molde de proyecto heredada por la aprobacion automatica del caso.';
