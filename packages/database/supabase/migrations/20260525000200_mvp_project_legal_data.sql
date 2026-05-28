-- Migration: Stabilize Plotify MVP - Project Legal Data
-- Date: 2026-05-25
-- Path: packages/database/supabase/migrations/20260525000200_mvp_project_legal_data.sql

CREATE TABLE IF NOT EXISTS public.project_legal_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    dominio_cbr_fojas TEXT,
    dominio_cbr_numero TEXT,
    dominio_cbr_ano TEXT,
    dominio_fojas_vigente TEXT,
    roles JSONB DEFAULT '[]'::jsonb,
    sag_resolucion_numero TEXT,
    sag_resolucion_ano TEXT,
    sag_subdivision_aprobada BOOLEAN DEFAULT FALSE,
    plano_archivo_numero TEXT,
    matriz_cbr_fojas TEXT,
    matriz_cbr_numero TEXT,
    matriz_cbr_ano TEXT,
    personeria_notario TEXT,
    personeria_repre_nombre TEXT,
    personeria_repre_rut TEXT,
    source_document TEXT,
    review_status TEXT NOT NULL DEFAULT 'pending'::text,
    reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT project_legal_data_review_status_check CHECK (review_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))
);

-- Enable RLS
ALTER TABLE public.project_legal_data ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "project_legal_data_admin_all" ON public.project_legal_data;
DROP POLICY IF EXISTS "project_legal_data_member_read" ON public.project_legal_data;
DROP POLICY IF EXISTS "project_legal_data_service_role" ON public.project_legal_data;

-- Policies for project legal data
CREATE POLICY "project_legal_data_admin_all" ON public.project_legal_data
    USING (public.is_org_admin(organization_id))
    WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "project_legal_data_member_read" ON public.project_legal_data
    FOR SELECT
    USING (public.is_org_user(organization_id));

CREATE POLICY "project_legal_data_service_role" ON public.project_legal_data
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Validation Trigger: Enforce project and project_legal_data are under the same organization
CREATE OR REPLACE FUNCTION public.validate_project_legal_data_same_org()
RETURNS TRIGGER AS $$
DECLARE
    project_org UUID;
BEGIN
    SELECT organization_id INTO project_org
    FROM public.projects
    WHERE id = NEW.project_id;

    IF project_org IS NULL OR project_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'project_legal_data organization_id must match projects organization_id';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_legal_data_same_org ON public.project_legal_data;
CREATE TRIGGER trg_project_legal_data_same_org
    BEFORE INSERT OR UPDATE ON public.project_legal_data
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_project_legal_data_same_org();
