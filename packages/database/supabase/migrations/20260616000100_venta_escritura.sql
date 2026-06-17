-- Migration: SDD 011 Venta -> Escritura — matriz scope-proyecto + entregas
-- Date: 2026-06-16
-- Path: packages/database/supabase/migrations/20260616000100_venta_escritura.sql
-- Design: specs/011-venta-escritura/data-model.md (§1, §4)

-- ── 1. escritura_matrices: habilitar scope PROYECTO (escritura_case_id NULL) ──

ALTER TABLE public.escritura_matrices
    ALTER COLUMN escritura_case_id DROP NOT NULL;

ALTER TABLE public.escritura_matrices
    ADD COLUMN IF NOT EXISTS source_project_matriz_id UUID
        REFERENCES public.escritura_matrices(id) ON DELETE SET NULL;

-- Una matriz de PROYECTO activa por proyecto (scope proyecto = case_id NULL).
-- El indice "una activa por caso" existente ya excluye los NULL por la
-- semantica de UNIQUE en Postgres, asi que no colisiona.
CREATE UNIQUE INDEX IF NOT EXISTS escritura_matrices_one_active_project_idx
ON public.escritura_matrices (project_id)
WHERE (escritura_case_id IS NULL AND status <> 'superseded');

CREATE INDEX IF NOT EXISTS escritura_matrices_source_project_idx
ON public.escritura_matrices (source_project_matriz_id)
WHERE (source_project_matriz_id IS NOT NULL);

-- El trigger de scope exigia escritura_case_id no nulo. Ahora la matriz de
-- proyecto (case_id NULL) es valida: el caso se valida solo cuando existe, y
-- source_project_matriz_id (si existe) debe ser una matriz de proyecto del
-- mismo org/proyecto (FR-012, traza de instanciacion del borrador del lote).
CREATE OR REPLACE FUNCTION public.validate_escritura_matrices_scope()
RETURNS TRIGGER AS $$
DECLARE
    project_org UUID;
    case_org UUID;
    case_project UUID;
    template_org UUID;
    src_org UUID;
    src_project UUID;
    src_case UUID;
BEGIN
    SELECT organization_id INTO project_org FROM public.projects WHERE id = NEW.project_id;
    IF project_org IS NULL OR project_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'escritura_matrices organization_id must match project organization_id';
    END IF;

    -- Scope LOTE: el caso debe pertenecer al mismo org y proyecto.
    -- Scope PROYECTO (escritura_case_id IS NULL): sin caso, nada que validar.
    IF NEW.escritura_case_id IS NOT NULL THEN
        SELECT organization_id, project_id INTO case_org, case_project
        FROM public.escritura_cases WHERE id = NEW.escritura_case_id;
        IF case_org IS NULL OR case_org <> NEW.organization_id OR case_project <> NEW.project_id THEN
            RAISE EXCEPTION 'escritura_matrices escritura_case must belong to the same organization and project';
        END IF;
    END IF;

    SELECT organization_id INTO template_org
    FROM public.escritura_templates WHERE id = NEW.template_id;
    IF template_org IS NULL OR template_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'escritura_matrices template must belong to the same organization';
    END IF;

    -- La matriz de proyecto de origen (al instanciar el borrador del lote)
    -- debe ser del mismo org/proyecto y de scope proyecto (case_id NULL).
    IF NEW.source_project_matriz_id IS NOT NULL THEN
        SELECT organization_id, project_id, escritura_case_id
        INTO src_org, src_project, src_case
        FROM public.escritura_matrices WHERE id = NEW.source_project_matriz_id;
        IF src_org IS NULL OR src_org <> NEW.organization_id OR src_project <> NEW.project_id THEN
            RAISE EXCEPTION 'escritura_matrices source_project_matriz must belong to the same organization and project';
        END IF;
        IF src_case IS NOT NULL THEN
            RAISE EXCEPTION 'escritura_matrices source_project_matriz must be a project-scope matriz (escritura_case_id NULL)';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 2. escritura_deliveries: entregas auditadas del borrador al vendedor ──

