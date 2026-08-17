# Research: Gestión completa de notificaciones

**Fecha**: 2026-08-14 | **Feature**: `021-notificaciones-gestion-completa`

## Decisiones

### D-001: Paginación por offset (no cursor)

- **Decision**: `limit` (default/max 50) + `offset` en `GET /api/v1/notifications/` via `.range()`.
- **Rationale**: escala real ≤ 100 notificaciones activas por usuario; el orden es por `created_at desc` con PK estable; el historial nunca se inserta en medio. Offset es suficiente y más simple de mantener en el frontend ("Cargar más" = offset += 50). El orden estable (created_at desc, tie-break por id) evita duplicados entre páginas.
- **Alternatives considered**: cursor por `created_at` — innecesario a esta escala y agrega complejidad de encoding.

### D-002: Conteos globales con consulta ligera separada

- **Decision**: los conteos `pending/approved/rejected/unread` se calculan con una consulta separada (proyección mínima, sin paginación) sobre el conjunto completo del scope del usuario, **excluyendo** `dismissed_at IS NOT NULL`.
- **Rationale**: con paginación, calcular conteos desde la página actual es incorrecto (SC-001 exige el total real); una consulta ligera de ≤ 100 filas es instantánea y evita N consultas `count`.
- **Alternatives considered**: `count=exact` de PostgREST por estado → 4 consultas count; no aporta vs una proyección mínima.

### D-003: Descarte suave (soft-dismiss) con idempotencia

- **Decision**: `POST /api/v1/notifications/{notification_id}/dismiss` escribe `dismissed_at = now()` en la fila; si ya está descartada, no reescribe la marca (idempotente — cubre doble clic y replays). Nunca borra la fila ni toca `approval_requests`.
- **Rationale**: la auditoría es requisito del Spec 002 (FR-016) y la columna ya existe desde `20260529000100_notification_center_hardening.sql`. El doble clic rápido (edge case del spec) exige idempotencia.
- **Alternatives considered**: DELETE físico — rechazado por auditoría; columna nueva `dismissed_by` — innecesaria: el scope ya restringe al destinatario.

### D-004: Scope de dismiss y read-all idéntico a mark-read

- **Decision**: reutilizar `_resolve_member_notification_scope` + validación de tenant desde la fila persistida (org de la notificación). Admin → alcance org-wide (filas `recipient_role=admin` de su org); vendor/user → solo `recipient_id == x_user_id`.
- **Rationale**: consistencia con `mark_notification_read` (fix FR-006 del 2026-08-14) y con las políticas RLS (`notification_events_vendor_update` exige `recipient_id = auth.uid()`, `notification_events_admin_all` exige `is_org_admin`). El vendedor que intente descartar una notificación ajena recibe 403 (edge case del spec).
- **Alternatives considered**: política RLS-only — el endpoint actual usa service client, la autorización se hace en capa de aplicación.

### D-005: Refresco proactivo = abrir + foco + 60 s (realtime se mantiene)

- **Decision**: al abrir la campana (onOpenChange) se hace fetch; al volver al foco de la pestaña (evento `focus` de window) se hace fetch; un `setInterval` de 60 s refresca mientras el componente está montado (con cleanup al desmontar). El canal realtime de Supabase existente se mantiene como mejora adicional, no como dependencia.
- **Rationale**: SC-003 exige ≤ 60 s sin recarga manual y la asunción del spec define "refresco al abrir + refresco periódico (máximo 60 s)"; el realtime puede fallar silenciosamente (permisos/desconexión) y el polling lo cubre como baseline confiable.
- **Alternatives considered**: suscripción realtime como único mecanismo — explícitamente fuera de alcance inicial según spec; el channel ya existe y se conserva.

### D-006: Contador numérico = `counts.pending`

- **Decision**: el badge de la campana muestra `counts.pending` (solicitudes pendientes accionables) cuando > 0; oculto con 0. Reemplaza al dot actual (`counts.unread`).
- **Rationale**: FR-005 y US2 exigen "solicitudes pendientes accionables" y AC-1 (3 pendientes → "3"); AC-3 (0 pendientes → sin número ni punto). El dot por ítem no leído se mantiene dentro de la lista.
- **Alternatives considered**: badge de `unread` — contradice la US2 (pendientes, no leídas).

### D-007: Copy servido por el backend, no duplicado en frontend

- **Decision**: el ítem renderiza `title`, `message`, `action_label` y `deep_link` que el backend ya calcula (`_notification_copy_for_item` → `escritura_notifications.py`), con fallback a las etiquetas estáticas actuales cuando el copy es null.
- **Rationale**: los textos y URLs viven en una única fuente (FastAPI + `legal_microcopy.py`); duplicarlos en el frontend crearía divergencia (ya pasó: el copy se calculaba y se descartaba). Los deep_links apuntan a rutas existentes del dashboard (`/projects/{id}`, `/documentos/matriz/{caseId}`, `/documentos/matriz/proyecto/{projectId}`, `/mis-documentos`).
- **Alternatives considered**: reconstruir el copy en el frontend — rechazado (divergencia y N+1 de contexto).

## Baseline verificado (hallazgos de la investigación)

1. **`dismissed_at` huérfana**: existe en la tabla y se selecciona en el listado, pero ningún flujo la escribe ni la expone; el frontend no la usa.
2. **Copy nunca renderizado**: `NotificationItem` incluye `title/message/action_label/deep_link/flow_state_*` desde el backend, pero `notification-item.tsx` los ignora (usa etiquetas genéricas).
3. **"Marcar todo" = N peticiones**: `handleMarkAllRead` hace `Promise.all` de `markNotificationRead` por ítem.
4. **Lista sin límite ni paginación**: `list_notifications` no aplica `limit`/`offset`.
5. **Refresco**: existe canal realtime; falta refresco al abrir, al foco y polling de 60 s.
6. **Contador**: solo dot con `counts.unread`; no hay número.
7. **Accesibilidad**: ítems son `div` con onClick (no focusables); faltan `role`/`aria-live`/labels.
8. **No hay migración pendiente**: la columna y RLS ya existen; los índices actuales cubren las consultas.

## Fuentes

- `apps/api/api/v1/endpoints/notifications.py` (465 líneas, list/mark-read/decide)
- `apps/api/schemas/notification.py`
- `apps/api/services/escritura_notifications.py`, `apps/api/services/legal_microcopy.py`
- `apps/api/workers/tasks/approval_notifier.py`, `approval_processor.py`
- `packages/database/supabase/migrations/20260529000100_notification_center_hardening.sql`, `20260812220304_sdd019_rls_initplan_opt.sql`, `20260812222206_sdd019_rls_initplan_complete.sql`
- `apps/web/src/components/notifications/*`, `apps/web/src/lib/services/notifications.service.ts`
- `apps/web/tests/mvp-notifications.test.ts`
- Spec `specs/021-notificaciones-gestion-completa/spec.md`
