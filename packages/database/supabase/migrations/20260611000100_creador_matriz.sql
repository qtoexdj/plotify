-- Migration: SDD 008 Creador de Matriz y Minuta DOCX schema
-- Date: 2026-06-11
-- Path: packages/database/supabase/migrations/20260611000100_creador_matriz.sql
-- Design: specs/008-creador-matriz/data-model.md

-- ── 1. escritura_templates: biblioteca versionada por organizacion ──────

CREATE TABLE IF NOT EXISTS public.escritura_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    document_type TEXT NOT NULL DEFAULT 'compraventa',
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    published_at TIMESTAMP WITH TIME ZONE,
    published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT escritura_templates_document_type_check CHECK (document_type = ANY (ARRAY['compraventa'::text])),
    CONSTRAINT escritura_templates_status_check CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'retired'::text])),
    CONSTRAINT escritura_templates_version_positive CHECK (version >= 1),
    CONSTRAINT escritura_templates_org_name_version_key UNIQUE (organization_id, name, version)
);

-- Un solo published por (org, name)
CREATE UNIQUE INDEX IF NOT EXISTS escritura_templates_one_published_idx
ON public.escritura_templates (organization_id, name)
WHERE (status = 'published');

CREATE INDEX IF NOT EXISTS escritura_templates_org_status_idx
ON public.escritura_templates (organization_id, status);

