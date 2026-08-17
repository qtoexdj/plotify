# Implementation Plan: Gestión completa de notificaciones (campana)

**Branch**: `021-notificaciones-gestion-completa` | **Date**: 2026-08-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-notificaciones-gestion-completa/spec.md`

**Note**: Este plan es generado por el comando `/speckit-plan`. Ver `.specify/templates/plan-template.md` para el workflow.

## Summary

Completar la gestión de la campana de notificaciones web: descarte por ítem (soft-dismiss sobre `dismissed_at`, columna que ya existe), contador numérico de pendientes accionables, render del copy de contexto con CTA navegable (campos `title`/`message`/`action_label`/`deep_link` que el backend ya calcula), lectura masiva en una sola operación (`read-all`), historial acotado con paginación (50 por consulta + "Cargar más"), refresco proactivo (al abrir + foco + cada 60 s; el realtime de Supabase ya existe y se mantiene) y accesibilidad por teclado/lectores. No se requieren migraciones de esquema: `notification_events.dismissed_at` ya existe y las políticas RLS actuales cubren el UPDATE por scope.

## Technical Context

**Language/Version**: Python 3.13 (FastAPI 0.135) API; TypeScript 5 / Next.js 16 (App Router, Server Components) web.

**Primary Dependencies**: FastAPI + supabase-py (service client) en API; Next.js 16 + Tailwind 4 + shadcn/ui (Popover, Button, Badge) + @hugeicons en web; Supabase realtime ya integrado.

**Storage**: Supabase PostgreSQL (cloud-only) — tabla `notification_events` existente, sin cambios de esquema. Migraciones no requeridas; `pnpm verify:migrations` como gate.

**Testing**: pytest (API, `pnpm test:api`), Vitest (web service layer + componentes, `pnpm test:web`), `pnpm typecheck:web`, `pnpm format:check`, `pnpm contracts:generate` (OpenAPI + client TS).

**Target Platform**: Web (dashboard Next.js). La miniapp Telegram queda fuera de alcance.

**Project Type**: Monorepo pnpm — web (Next.js) + API (FastAPI) + worker (ARQ).

**Performance Goals**: SC-001 conteo correcto < 2 s al abrir; SC-003 novedades ≤ 60 s sin recarga; SC-006 marcar N leídas en 1 operación < 3 s; SC-007 apertura con >50 notifs sin demora perceptible.

**Constraints**: Escala ≤ 100 notificaciones activas por usuario; listado paginado de 50; descarte suave (auditoría intacta); isolation por rol (admin org-wide para role admin; vendor/user solo propias); server actions para el fetch; contrato OpenAPI generado (no editar JSON a mano).

**Scale/Scope**: 1–2 admins + pocos vendedores por org; campana web del dashboard; ~7 user stories (P1: descarte, contador, copy/CTA; P2: lectura masiva, refresco proactivo; P3: paginación, accesibilidad).

## Constitution Check

_GATE: Debe pasar antes de la investigación de Fase 0. Se re-evalúa tras el diseño de Fase 1._

| Principio                                     | Estado | Justificación                                                                                                                                                                                             |
| --------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| III. Supabase como única fuente transaccional | ✅     | Solo lecturas/escrituras de estados sobre `notification_events` vía service client; RLS respetada; sin nueva tabla ni migración.                                                                          |
| IV. Contratos tipados entre servicios         | ✅     | Los endpoints nuevos se exponen en FastAPI y se regeneran con `pnpm contracts:generate`; el frontend consume el client generado.                                                                          |
| V. Seguridad multi-tenant                     | ✅     | Tenant derivado de recursos persistidos (`_resolve_member_notification_scope`, `require_approval_organization`); nunca de headers del cliente; descarte/lectura masiva validan scope igual que mark-read. |
| V. Auditoría completa                         | ✅     | El descarte es soft (marca temporal, sin DELETE); `notification_events` conserva la trazabilidad.                                                                                                         |
| VI. Testing obligatorio                       | ✅     | Tests pytest para endpoints nuevos (descarte, read-all, paginación, conteos) y Vitest para service layer y componentes.                                                                                   |
| VI. Estándar shadcn/ui + Tailwind 4           | ✅     | Se reutilizan componentes existentes (Popover, Button, Badge, Spinner) sin rediseño.                                                                                                                      |

Sin violaciones. No se requiere tabla de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/021-notificaciones-gestion-completa/
├── plan.md              # Este archivo
├── research.md          # Fase 0 (investigación de baseline)
├── data-model.md        # Fase 1 (entidades y estados)
├── quickstart.md        # Fase 1 (cómo probar)
├── contracts/           # Fase 1 (contratos de la API)
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
# Web (Next.js App Router)
apps/web/src/
├── components/notifications/
│   ├── notification-bell.tsx      # Botón + Popover + estado global (contador, fetch, refresh)
│   ├── notification-list.tsx      # Lista paginada + "Cargar más" + "Marcar todo"
│   └── notification-item.tsx      # Ítem: copy + CTA + descartar + accesibilidad
├── lib/services/
│   └── notifications.service.ts   # Server actions (dismiss, read-all, list con paginación)
└── tests/
    └── mvp-notifications.test.ts  # Tests service layer + nuevos tests componentes

# API (FastAPI)
apps/api/
├── api/v1/endpoints/
│   └── notifications.py           # list (filtro dismissed + paginación), dismiss, read-all
├── schemas/
│   └── notification.py            # NotificationItem+dismissed_at, DismissResponse, BulkReadResponse
└── tests/
    ├── test_notifications_fase7.py  # Regresión existente
    └── test_notifications_management.py  # Nuevos: dismiss, read-all, paginación, conteos

# Contratos (regenerados, no editados a mano)
packages/contracts/openapi/plotify-chat.v1.json
apps/web/src/lib/services/plotify-chat.generated.ts
```