CREATE TABLE IF NOT EXISTS public.escritura_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    escritura_case_id UUID NOT NULL REFERENCES public.escritura_cases(id) ON DELETE CASCADE,
    generation_id UUID NOT NULL REFERENCES public.escritura_minuta_generations(id) ON DELETE CASCADE,
    recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- vendedor asignado
    channel TEXT NOT NULL,                  -- 'telegram' | 'web'
    link_token TEXT,                        -- enlace seguro
    link_expires_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed | unavailable | expired
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT escritura_deliveries_channel_check CHECK (channel = ANY (ARRAY['telegram'::text, 'web'::text])),
    CONSTRAINT escritura_deliveries_status_check CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'unavailable'::text, 'expired'::text]))
);

CREATE INDEX IF NOT EXISTS escritura_deliveries_recipient_idx
ON public.escritura_deliveries (recipient_user_id, status);

CREATE INDEX IF NOT EXISTS escritura_deliveries_org_idx
ON public.escritura_deliveries (organization_id);

CREATE INDEX IF NOT EXISTS escritura_deliveries_case_idx
ON public.escritura_deliveries (escritura_case_id, created_at DESC);

-- Scope: la entrega debe alinear org/proyecto/caso/generacion (auditoria FR-012).
CREATE OR REPLACE FUNCTION public.validate_escritura_deliveries_scope()
RETURNS TRIGGER AS $$
DECLARE
    project_org UUID;
    case_org UUID;
    case_project UUID;
    gen_org UUID;
    gen_case UUID;
BEGIN
    SELECT organization_id INTO project_org FROM public.projects WHERE id = NEW.project_id;
    IF project_org IS NULL OR project_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'escritura_deliveries organization_id must match project organization_id';
    END IF;

    SELECT organization_id, project_id INTO case_org, case_project
    FROM public.escritura_cases WHERE id = NEW.escritura_case_id;
    IF case_org IS NULL OR case_org <> NEW.organization_id OR case_project <> NEW.project_id THEN
        RAISE EXCEPTION 'escritura_deliveries escritura_case must belong to the same organization and project';
    END IF;

    SELECT organization_id, escritura_case_id INTO gen_org, gen_case
    FROM public.escritura_minuta_generations WHERE id = NEW.generation_id;
    IF gen_org IS NULL OR gen_org <> NEW.organization_id OR gen_case <> NEW.escritura_case_id THEN
        RAISE EXCEPTION 'escritura_deliveries generation must belong to the same organization and case';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_escritura_deliveries_scope
BEFORE INSERT OR UPDATE ON public.escritura_deliveries
FOR EACH ROW EXECUTE FUNCTION public.validate_escritura_deliveries_scope();

-- ── 3. RLS de escritura_deliveries: org + vendedor asignado ───────────────

ALTER TABLE public.escritura_deliveries ENABLE ROW LEVEL SECURITY;

-- Admin de la organizacion: acceso total a las entregas de su org.
CREATE POLICY escritura_deliveries_admin_all ON public.escritura_deliveries
FOR ALL USING (public.is_org_admin(organization_id) OR public.is_super_admin())
WITH CHECK (public.is_org_admin(organization_id) OR public.is_super_admin());

-- Vendedor asignado: ve SOLO las entregas de SUS ventas (constitucion V,
-- SC-005). Sin policy is_org_user amplia: un vendedor jamas ve entregas de
-- otro vendedor. La renovacion del enlace vencido pasa por la API
-- (service_role), no por UPDATE directo del vendedor.
CREATE POLICY escritura_deliveries_vendor_select ON public.escritura_deliveries
FOR SELECT USING (
    recipient_user_id = auth.uid()
    AND public.is_project_vendor(project_id)
);

CREATE POLICY escritura_deliveries_service_role ON public.escritura_deliveries
TO service_role USING (true) WITH CHECK (true);

-- ── Comments ──────────────────────────────────────────────────────────────

COMMENT ON TABLE public.escritura_deliveries IS 'SDD 011: entregas auditadas del borrador aceptado al vendedor (Telegram/web), con enlace seguro y vencimiento (FR-010/FR-012).';
COMMENT ON COLUMN public.escritura_matrices.escritura_case_id IS 'SDD 008/011: NULL = matriz de la escritura del PROYECTO (esperando ventas); no NULL = borrador del lote.';
COMMENT ON COLUMN public.escritura_matrices.source_project_matriz_id IS 'SDD 011: matriz de proyecto (case_id NULL) desde la que se instancio este borrador del lote (FR-012).';
