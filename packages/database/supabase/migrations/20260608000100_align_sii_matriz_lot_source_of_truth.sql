-- Migration: Align SII Matriz Lot Source Of Truth
-- Date: 2026-06-08
-- Path: packages/database/supabase/migrations/20260608000100_align_sii_matriz_lot_source_of_truth.sql

-- 1. Alter project_legal_data table to add new columns for common SII matriz fields
ALTER TABLE public.project_legal_data
ADD COLUMN IF NOT EXISTS sii_comuna TEXT,
ADD COLUMN IF NOT EXISTS sii_role_matrix TEXT,
ADD COLUMN IF NOT EXISTS sii_roles_source_legal_document_id UUID REFERENCES public.legal_documents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sii_roles_status TEXT CONSTRAINT project_legal_data_sii_roles_status_check CHECK (sii_roles_status IS NULL OR sii_roles_status = ANY (ARRAY['pending'::text, 'variables_proposed'::text, 'needs_review'::text, 'approved'::text, 'failed'::text]));

-- 2. Validation Function for tenant/scope on project_legal_data
CREATE OR REPLACE FUNCTION public.validate_project_legal_data_sii_scope()
RETURNS TRIGGER AS $$
DECLARE
    doc_org UUID;
    doc_project UUID;
BEGIN
    -- Verify new SII roles source legal document scope if provided
    IF NEW.sii_roles_source_legal_document_id IS NOT NULL THEN
        SELECT organization_id, project_id INTO doc_org, doc_project
        FROM public.legal_documents
        WHERE id = NEW.sii_roles_source_legal_document_id;

        IF doc_org IS NULL OR doc_org <> NEW.organization_id OR doc_project <> NEW.project_id THEN
            RAISE EXCEPTION 'project_legal_data sii_roles_source_legal_document_id scope mismatch against project or organization';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Create Trigger for the scope check
DROP TRIGGER IF EXISTS trg_project_legal_data_sii_scope ON public.project_legal_data;
CREATE TRIGGER trg_project_legal_data_sii_scope
    BEFORE INSERT OR UPDATE ON public.project_legal_data
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_project_legal_data_sii_scope();