**Structure Decision**: Se sigue la estructura existente del monorepo: la lógica de negocio de notificaciones vive en `apps/api/api/v1/endpoints/notifications.py` (endpoint único), los schemas en `apps/api/schemas/notification.py`, la UI en `apps/web/src/components/notifications/` y el acceso a datos del frontend en server actions (`lib/services/notifications.service.ts`). No se crean carpetas nuevas de migraciones (no hay cambios de esquema).

## Fase 0: Investigación (research.md)

1. Baseline del backend: `notifications.py` (list/mark-read/decide), generadores (`approval_notifier`, `approval_processor`), copy (`escritura_notifications.py`, `legal_microcopy.py`), esquema `notification_events` (migración `20260529000100`) y RLS (initplan SDD019).
2. Baseline del frontend: `notification-bell.tsx`, `notification-list.tsx`, `notification-item.tsx`, `notifications.service.ts` (server actions + `microserviceFetch`), tests Vitest existentes.
3. Decisiones de diseño: paginación offset vs cursor; conteos globales excluyendo descartadas; endpoint `read-all` y `dismiss` con mismo patrón de scope que `mark_notification_read`; refresco (abrir + focus + 60 s) complementando el realtime existente.

## Fase 1: Diseño (data-model.md, contracts/, quickstart.md)

### Backend — `apps/api/api/v1/endpoints/notifications.py`

1. **`GET /` (list_notifications)** — cambios:
   - Filtro `.is_("dismissed_at", "null")` en la consulta principal (FR-003).
   - Parámetros de query `limit` (default 50, máximo 50) y `offset` (default 0); `.range(offset, offset+limit-1)` (FR-011).
   - Conteos (`pending/approved/rejected/unread`) calculados con consulta ligera separada sobre el conjunto completo del scope EXCLUYENDO descartadas (US2-AC4); se exponen en `counts` como hoy.
   - El ítem expone `dismissed_at` (siempre null en el listado principal) y mantiene el copy calculado (`title`, `message`, `action_label`, `deep_link`, `flow_state_*`).
   - `can_decide` se mantiene: admin + status pending.
2. **`POST /{notification_id}/dismiss` (dismiss_notification)** — nuevo (FR-001/002/004/013):
   - Headers `X-User-Id`; valida UUID; 404 si no existe.
   - Scope idéntico a `mark_notification_read` y al listado: `_resolve_member_notification_scope` sobre la org de la notificación; admin → filas `recipient_role=admin` de su org; no-admin → exige `recipient_id == x_user_id` (403).
   - `update({"dismissed_at": now})`; idempotente si ya está descartada (no reescribe marca). Sin DELETE ni cambios en `approval_requests` (FR-004: el descarte no altera el proceso).
   - Respuesta `DismissResponse(success=True, dismissed_at=now)`.
