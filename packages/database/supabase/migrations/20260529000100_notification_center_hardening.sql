-- Migration: Notification Center Hardening - Notification Events
-- Date: 2026-05-29
-- Path: packages/database/supabase/migrations/20260529000100_notification_center_hardening.sql

CREATE TABLE IF NOT EXISTS public.notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_role VARCHAR(50) NOT NULL CHECK (recipient_role IN ('admin', 'vendor')),
    read_at TIMESTAMP WITH TIME ZONE NULL,
    dismissed_at TIMESTAMP WITH TIME ZONE NULL,
    delivery_channel VARCHAR(50) NOT NULL CHECK (delivery_channel IN ('web', 'telegram')),
    delivery_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'delivered', 'failed')),
    failed_reason TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexación de alto desempeño
CREATE INDEX IF NOT EXISTS idx_notification_events_org_role ON public.notification_events (organization_id, recipient_role);
CREATE INDEX IF NOT EXISTS idx_notification_events_recipient ON public.notification_events (recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_approval ON public.notification_events (approval_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_unread ON public.notification_events (recipient_id) WHERE (read_at IS NULL);

-- Habilitar RLS
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para robustez de Inquilinos y Roles (US5)

-- 1. Admins pueden leer todas las notificaciones de su organización
CREATE POLICY notification_events_admin_select ON public.notification_events
    FOR SELECT
    USING (public.is_org_admin(organization_id));

-- 2. Vendedores pueden leer sus propias notificaciones
CREATE POLICY notification_events_vendor_select ON public.notification_events
    FOR SELECT
    USING (recipient_id = auth.uid());

-- 3. Admins pueden realizar cualquier operación sobre notificaciones de su organización
CREATE POLICY notification_events_admin_all ON public.notification_events
    FOR ALL
    USING (public.is_org_admin(organization_id))
    WITH CHECK (public.is_org_admin(organization_id));

-- 4. Vendedores pueden actualizar solo el estado de lectura/descarte de sus propias notificaciones
CREATE POLICY notification_events_vendor_update ON public.notification_events
    FOR UPDATE
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

-- Trigger para updated_at automático si no existe el handler de timestamp
CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_events_update_timestamp ON public.notification_events;
CREATE TRIGGER trg_notification_events_update_timestamp
    BEFORE UPDATE ON public.notification_events
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_update_timestamp();
