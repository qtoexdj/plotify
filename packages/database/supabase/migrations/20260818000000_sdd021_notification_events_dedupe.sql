-- Migration: 20260818000000_sdd021_notification_events_dedupe.sql
-- SDD 021 (FR-006): dedupe idempotente de eventos de notificación.
--
-- Los productores de notification_events (notify_admin_approval y
-- send_decision_notifications) insertan con upsert(ignore_duplicates=True)
-- -> INSERT ... ON CONFLICT DO NOTHING. Este índice único garantiza a lo
-- sumo 1 evento por (approval_id, recipient_id), colapsando ejecuciones
-- concurrentes o duplicadas (reintentos ARQ tras timeout post-commit,
-- doble canal inline + job). Verificado antes de aplicar: 0 pares
-- duplicados en cloud (consulta group by approval_id, recipient_id).
-- No altera los metadatos de campana (read_at/dismissed_at): las filas
-- duplicadas solo generaban ruido en listado, conteos y descarte, y este
-- índice las elimina en origen sin tocar la semántica de lectura ni descarte.

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_events_unique_approval_recipient
ON public.notification_events (approval_id, recipient_id);
