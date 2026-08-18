-- Migration: 20260817110000_sdd021_notification_events_active_indexes.sql
-- SDD 021: Índices parciales activos para optimizar consultas de listado y conteo de campana de notification_events vinculadas a approval_requests / approval_id.

CREATE INDEX IF NOT EXISTS idx_notification_events_active_admin 
ON public.notification_events (organization_id, created_at DESC) 
WHERE (dismissed_at IS NULL AND recipient_role = 'admin');

CREATE INDEX IF NOT EXISTS idx_notification_events_active_recipient 
ON public.notification_events (recipient_id, created_at DESC) 
WHERE (dismissed_at IS NULL);
