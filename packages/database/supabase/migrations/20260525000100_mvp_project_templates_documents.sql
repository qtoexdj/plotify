-- Migration: Stabilize Plotify MVP - Project Active Templates, Versioning & Delivery
-- Date: 2026-05-25
-- Path: packages/database/supabase/migrations/20260525000100_mvp_project_templates_documents.sql

-- ── 1. ACTIVE PROJECT TEMPLATE (T005) ──
CREATE TABLE IF NOT EXISTS public.project_active_templates (
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    template_id UUID NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    PRIMARY KEY (project_id, document_type),
    CONSTRAINT project_active_templates_document_type_check CHECK (document_type = ANY (ARRAY['escritura'::text, 'reserva'::text, 'promesa'::text, 'deslinde'::text, 'otro'::text]))
);

-- Enable RLS
ALTER TABLE public.project_active_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "project_active_templates_admin_all" ON public.project_active_templates;
DROP POLICY IF EXISTS "project_active_templates_member_read" ON public.project_active_templates;
DROP POLICY IF EXISTS "project_active_templates_service_role" ON public.project_active_templates;

-- Policies for project active templates
CREATE POLICY "project_active_templates_admin_all" ON public.project_active_templates
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_active_templates.project_id
            AND public.is_org_admin(p.organization_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_active_templates.project_id
            AND public.is_org_admin(p.organization_id)
        )
    );

CREATE POLICY "project_active_templates_member_read" ON public.project_active_templates
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = project_active_templates.project_id
            AND public.is_org_user(p.organization_id)
        )
    );

CREATE POLICY "project_active_templates_service_role" ON public.project_active_templates
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.validate_project_active_template_same_org()
RETURNS TRIGGER AS $$
DECLARE
    project_org UUID;
    template_org UUID;
BEGIN
    SELECT organization_id INTO project_org
    FROM public.projects
    WHERE id = NEW.project_id;

    SELECT organization_id INTO template_org
    FROM public.document_templates
    WHERE id = NEW.template_id;

    IF project_org IS NULL OR template_org IS NULL OR project_org <> template_org THEN
        RAISE EXCEPTION 'project_active_templates template_id must belong to the same organization as project_id';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_active_templates_same_org ON public.project_active_templates;
CREATE TRIGGER trg_project_active_templates_same_org
    BEFORE INSERT OR UPDATE ON public.project_active_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_project_active_template_same_org();


-- ── 2. GENERATED DOCUMENT VERSIONING & DELIVERY (T006 & T099) ──
ALTER TABLE public.generated_documents
    ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS missing_variables_accepted BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS missing_variables JSONB DEFAULT '[]'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS selected_recipients TEXT[] DEFAULT '{}'::text[] NOT NULL,
    ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending'::text NOT NULL,
    ADD COLUMN IF NOT EXISTS delivery_failed_attempts INTEGER DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS delivery_error_message TEXT,
    ADD COLUMN IF NOT EXISTS delivery_metadata JSONB DEFAULT '{}'::jsonb NOT NULL;

-- Add constraints for delivery status if not exists
ALTER TABLE public.generated_documents
    DROP CONSTRAINT IF EXISTS generated_documents_delivery_status_check;

ALTER TABLE public.generated_documents
    ADD CONSTRAINT generated_documents_delivery_status_check 
    CHECK (delivery_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]));

CREATE INDEX IF NOT EXISTS generated_documents_version_lookup_idx
    ON public.generated_documents (lot_id, template_id, document_type, version_number DESC);