-- ── 2. escritura_template_clauses ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.escritura_template_clauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES public.escritura_templates(id) ON DELETE CASCADE,
    clause_key TEXT NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    fixed_position BOOLEAN NOT NULL DEFAULT false,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    condition_key TEXT,
    condition_mode TEXT,
    alert_tipo TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT escritura_template_clauses_condition_mode_check CHECK (condition_mode IS NULL OR condition_mode = ANY (ARRAY['omit'::text, 'block'::text])),
    CONSTRAINT escritura_template_clauses_condition_pair_check CHECK ((condition_key IS NULL) = (condition_mode IS NULL)),
    CONSTRAINT escritura_template_clauses_alert_tipo_check CHECK (alert_tipo IS NULL OR alert_tipo = ANY (ARRAY['dl_3516'::text, 'derechos_aguas'::text, 'vigente_en_el_resto'::text, 'multi_inmueble'::text, 'gravamen'::text, 'personeria_requerida'::text, 'discrepancia_declaracion'::text, 'otro'::text])),
    CONSTRAINT escritura_template_clauses_template_key_key UNIQUE (template_id, clause_key),
    CONSTRAINT escritura_template_clauses_template_position_key UNIQUE (template_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS escritura_template_clauses_template_idx
ON public.escritura_template_clauses (template_id, position);

-- ── 3. escritura_matrices: instancia por caso de escritura ──────────────

CREATE TABLE IF NOT EXISTS public.escritura_matrices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    escritura_case_id UUID NOT NULL REFERENCES public.escritura_cases(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES public.escritura_templates(id) ON DELETE RESTRICT,
    snapshot_case_status TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    clause_order JSONB NOT NULL DEFAULT '[]'::jsonb,
    clause_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT escritura_matrices_status_check CHECK (status = ANY (ARRAY['draft'::text, 'legal_review_pending'::text, 'approved'::text, 'superseded'::text])),
    CONSTRAINT escritura_matrices_version_positive CHECK (version >= 1)
);

-- Una matriz activa por caso
CREATE UNIQUE INDEX IF NOT EXISTS escritura_matrices_one_active_idx
ON public.escritura_matrices (escritura_case_id)
WHERE (status <> 'superseded');

CREATE INDEX IF NOT EXISTS escritura_matrices_org_status_idx
ON public.escritura_matrices (organization_id, status);
CREATE INDEX IF NOT EXISTS escritura_matrices_project_idx
ON public.escritura_matrices (project_id);

-- ── 4. escritura_minuta_generations: registro inmutable de DOCX ─────────

CREATE TABLE IF NOT EXISTS public.escritura_minuta_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    escritura_case_id UUID NOT NULL REFERENCES public.escritura_cases(id) ON DELETE CASCADE,
    matriz_id UUID NOT NULL REFERENCES public.escritura_matrices(id) ON DELETE CASCADE,
    matriz_version INTEGER NOT NULL,
    template_id UUID NOT NULL REFERENCES public.escritura_templates(id) ON DELETE RESTRICT,
    snapshot_hash TEXT NOT NULL,
    resolution_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    content_hash TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    warning_acknowledged_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    warning_acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL,
    generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS escritura_minuta_generations_case_idx
ON public.escritura_minuta_generations (escritura_case_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS escritura_minuta_generations_org_idx
ON public.escritura_minuta_generations (organization_id);

-- ── Scope validation triggers ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_escritura_template_clauses_scope()
RETURNS TRIGGER AS $$
DECLARE
    template_org UUID;
BEGIN
    SELECT organization_id INTO template_org
    FROM public.escritura_templates WHERE id = NEW.template_id;
    IF template_org IS NULL OR template_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'escritura_template_clauses organization_id must match template organization_id';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_escritura_template_clauses_scope
BEFORE INSERT OR UPDATE ON public.escritura_template_clauses
FOR EACH ROW EXECUTE FUNCTION public.validate_escritura_template_clauses_scope();

CREATE OR REPLACE FUNCTION public.validate_escritura_matrices_scope()
RETURNS TRIGGER AS $$
DECLARE
    project_org UUID;
    case_org UUID;
    case_project UUID;
    template_org UUID;
BEGIN
    SELECT organization_id INTO project_org FROM public.projects WHERE id = NEW.project_id;
    IF project_org IS NULL OR project_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'escritura_matrices organization_id must match project organization_id';
    END IF;
    SELECT organization_id, project_id INTO case_org, case_project
    FROM public.escritura_cases WHERE id = NEW.escritura_case_id;
    IF case_org IS NULL OR case_org <> NEW.organization_id OR case_project <> NEW.project_id THEN
        RAISE EXCEPTION 'escritura_matrices escritura_case must belong to the same organization and project';
    END IF;
    SELECT organization_id INTO template_org
    FROM public.escritura_templates WHERE id = NEW.template_id;
    IF template_org IS NULL OR template_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'escritura_matrices template must belong to the same organization';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_escritura_matrices_scope
BEFORE INSERT OR UPDATE ON public.escritura_matrices
FOR EACH ROW EXECUTE FUNCTION public.validate_escritura_matrices_scope();

CREATE OR REPLACE FUNCTION public.validate_escritura_minuta_generations_scope()
RETURNS TRIGGER AS $$
DECLARE
    matriz_org UUID;
    matriz_project UUID;
    matriz_case UUID;
BEGIN
    SELECT organization_id, project_id, escritura_case_id
    INTO matriz_org, matriz_project, matriz_case
    FROM public.escritura_matrices WHERE id = NEW.matriz_id;
    IF matriz_org IS NULL OR matriz_org <> NEW.organization_id
        OR matriz_project <> NEW.project_id
        OR matriz_case <> NEW.escritura_case_id THEN
        RAISE EXCEPTION 'escritura_minuta_generations must match its matriz organization, project and case';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_escritura_minuta_generations_scope
BEFORE INSERT ON public.escritura_minuta_generations
FOR EACH ROW EXECUTE FUNCTION public.validate_escritura_minuta_generations_scope();

-- ── Immutability rules ───────────────────────────────────────────────────

-- Published templates: contenido congelado; solo se permite retirar
-- (status published -> retired) sin tocar name/document_type/version.
CREATE OR REPLACE FUNCTION public.enforce_escritura_template_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'published' THEN
        IF NEW.status = 'published' AND ROW(NEW.name, NEW.document_type, NEW.version) IS DISTINCT FROM ROW(OLD.name, OLD.document_type, OLD.version) THEN
            RAISE EXCEPTION 'published escritura_templates are immutable; clone to a new draft version';
        END IF;
        IF NEW.status NOT IN ('published', 'retired') THEN
            RAISE EXCEPTION 'published escritura_templates can only transition to retired';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_escritura_templates_immutability
BEFORE UPDATE ON public.escritura_templates
FOR EACH ROW EXECUTE FUNCTION public.enforce_escritura_template_immutability();

-- Clauses of a published/retired template are frozen.
CREATE OR REPLACE FUNCTION public.enforce_escritura_clause_immutability()
RETURNS TRIGGER AS $$
DECLARE
    template_status TEXT;
    target_template UUID;
BEGIN
    target_template := COALESCE(NEW.template_id, OLD.template_id);
    SELECT status INTO template_status
    FROM public.escritura_templates WHERE id = target_template;
    IF template_status IN ('published', 'retired') THEN
        RAISE EXCEPTION 'clauses of a % escritura_template are immutable', template_status;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_escritura_template_clauses_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.escritura_template_clauses
FOR EACH ROW EXECUTE FUNCTION public.enforce_escritura_clause_immutability();

-- Minuta generations are append-only.
CREATE OR REPLACE FUNCTION public.enforce_minuta_generation_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'escritura_minuta_generations is append-only';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_escritura_minuta_generations_immutability
BEFORE UPDATE OR DELETE ON public.escritura_minuta_generations
FOR EACH ROW EXECUTE FUNCTION public.enforce_minuta_generation_immutability();

-- ── updated_at triggers ──────────────────────────────────────────────────

CREATE TRIGGER trg_escritura_templates_update_timestamp
BEFORE UPDATE ON public.escritura_templates
FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

CREATE TRIGGER trg_escritura_template_clauses_update_timestamp
BEFORE UPDATE ON public.escritura_template_clauses
FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

CREATE TRIGGER trg_escritura_matrices_update_timestamp
BEFORE UPDATE ON public.escritura_matrices
FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

-- ── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.escritura_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escritura_template_clauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escritura_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escritura_minuta_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY escritura_templates_admin_all ON public.escritura_templates
FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin())
WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());

