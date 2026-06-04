-- Migration: SDD 007 Escrituras Variable Resolution schema
-- Date: 2026-06-03
-- Path: packages/database/supabase/migrations/20260603000100_escrituras_variable_resolution.sql
CREATE TABLE IF NOT EXISTS public.legal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    lot_id UUID REFERENCES public.lots(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    source_field TEXT,
    storage_bucket TEXT NOT NULL DEFAULT 'project-files',
    storage_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_hash TEXT NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    upload_source TEXT NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    extraction_status TEXT NOT NULL DEFAULT 'pending',
    superseded_by UUID REFERENCES public.legal_documents(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT legal_documents_document_type_check CHECK (document_type = ANY (ARRAY['dominio_vigente'::text, 'hipoteca_gravamen'::text, 'certificado_roles_sii'::text, 'certificado_sag'::text, 'plano_oficial'::text, 'personeria'::text, 'rnda'::text, 'instruccion_pago'::text, 'otro'::text])),
    CONSTRAINT legal_documents_extraction_status_check CHECK (extraction_status = ANY (ARRAY['pending'::text, 'queued'::text, 'processing'::text, 'text_extracted'::text, 'variables_proposed'::text, 'needs_review'::text, 'failed'::text, 'superseded'::text])),
    CONSTRAINT legal_documents_upload_source_check CHECK (upload_source = ANY (ARRAY['onboarding'::text, 'project_documents'::text, 'legal_control_center'::text, 'api'::text])),
    CONSTRAINT legal_documents_file_size_check CHECK (file_size_bytes > 0),
    CONSTRAINT legal_documents_version_number_check CHECK (version_number > 0)
);
CREATE TABLE IF NOT EXISTS public.document_ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    legal_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    pipeline_version TEXT NOT NULL DEFAULT 'sdd_007_v1',
    converter TEXT,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_code TEXT,
    error_message TEXT,
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT document_ingestion_jobs_status_check CHECK (status = ANY (ARRAY['queued'::text, 'processing'::text, 'text_extracted'::text, 'variables_proposed'::text, 'failed'::text, 'cancelled'::text])),
    CONSTRAINT document_ingestion_jobs_converter_check CHECK (converter IS NULL OR converter = ANY (ARRAY['pdf_text'::text, 'ocr'::text, 'docx'::text, 'textutil_doc'::text, 'manual'::text])),
    CONSTRAINT document_ingestion_jobs_attempt_check CHECK (attempt_number > 0)
);
CREATE TABLE IF NOT EXISTS public.legal_document_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    legal_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    ingestion_job_id UUID NOT NULL REFERENCES public.document_ingestion_jobs(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    page_kind TEXT NOT NULL DEFAULT 'physical',
    text_content TEXT NOT NULL DEFAULT '',
    markdown_content TEXT,
    char_count INTEGER NOT NULL DEFAULT 0,
    checksum TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT legal_document_pages_page_kind_check CHECK (page_kind = ANY (ARRAY['physical'::text, 'logical'::text, 'ocr_image'::text])),
    CONSTRAINT legal_document_pages_page_number_check CHECK (page_number > 0),
    CONSTRAINT legal_document_pages_char_count_check CHECK (char_count >= 0)
);
CREATE TABLE IF NOT EXISTS public.lot_legal_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    lot_id UUID NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
    sii_unit_name TEXT,
    sii_role_matrix TEXT,
    sii_pre_role TEXT,
    sii_role_in_process_text TEXT,
    sii_definitive_role TEXT,
    role_status TEXT NOT NULL DEFAULT 'missing',
    matching_status TEXT NOT NULL DEFAULT 'missing',
    matching_score NUMERIC,
    source_legal_document_id UUID REFERENCES public.legal_documents(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT lot_legal_data_role_status_check CHECK (role_status = ANY (ARRAY['missing'::text, 'rol_en_tramite'::text, 'definitive'::text, 'not_applicable'::text])),
    CONSTRAINT lot_legal_data_matching_status_check CHECK (matching_status = ANY (ARRAY['matched'::text, 'ambiguous'::text, 'missing'::text, 'manual_override'::text])),
    CONSTRAINT lot_legal_data_matching_score_check CHECK (matching_score IS NULL OR matching_score BETWEEN 0 AND 1),
    CONSTRAINT lot_legal_data_lot_key UNIQUE (lot_id)
);
CREATE TABLE IF NOT EXISTS public.escritura_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    lot_id UUID NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
    case_status TEXT NOT NULL DEFAULT 'draft',
    readiness_status TEXT NOT NULL DEFAULT 'blocked',
    readiness_gates JSONB NOT NULL DEFAULT '{}'::jsonb,
    variable_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    template_id UUID REFERENCES public.document_templates(id) ON DELETE SET NULL,
    generated_document_id UUID REFERENCES public.generated_documents(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT escritura_cases_case_status_check CHECK (case_status = ANY (ARRAY['draft'::text, 'variables_pending'::text, 'ready_for_minuta'::text, 'minuta_generated'::text, 'legal_review_pending'::text, 'minuta_approved'::text, 'sent_to_external'::text, 'cancelled'::text])),
    CONSTRAINT escritura_cases_readiness_status_check CHECK (readiness_status = ANY (ARRAY['blocked'::text, 'needs_review'::text, 'ready'::text]))
);
CREATE TABLE IF NOT EXISTS public.variable_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    lot_id UUID REFERENCES public.lots(id) ON DELETE CASCADE,
    escritura_case_id UUID REFERENCES public.escritura_cases(id) ON DELETE CASCADE,
    variable_key TEXT NOT NULL,
    variable_group TEXT NOT NULL,
    value_text TEXT,
    value_json JSONB,
    state TEXT NOT NULL DEFAULT 'missing',
    source_type TEXT NOT NULL DEFAULT 'system',
    source_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence NUMERIC,
    extractor_name TEXT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    approval_required BOOLEAN NOT NULL DEFAULT false,
    correction_reason TEXT,
    superseded_by UUID REFERENCES public.variable_resolutions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT variable_resolutions_state_check CHECK (state = ANY (ARRAY['missing'::text, 'proposed'::text, 'resolved'::text, 'approved'::text, 'manual_review'::text, 'conflict'::text, 'derived'::text, 'not_applicable'::text, 'superseded'::text])),
    CONSTRAINT variable_resolutions_source_type_check CHECK (source_type = ANY (ARRAY['document'::text, 'system'::text, 'geometry'::text, 'derived'::text, 'manual'::text, 'legal_review'::text, 'post_minuta'::text])),
    CONSTRAINT variable_resolutions_confidence_check CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CONSTRAINT variable_resolutions_key_not_blank CHECK (length(btrim(variable_key)) > 0),
    CONSTRAINT variable_resolutions_group_not_blank CHECK (length(btrim(variable_group)) > 0),
    CONSTRAINT variable_resolutions_approved_review_check CHECK (state <> 'approved'::text OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.document_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    variable_resolution_id UUID NOT NULL REFERENCES public.variable_resolutions(id) ON DELETE CASCADE,
    legal_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    legal_document_page_id UUID REFERENCES public.legal_document_pages(id) ON DELETE SET NULL,
    chunk_index INTEGER,
    snippet TEXT,
    snippet_hash TEXT NOT NULL,
    bbox JSONB,
    confidence NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT document_evidence_chunk_index_check CHECK (chunk_index IS NULL OR chunk_index >= 0),
    CONSTRAINT document_evidence_confidence_check CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
);
CREATE TABLE IF NOT EXISTS public.legal_review_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    lot_id UUID REFERENCES public.lots(id) ON DELETE CASCADE,
    escritura_case_id UUID REFERENCES public.escritura_cases(id) ON DELETE CASCADE,
    variable_resolution_id UUID REFERENCES public.variable_resolutions(id) ON DELETE SET NULL,
    decision_type TEXT NOT NULL,
    decision_status TEXT NOT NULL,
    reason TEXT,
    lawyer_name TEXT,
    lawyer_rut TEXT,
    lawyer_email TEXT,
    decided_by UUID NOT NULL REFERENCES auth.users(id),
    decided_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT legal_review_decisions_decision_type_check CHECK (decision_type = ANY (ARRAY['approve_variable'::text, 'reject_variable'::text, 'manual_override'::text, 'approve_case'::text, 'reject_case'::text, 'assign_lawyer'::text, 'mark_not_applicable'::text])),
    CONSTRAINT legal_review_decisions_status_check CHECK (decision_status = ANY (ARRAY['approved'::text, 'rejected'::text, 'needs_changes'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS document_ingestion_jobs_one_active_idx ON public.document_ingestion_jobs (legal_document_id) WHERE status = ANY (ARRAY['queued'::text, 'processing'::text]);
CREATE UNIQUE INDEX IF NOT EXISTS legal_document_pages_document_job_page_idx ON public.legal_document_pages (legal_document_id, ingestion_job_id, page_number);
CREATE UNIQUE INDEX IF NOT EXISTS variable_resolutions_active_scope_idx ON public.variable_resolutions (project_id, COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(escritura_case_id, '00000000-0000-0000-0000-000000000000'::uuid), variable_key) WHERE state <> 'superseded'::text;
CREATE UNIQUE INDEX IF NOT EXISTS escritura_cases_one_active_lot_idx ON public.escritura_cases (lot_id) WHERE case_status <> 'cancelled'::text;
CREATE INDEX IF NOT EXISTS legal_documents_project_type_version_idx ON public.legal_documents (project_id, document_type, version_number DESC);
CREATE INDEX IF NOT EXISTS legal_documents_org_status_idx ON public.legal_documents (organization_id, extraction_status);
CREATE INDEX IF NOT EXISTS document_ingestion_jobs_org_status_idx ON public.document_ingestion_jobs (organization_id, status);
CREATE INDEX IF NOT EXISTS legal_document_pages_document_idx ON public.legal_document_pages (legal_document_id, page_number);
CREATE INDEX IF NOT EXISTS variable_resolutions_project_state_idx ON public.variable_resolutions (project_id, state, variable_group);
CREATE INDEX IF NOT EXISTS variable_resolutions_lot_idx ON public.variable_resolutions (lot_id) WHERE lot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_evidence_variable_idx ON public.document_evidence (variable_resolution_id);
CREATE INDEX IF NOT EXISTS document_evidence_document_idx ON public.document_evidence (legal_document_id);
CREATE INDEX IF NOT EXISTS lot_legal_data_project_status_idx ON public.lot_legal_data (project_id, matching_status, role_status);
CREATE INDEX IF NOT EXISTS escritura_cases_project_status_idx ON public.escritura_cases (project_id, case_status, readiness_status);
CREATE INDEX IF NOT EXISTS legal_review_decisions_project_idx ON public.legal_review_decisions (project_id, decided_at DESC);
CREATE OR REPLACE FUNCTION public.assert_sdd_007_project_lot_scope(
    table_name TEXT,
    target_organization_id UUID,
    target_project_id UUID,
    target_lot_id UUID
)
RETURNS VOID AS $$
DECLARE
    project_org UUID;
    lot_project UUID;
BEGIN
    SELECT organization_id INTO project_org FROM public.projects WHERE id = target_project_id;
    IF project_org IS NULL OR project_org <> target_organization_id THEN
        RAISE EXCEPTION '% organization_id must match project organization_id', table_name;
    END IF;
    IF target_lot_id IS NOT NULL THEN
        SELECT project_id INTO lot_project FROM public.lots WHERE id = target_lot_id;
        IF lot_project IS NULL OR lot_project <> target_project_id THEN
            RAISE EXCEPTION '% lot_id must belong to project_id', table_name;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.validate_sdd_007_project_lot_scope()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.assert_sdd_007_project_lot_scope(TG_TABLE_NAME, NEW.organization_id, NEW.project_id, NEW.lot_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.validate_document_ingestion_job_scope()
RETURNS TRIGGER AS $$
DECLARE
    doc_org UUID;
    doc_project UUID;
BEGIN
    SELECT organization_id, project_id INTO doc_org, doc_project FROM public.legal_documents WHERE id = NEW.legal_document_id;
    IF doc_org IS NULL OR doc_org <> NEW.organization_id OR doc_project <> NEW.project_id THEN
        RAISE EXCEPTION 'document_ingestion_jobs legal_document_id must match organization_id and project_id';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.validate_legal_document_page_scope()
RETURNS TRIGGER AS $$
DECLARE
    doc_org UUID;
    doc_project UUID;
    job_doc UUID;
BEGIN
    SELECT organization_id, project_id INTO doc_org, doc_project FROM public.legal_documents WHERE id = NEW.legal_document_id;
    SELECT legal_document_id INTO job_doc FROM public.document_ingestion_jobs WHERE id = NEW.ingestion_job_id;
    IF doc_org IS NULL OR doc_org <> NEW.organization_id OR doc_project <> NEW.project_id OR job_doc <> NEW.legal_document_id THEN
        RAISE EXCEPTION 'legal_document_pages document/job scope mismatch';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.validate_lot_legal_data_scope()
RETURNS TRIGGER AS $$
DECLARE
    doc_org UUID;
    doc_project UUID;
BEGIN
    PERFORM public.assert_sdd_007_project_lot_scope(TG_TABLE_NAME, NEW.organization_id, NEW.project_id, NEW.lot_id);
    IF NEW.source_legal_document_id IS NOT NULL THEN
        SELECT organization_id, project_id INTO doc_org, doc_project FROM public.legal_documents WHERE id = NEW.source_legal_document_id;
        IF doc_org IS NULL OR doc_org <> NEW.organization_id OR doc_project <> NEW.project_id THEN
            RAISE EXCEPTION 'lot_legal_data source_legal_document_id scope mismatch';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.validate_escritura_case_scope()
RETURNS TRIGGER AS $$
DECLARE
    template_org UUID;
    doc_org UUID;
    doc_lot UUID;
BEGIN
    PERFORM public.assert_sdd_007_project_lot_scope(TG_TABLE_NAME, NEW.organization_id, NEW.project_id, NEW.lot_id);
    IF NEW.template_id IS NOT NULL THEN
        SELECT organization_id INTO template_org FROM public.document_templates WHERE id = NEW.template_id;
        IF template_org IS NULL OR template_org <> NEW.organization_id THEN
            RAISE EXCEPTION 'escritura_cases template_id scope mismatch';
        END IF;
    END IF;
    IF NEW.generated_document_id IS NOT NULL THEN
        SELECT organization_id, lot_id INTO doc_org, doc_lot FROM public.generated_documents WHERE id = NEW.generated_document_id;
        IF doc_org IS NULL OR doc_org <> NEW.organization_id OR doc_lot <> NEW.lot_id THEN
            RAISE EXCEPTION 'escritura_cases generated_document_id scope mismatch';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.validate_variable_resolution_scope()
RETURNS TRIGGER AS $$
DECLARE
    case_org UUID;
    case_project UUID;
    case_lot UUID;
BEGIN
    PERFORM public.assert_sdd_007_project_lot_scope(TG_TABLE_NAME, NEW.organization_id, NEW.project_id, NEW.lot_id);
    IF NEW.escritura_case_id IS NOT NULL THEN
        SELECT organization_id, project_id, lot_id INTO case_org, case_project, case_lot FROM public.escritura_cases WHERE id = NEW.escritura_case_id;
        IF case_org IS NULL OR case_org <> NEW.organization_id OR case_project <> NEW.project_id OR (NEW.lot_id IS NOT NULL AND case_lot <> NEW.lot_id) THEN
            RAISE EXCEPTION 'variable_resolutions escritura_case_id scope mismatch';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.validate_document_evidence_scope()
RETURNS TRIGGER AS $$
DECLARE
    variable_org UUID;
    variable_project UUID;
    doc_org UUID;
    doc_project UUID;
    page_doc UUID;
BEGIN
    SELECT organization_id, project_id INTO variable_org, variable_project FROM public.variable_resolutions WHERE id = NEW.variable_resolution_id;
    SELECT organization_id, project_id INTO doc_org, doc_project FROM public.legal_documents WHERE id = NEW.legal_document_id;
    IF NEW.legal_document_page_id IS NOT NULL THEN
        SELECT legal_document_id INTO page_doc FROM public.legal_document_pages WHERE id = NEW.legal_document_page_id;
    END IF;
    IF variable_org IS NULL OR variable_org <> NEW.organization_id OR variable_project <> NEW.project_id OR doc_org <> NEW.organization_id OR doc_project <> NEW.project_id OR (NEW.legal_document_page_id IS NOT NULL AND page_doc <> NEW.legal_document_id) THEN
        RAISE EXCEPTION 'document_evidence scope mismatch';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.validate_legal_review_decision_scope()
RETURNS TRIGGER AS $$
DECLARE
    case_org UUID;
    case_project UUID;
    variable_org UUID;
    variable_project UUID;
BEGIN
    PERFORM public.assert_sdd_007_project_lot_scope(TG_TABLE_NAME, NEW.organization_id, NEW.project_id, NEW.lot_id);
    IF NEW.escritura_case_id IS NOT NULL THEN
        SELECT organization_id, project_id INTO case_org, case_project FROM public.escritura_cases WHERE id = NEW.escritura_case_id;
        IF case_org IS NULL OR case_org <> NEW.organization_id OR case_project <> NEW.project_id THEN
            RAISE EXCEPTION 'legal_review_decisions escritura_case_id scope mismatch';
        END IF;
    END IF;
    IF NEW.variable_resolution_id IS NOT NULL THEN
        SELECT organization_id, project_id INTO variable_org, variable_project FROM public.variable_resolutions WHERE id = NEW.variable_resolution_id;
        IF variable_org IS NULL OR variable_org <> NEW.organization_id OR variable_project <> NEW.project_id THEN
            RAISE EXCEPTION 'legal_review_decisions variable_resolution_id scope mismatch';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER trg_legal_documents_scope BEFORE INSERT OR UPDATE ON public.legal_documents FOR EACH ROW EXECUTE FUNCTION public.validate_sdd_007_project_lot_scope();
CREATE TRIGGER trg_document_ingestion_jobs_scope BEFORE INSERT OR UPDATE ON public.document_ingestion_jobs FOR EACH ROW EXECUTE FUNCTION public.validate_document_ingestion_job_scope();
CREATE TRIGGER trg_legal_document_pages_scope BEFORE INSERT OR UPDATE ON public.legal_document_pages FOR EACH ROW EXECUTE FUNCTION public.validate_legal_document_page_scope();
CREATE TRIGGER trg_lot_legal_data_scope BEFORE INSERT OR UPDATE ON public.lot_legal_data FOR EACH ROW EXECUTE FUNCTION public.validate_lot_legal_data_scope();
CREATE TRIGGER trg_escritura_cases_scope BEFORE INSERT OR UPDATE ON public.escritura_cases FOR EACH ROW EXECUTE FUNCTION public.validate_escritura_case_scope();
CREATE TRIGGER trg_variable_resolutions_scope BEFORE INSERT OR UPDATE ON public.variable_resolutions FOR EACH ROW EXECUTE FUNCTION public.validate_variable_resolution_scope();
CREATE TRIGGER trg_document_evidence_scope BEFORE INSERT OR UPDATE ON public.document_evidence FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_scope();
CREATE TRIGGER trg_legal_review_decisions_scope BEFORE INSERT OR UPDATE ON public.legal_review_decisions FOR EACH ROW EXECUTE FUNCTION public.validate_legal_review_decision_scope();
CREATE TRIGGER trg_legal_documents_update_timestamp BEFORE UPDATE ON public.legal_documents FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();
CREATE TRIGGER trg_document_ingestion_jobs_update_timestamp BEFORE UPDATE ON public.document_ingestion_jobs FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();
CREATE TRIGGER trg_lot_legal_data_update_timestamp BEFORE UPDATE ON public.lot_legal_data FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();
CREATE TRIGGER trg_escritura_cases_update_timestamp BEFORE UPDATE ON public.escritura_cases FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();
CREATE TRIGGER trg_variable_resolutions_update_timestamp BEFORE UPDATE ON public.variable_resolutions FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variable_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_legal_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escritura_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_review_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY legal_documents_admin_all ON public.legal_documents FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin()) WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());
CREATE POLICY legal_documents_member_select ON public.legal_documents FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());
CREATE POLICY legal_documents_service_role ON public.legal_documents TO service_role USING (true) WITH CHECK (true);
CREATE POLICY document_ingestion_jobs_admin_all ON public.document_ingestion_jobs FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin()) WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());
CREATE POLICY document_ingestion_jobs_member_select ON public.document_ingestion_jobs FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());
CREATE POLICY document_ingestion_jobs_service_role ON public.document_ingestion_jobs TO service_role USING (true) WITH CHECK (true);
CREATE POLICY legal_document_pages_admin_all ON public.legal_document_pages FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin()) WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());
CREATE POLICY legal_document_pages_member_select ON public.legal_document_pages FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());
CREATE POLICY legal_document_pages_service_role ON public.legal_document_pages TO service_role USING (true) WITH CHECK (true);
CREATE POLICY variable_resolutions_admin_all ON public.variable_resolutions FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin()) WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());
CREATE POLICY variable_resolutions_member_select ON public.variable_resolutions FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());
CREATE POLICY variable_resolutions_service_role ON public.variable_resolutions TO service_role USING (true) WITH CHECK (true);
CREATE POLICY document_evidence_admin_all ON public.document_evidence FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin()) WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());
CREATE POLICY document_evidence_member_select ON public.document_evidence FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());
CREATE POLICY document_evidence_service_role ON public.document_evidence TO service_role USING (true) WITH CHECK (true);
CREATE POLICY lot_legal_data_admin_all ON public.lot_legal_data FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin()) WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());
CREATE POLICY lot_legal_data_member_select ON public.lot_legal_data FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());
CREATE POLICY lot_legal_data_service_role ON public.lot_legal_data TO service_role USING (true) WITH CHECK (true);
CREATE POLICY escritura_cases_admin_all ON public.escritura_cases FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin()) WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());
CREATE POLICY escritura_cases_member_select ON public.escritura_cases FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());
CREATE POLICY escritura_cases_service_role ON public.escritura_cases TO service_role USING (true) WITH CHECK (true);
CREATE POLICY legal_review_decisions_admin_insert ON public.legal_review_decisions FOR INSERT WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());
CREATE POLICY legal_review_decisions_member_select ON public.legal_review_decisions FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());
CREATE POLICY legal_review_decisions_service_role ON public.legal_review_decisions TO service_role USING (true) WITH CHECK (true);
