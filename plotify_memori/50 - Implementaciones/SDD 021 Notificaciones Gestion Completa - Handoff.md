# SDD 021 Notificaciones Gestion Completa - Handoff

**Tag:** #implementacion #notificaciones #web
**Rama:** `021-notificaciones-gestion-completa`
**Fecha:** 2026-08-17
**Estado:** Implementado y verificado (revision senior aplicada)

---

## Resumen

Completa la gestion de la campana de notificaciones web del dashboard (Spec 002):
descarte por item, contador numerico de pendientes, copy accionable con navegacion,
lectura masiva, historial acotado con paginacion y actualizacion proactiva sin recarga.

Sin cambios de esquema: `notification_events.dismissed_at` ya existia; RLS e indices
actuales cubren las consultas.

## Cambios

### API (`apps/api`)

- `GET /api/v1/notifications/` — filtra `dismissed_at IS NULL`, paginacion `limit`
  (default/max 50) + `offset`, conteos globales del scope (pending/approved/rejected/
  unread) excluyendo descartadas. Orden estable `created_at desc, id desc`.
- `POST /api/v1/notifications/{id}/dismiss` — soft-dismiss idempotente; nunca borra la
  fila ni altera `approval_requests`. Scope: admin → filas `recipient_role=admin` de su
  org; no-admin → solo `recipient_id` propio (403 ajeno).
- `POST /api/v1/notifications/read-all` — marca todas las no leidas del scope en UNA
  operacion (`read_at IS NULL AND dismissed_at IS NULL`), retorna `updated_count`.
- Schemas: `NotificationItem.dismissed_at`, `DismissResponse`, `BulkReadResponse`.

### Web (`apps/web`)

- `notifications.service.ts` — server actions `dismissNotification`,
  `markAllNotificationsRead`, `listNotifications` con `limit`/`offset`.
- `notification-bell.tsx` — badge numerico `counts.pending` (oculto si 0, `aria-live`
  fuera del boton), refresco al abrir + foco + 60 s (fallos silenciosos) + canal
  realtime existente, read-all en 1 llamada, dismiss con actualizacion local y toast
  de error.
- `notification-list.tsx` — "Cargar mas" (offset += 50) con dedupe por id y spinner.
- `notification-item.tsx` — copy del servidor (`title`/`message`) con fallback, CTA
  `action_label` → `deep_link` (1 clic; sin destino → sin CTA), control de descarte,
  items no leidos focusables por teclado (Tab + Enter/Espacio), controles con
  `aria-label`, vendedor sin controles de decision (doble defensa `userRole` +
  `can_decide`).

### Contratos

- `packages/contracts/openapi/plotify-chat.v1.json` + `plotify-chat.generated.ts`
  regenerados desde FastAPI. El diff arrastra deuda previa: endpoint
  `ensure_legal_document_ingestion` ya existia en codigo sin regenerar (ver
  `specs/021-notificaciones-gestion-completa/evidence/openapi-diff-notes.md`).

## Decisiones

- Offset (no cursor): escala ≤ 100 notifs/usuario, orden estable.
- Conteos con consulta separada sobre el scope completo (no sobre la pagina).
- Soft-dismiss con idempotencia (doble clic inofensivo).
- Scope idéntico al listado/read-all en los tres endpoints de gestion.
- Refresco por polling + foco + apertura; realtime se mantiene como mejora.

## Verificacion

- pytest: `test_notifications_management.py` (13 tests dismiss/read-all/paginacion) +
  regresiones fase7/hook verdes; unico fail `test_trigger_exists_in_db` preexistente.
- Vitest: `mvp-notifications.test.ts` + `notification-components.test.tsx` (25 tests).
- `pnpm typecheck:web`, `pnpm build:web`, `pnpm verify:migrations` verdes.
- `format:check`: los 2 warns introducidos por el SDD (tasks.md, feature.json)
  corregidos; quedan warns preexistentes ajenos (OpenAPI generator, AGENTS/memory,
  scripts agent-context).
- BD cloud verificada (Supabase MCP): 2 filas reales con `dismissed_at` del smoke;
  advisors sin WARN nuevos.

## Riesgos y pendientes

- El polling no se detiene ante sesion expirada (solo silencia errores); limpia al
  desmontar. Aceptado.
- Agrupacion temporal usa reloj del cliente (heredado del baseline; edge case del
  spec sin FR).
- Actualizar API/worker desplegados con este codigo antes de la demo funcional.