CREATE POLICY escritura_templates_member_select ON public.escritura_templates
FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());

CREATE POLICY escritura_templates_service_role ON public.escritura_templates
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY escritura_template_clauses_admin_all ON public.escritura_template_clauses
FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin())
WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());

CREATE POLICY escritura_template_clauses_member_select ON public.escritura_template_clauses
FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());

CREATE POLICY escritura_template_clauses_service_role ON public.escritura_template_clauses
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY escritura_matrices_admin_all ON public.escritura_matrices
FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin())
WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());

CREATE POLICY escritura_matrices_member_select ON public.escritura_matrices
FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());

CREATE POLICY escritura_matrices_service_role ON public.escritura_matrices
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY escritura_minuta_generations_admin_all ON public.escritura_minuta_generations
FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin())
WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());

CREATE POLICY escritura_minuta_generations_member_select ON public.escritura_minuta_generations
FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());

CREATE POLICY escritura_minuta_generations_service_role ON public.escritura_minuta_generations
TO service_role USING (true) WITH CHECK (true);

-- ── legal_review_decisions: nuevos decision types de matriz ─────────────

ALTER TABLE public.legal_review_decisions
    DROP CONSTRAINT IF EXISTS legal_review_decisions_decision_type_check;

ALTER TABLE public.legal_review_decisions
    ADD CONSTRAINT legal_review_decisions_decision_type_check CHECK (decision_type = ANY (ARRAY[
        'approve_variable'::text,
        'reject_variable'::text,
        'manual_override'::text,
        'approve_case'::text,
        'reject_case'::text,
        'assign_lawyer'::text,
        'mark_not_applicable'::text,
        'title_block_edited'::text,
        'title_case_approved'::text,
        'title_alert_resolved'::text,
        'matriz_submitted'::text,
        'matriz_approved'::text,
        'matriz_rejected'::text
    ]));

-- Comments
COMMENT ON TABLE public.escritura_templates IS 'SDD 008: biblioteca versionada de plantillas de matriz (publicadas = inmutables).';
COMMENT ON TABLE public.escritura_template_clauses IS 'SDD 008: clausulas ProseMirror JSON de una version de plantilla.';
COMMENT ON TABLE public.escritura_matrices IS 'SDD 008: matriz por caso de escritura (orden/overrides, optimistic locking via version).';
COMMENT ON TABLE public.escritura_minuta_generations IS 'SDD 008: registro append-only de generaciones de minuta DOCX desde snapshot aprobado.';
COMMENT ON COLUMN public.escritura_matrices.snapshot_hash IS 'Hash del variable_snapshot del caso al vincular; divergencia => snapshot_stale (FR-014).';
