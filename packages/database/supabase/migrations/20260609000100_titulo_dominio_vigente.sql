-- Migration: SDD 009 Titulo Dominio Vigente schema
-- Date: 2026-06-09
-- Path: packages/database/supabase/migrations/20260609000100_titulo_dominio_vigente.sql

CREATE TABLE IF NOT EXISTS public.title_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    structure_type TEXT,
    analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    narrative_comparecencia_generated TEXT,
    narrative_comparecencia_edited TEXT,
    narrative_primero_generated TEXT,
    narrative_primero_edited TEXT,
    alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
    verification_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_document_ids UUID[] NOT NULL,
    source_content_hash TEXT NOT NULL,
    extractor_name TEXT NOT NULL,
    model_name TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    token_usage JSONB,
    duration_ms INTEGER,
    failure_code TEXT,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    superseded_by_id UUID REFERENCES public.title_analyses(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT title_analyses_status_check CHECK (status = ANY (ARRAY['processing'::text, 'proposed'::text, 'needs_review'::text, 'failed'::text, 'llm_disabled'::text, 'approved'::text, 'superseded'::text])),
    CONSTRAINT title_analyses_structure_type_check CHECK (structure_type IS NULL OR structure_type = ANY (ARRAY['dominio_unico'::text, 'multiples_dominios'::text, 'compra_derechos'::text, 'herencia'::text, 'mixto'::text])),
    CONSTRAINT title_analyses_failure_code_check CHECK (failure_code IS NULL OR failure_code = ANY (ARRAY['timeout'::text, 'schema_invalid'::text, 'ocr_required'::text, 'input_too_large'::text, 'llm_error'::text]))
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS title_analyses_one_active_idx ON public.title_analyses (project_id) 
WHERE (status <> ALL (ARRAY['superseded'::text, 'failed'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS title_analyses_idempotency_idx ON public.title_analyses (project_id, source_content_hash, extractor_name, prompt_version);

CREATE INDEX IF NOT EXISTS title_analyses_org_status_idx ON public.title_analyses (organization_id, status);
CREATE INDEX IF NOT EXISTS title_analyses_project_idx ON public.title_analyses (project_id);

-- Validation Function & Trigger for Scope
CREATE OR REPLACE FUNCTION public.validate_title_analyses_scope()
RETURNS TRIGGER AS $$
DECLARE
    project_org UUID;
BEGIN
    SELECT organization_id INTO project_org FROM public.projects WHERE id = NEW.project_id;
    IF project_org IS NULL OR project_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'title_analyses organization_id must match project organization_id';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_title_analyses_scope 
BEFORE INSERT OR UPDATE ON public.title_analyses 
FOR EACH ROW EXECUTE FUNCTION public.validate_title_analyses_scope();

-- Update Timestamp Trigger
CREATE TRIGGER trg_title_analyses_update_timestamp 
BEFORE UPDATE ON public.title_analyses 
FOR EACH ROW EXECUTE FUNCTION public.handle_update_timestamp();

-- Enable RLS
ALTER TABLE public.title_analyses ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY title_analyses_admin_all ON public.title_analyses 
FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin()) 
WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());

CREATE POLICY title_analyses_member_select ON public.title_analyses 
FOR SELECT USING (public.is_org_user(organization_id) OR public.is_super_admin());

CREATE POLICY title_analyses_service_role ON public.title_analyses 
TO service_role USING (true) WITH CHECK (true);

-- Cleanup superseded variables from previous catalog design
UPDATE public.variable_resolutions
SET state = 'superseded', updated_at = now()
WHERE variable_key IN (
    'matriz.inscripcion_fojas',
    'matriz.inscripcion_numero',
    'matriz.inscripcion_anio',
    'matriz.inscripcion_cbr',
    'matriz.adquisicion_modo',
    'matriz.adquisicion_notaria',
    'matriz.adquisicion_fecha',
    'matriz.adquisicion_repertorio'
) AND state <> 'superseded';