3. **`POST /read-all` (mark_all_notifications_read)** — nuevo (FR-008):
   - Headers `X-User-Id` + `X-Organization-Id`; valida que el usuario es miembro de la org (`_resolve_member_notification_scope` → 403 si no-miembro).
   - Scope: admin → `recipient_role=admin` de la org; no-admin → `recipient_id == x_user_id`.
   - Update masivo: `read_at IS NULL AND dismissed_at IS NULL` → `read_at = now` (una única operación).
   - Respuesta `BulkReadResponse(success=True, updated_count=N)`.

### Schemas — `apps/api/schemas/notification.py`

- `NotificationItem` + campo `dismissed_at: Optional[str]`.
- `DismissResponse(success: bool, dismissed_at: str)`.
- `BulkReadResponse(success: bool, updated_count: int)`.

### Contratos

- `pnpm contracts:generate` regenera `packages/contracts/openapi/plotify-chat.v1.json` y `apps/web/src/lib/services/plotify-chat.generated.ts` (operaciones `dismissNotification`, `markAllNotificationsRead`, y campos nuevos de `NotificationItem`/respuestas).

### Frontend — `apps/web/src`

1. **`lib/services/notifications.service.ts`**:
   - `dismissNotification(notificationId, userId)` → `POST /notifications/{id}/dismiss` (header `X-User-Id`).
   - `markAllNotificationsRead(userId, organizationId)` → `POST /notifications/read-all` (headers `X-User-Id`, `X-Organization-Id`).
   - `listNotifications(userId, organizationId, {limit, offset})` → query params.
2. **`notification-bell.tsx`**:
   - Contador numérico: badge con `counts.pending` (US2); oculto si 0; `aria-live="polite"`.
   - Refresco al abrir (onOpenChange → fetch), al volver al foco (`window focus`) y cada 60 s (`setInterval` con cleanup; no dispara si la sesión expiró — el fetch falla silencioso) (FR-009/010, US5).
   - `handleMarkAllRead` → una sola llamada a `markAllNotificationsRead` + refetch.
   - `handleDismiss` → `dismissNotification` con update optimista + refetch (FR-001; idempotente al doble clic).
   - Mantiene el canal realtime existente como mejora adicional.
3. **`notification-list.tsx`**:
   - "Cargar más" cuando `items.length < total` (offset += 50) (FR-011, US6).
   - Prop `onDismiss` propagada a ítems; "Marcar todo" sigue oculto sin no-leídos.
4. **`notification-item.tsx`**:
   - Render de `title`/`message` del copy del servidor cuando existan (fallback a las etiquetas actuales).
   - CTA: `Button`/`Link` con `action_label` → `deep_link` (FR-006/007, US3-AC1/2); sin `deep_link` → sin botón (US3-AC3); el vendedor nunca ve enlaces de decisión administrativa (US3-AC4).
   - Control de descartar: botón ícono (ej. `NotificationOff01Icon`) con `aria-label`, `stopPropagation`, estado cargando; no afecta a `can_decide`.
   - Accesibilidad: ítems como botones/`role="listitem"` focusables (Tab), `aria-label` con estado (sin leer/descartar), foco retorna al disparador vía Radix en Escape (FR-012, US7).

### DB

Sin migración: `dismissed_at` existe; índices actuales cubren las consultas (`idx_notification_events_recipient`, `idx_notification_events_org_role`). Gate `pnpm verify:migrations` y advisors sin cambios.

## Fase 2: Tareas

Ver `tasks.md` (generado por `/speckit-tasks`): 2 fases — backend (endpoints + schemas + tests pytest) y frontend (service + componentes + tests Vitest), con contratos regenerados al final del backend y gates de calidad por cada lado.

## Completion Criteria

- `pnpm test:api` verde (nuevos tests de dismiss/read-all/paginación/conteos incluidos).
- `pnpm contracts:generate` sin diff pendiente en el JSON OpenAPI (solo los cambios intencionales del SDD).
- `pnpm test:web`, `pnpm typecheck:web`, `pnpm format:check`, `pnpm build:web` verdes.
- `pnpm verify:migrations` sin cambios (parity intacta).
- Verificación funcional manual: descartar ítem → no reaparece ni cuenta; contador = pendientes; CTA navega a mesa/borrador; read-all en 1 llamada; "Cargar más" agrega 50; campana se refresca sola ≤ 60 s.
