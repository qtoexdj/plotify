---
description: 'Task list for feature implementation - Gestión completa de notificaciones'
---

# Tasks: Gestión completa de notificaciones (campana)

**Input**: Design documents from `/specs/021-notificaciones-gestion-completa/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Incluidos — el repo exige tests (Constitución VI) para cambios en flujos de aprobación/notificaciones.

**Organization**: Tasks agrupadas por user story; el backend de listado (filtro descarte, conteos, paginación) es fundacional compartido.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivos distintos, sin dependencias)
- **[Story]**: US1..US7 del spec.md
- Paths exactos de archivos en cada descripción

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar baseline verde antes de tocar código

- [x] T001 Verify baseline: ejecutar `pnpm test:api`, `pnpm test:web` y `pnpm typecheck:web` y confirmar que pasan (registrar fails preexistentes conocidos: 3 `test_escrituras_variable_inventory` + 1 `test_trigger_exists_in_db`)

**Checkpoint**: Baseline estable — se puede comenzar la implementación

---

## Phase 2: Foundational (Backend de listado — bloquea US1, US2, US6)

**Purpose**: El listado debe excluir descartadas, exponer `dismissed_at`, paginar y contar sin descartadas. Sin esto, ninguna story de campana funciona.

**⚠️ CRITICAL**: Ninguna user story puede comenzar hasta completar esta fase

- [x] T002 Add `dismissed_at: Optional[str]` a `NotificationItem` y crear `DismissResponse(success, dismissed_at)` y `BulkReadResponse(success, updated_count)` en `apps/api/schemas/notification.py`
- [x] T003 Filter `dismissed_at is null` en la query principal y exponer `dismissed_at` en cada ítem de `list_notifications` en `apps/api/api/v1/endpoints/notifications.py` (FR-003)
- [x] T004 Add paginación `limit` (default 50, max 50) y `offset` (default 0) vía `.range()` y recalcular los 4 conteos con consulta ligera separada del conjunto completo del scope EXCLUYENDO descartadas en `apps/api/api/v1/endpoints/notifications.py` (FR-011, US2-AC4)

**Checkpoint**: `GET /api/v1/notifications/` devuelve ≤50 ítems sin descartadas y conteos globales correctos

---

## Phase 3: User Story 1 - Descartar notificaciones (Priority: P1) 🎯 MVP

**Goal**: El destinatario puede ocultar (soft-dismiss) cualquier notificación propia; desaparece del listado y de los conteos sin perder auditoría.

**Independent Test**: pytest de `POST /{id}/dismiss` + UI: el ítem desaparece, no reaparece al recargar, el contador se ajusta y la fila conserva `dismissed_at`.

### Tests for User Story 1 ⚠️ (escribir primero, deben FALLAR)

- [x] T005 [US1] Escribir tests pytest de `POST /{notification_id}/dismiss` en `apps/api/tests/test_notifications_management.py`: éxito admin, éxito vendor propio, 403 ajeno, 404 inexistente, idempotencia (doble dismiss no reescribe marca), 400 UUID inválido (FR-001/002/004/013)

### Implementation for User Story 1

- [x] T006 [US1] Implementar endpoint `POST /{notification_id}/dismiss` en `apps/api/api/v1/endpoints/notifications.py` con scope idéntico a `mark_notification_read` (`_resolve_member_notification_scope` sobre la org persistida; admin org-wide, no-admin exige `recipient_id == x_user_id`), update idempotente de `dismissed_at` y respuesta `DismissResponse`
- [x] T007 [US1] Ejecutar `pnpm contracts:generate` para regenerar `packages/contracts/openapi/plotify-chat.v1.json` y `apps/web/src/lib/services/plotify-chat.generated.ts` (operación `dismissNotification`, campos `dismissed_at`, `DismissResponse`)
- [x] T008 [US1] Añadir server action `dismissNotification(notificationId, userId)` → `POST /api/v1/notifications/{id}/dismiss` con header `X-User-Id` en `apps/web/src/lib/services/notifications.service.ts` + test Vitest de la llamada (path, headers, error) en `apps/web/tests/mvp-notifications.test.ts`
- [x] T009 [US1] Añadir control de descartar (botón ícono, ej. `NotificationOff01Icon`, con `aria-label`, `stopPropagation`, estado loading e idempotente al doble clic) a `apps/web/src/components/notifications/notification-item.tsx` (FR-001)
- [x] T010 [US1] Implementar `handleDismiss` en `apps/web/src/components/notifications/notification-bell.tsx`: update optimista (quita ítem + ajusta conteos), refetch y toast de error que revierte el estado (FR-001, AC-5)

**Checkpoint**: Descartar funciona end-to-end; ítem no reaparece ni cuenta; fila intacta en BD con `dismissed_at`

---

## Phase 4: User Story 2 - Contador de pendientes accionables (Priority: P1)

**Goal**: La campana muestra el número de solicitudes pendientes (accionables) del usuario; oculto si 0.

**Independent Test**: Con N solicitudes pendientes la campana muestra N; decrece al decidir/descartar; con 0 no muestra nada.

### Tests for User Story 2 ⚠️ (escribir primero)

- [x] T011 [P] [US2] Test Vitest del contador en `apps/web/tests/mvp-notifications.test.ts`: renderiza `counts.pending` cuando > 0, no renderiza nada con 0, y actualiza tras decidir/descartar (mock de `listNotifications`)

### Implementation for User Story 2

- [x] T012 [US2] Reemplazar el dot por badge numérico con `counts.pending` (oculto si 0, `aria-live="polite"`, `aria-label` con el conteo) en `apps/web/src/components/notifications/notification-bell.tsx` (FR-005, US2-AC1/AC3/AC4)

**Checkpoint**: Contador numérico visible y correcto según pendientes del scope

---

## Phase 5: User Story 3 - Copy accionable con navegación (Priority: P1)

**Goal**: Cada notificación muestra su título/mensaje/CTA reales del servidor y navega al destino con un clic.

**Independent Test**: Con venta aprobada y borrador listo, el ítem muestra "Borrador por revisar" + "Abrir borrador" y navega a la mesa; sin destino, no hay CTA; el vendedor nunca ve controles administrativos.

### Tests for User Story 3 ⚠️ (escribir primero)

- [x] T013 [P] [US3] Test Vitest del ítem en `apps/web/tests/mvp-notifications.test.ts`: render de `title`/`message`/`action_label` desde el copy, CTA con `deep_link` cuando existe, sin botón cuando `deep_link` es null, vendor sin controles de decisión

### Implementation for User Story 3

- [x] T014 [US3] Renderizar `title`/`message` del servidor (fallback a etiquetas actuales) y CTA `action_label` navegando a `deep_link` (Link/Button) en `apps/web/src/components/notifications/notification-item.tsx`; ocultar CTA si no hay `deep_link` (FR-006/007, US3-AC1/AC2/AC3/AC4)

**Checkpoint**: Copy y navegación de 1 clic funcionando por tipo de notificación

---

## Phase 6: User Story 4 - Lectura masiva y refresco al abrir (Priority: P2)

**Goal**: "Marcar todo como leído" en una sola operación; la campana se refresca al abrir.

**Independent Test**: Con 10+ sin leer, una petición `read-all` deja el contador en 0; al abrir la campana hay refetch con indicador de carga.

### Tests for User Story 4 ⚠️ (escribir primero)

- [x] T015 [US4] Escribir tests pytest de `POST /read-all` en `apps/api/tests/test_notifications_management.py`: una sola operación marca todas (sin descartadas) del scope admin y vendor, retorna `updated_count`, 403 para no-miembro, idempotente (segunda llamada updated_count=0)

### Implementation for User Story 4

- [x] T016 [US4] Implementar endpoint `POST /read-all` en `apps/api/api/v1/endpoints/notifications.py`: valida membresía con `_resolve_member_notification_scope`, update masivo único `read_at=now` donde `read_at IS NULL AND dismissed_at IS NULL` (scope admin: `recipient_role=admin` de la org; no-admin: `recipient_id` propio) y respuesta `BulkReadResponse`
- [x] T017 [US4] Ejecutar `pnpm contracts:generate` y añadir server action `markAllNotificationsRead(userId, organizationId)` → `POST /api/v1/notifications/read-all` en `apps/web/src/lib/services/notifications.service.ts` + test Vitest en `apps/web/tests/mvp-notifications.test.ts`
- [x] T018 [US4] Reemplazar `handleMarkAllRead` (Promise.all por ítem) por una única llamada a `markAllNotificationsRead` + refetch en `apps/web/src/components/notifications/notification-bell.tsx`, y hacer fetch al abrir (onOpenChange) con indicador de carga (FR-008/009)

**Checkpoint**: Marcar todo = 1 petición; apertura con datos frescos

---

## Phase 7: User Story 5 - Actualización proactiva sin recarga (Priority: P2)

**Goal**: La campana refleja novedades en ≤ 60 s sin recarga manual.

**Independent Test**: Con la página abierta, una solicitud nueva aparece en ≤ 60 s; al volver a primer plano hay refresh inmediato; con sesión expirada no hay errores visibles.

### Implementation for User Story 5

- [x] T019 [US5] Añadir refresco periódico (setInterval 60 s con cleanup al desmontar) y refresco al volver al foco de la ventana (evento `focus`) en `apps/web/src/components/notifications/notification-bell.tsx`; los fetch fallidos (sesión expirada/red) deben ser silenciosos, sin errores visibles (FR-010, US5-AC1/AC2/AC3)

**Checkpoint**: Novedades reflejadas en ≤ 60 s y al enfocar la pestaña

---

## Phase 8: User Story 6 - Historial acotado y carga progresiva (Priority: P3)

**Goal**: La campana carga 50 notificaciones y permite "Cargar más" bajo demanda.

**Independent Test**: Con >50 notificaciones la apertura muestra 50 y "Cargar más" agrega las siguientes sin duplicados.

### Tests for User Story 6 ⚠️ (escribir primero)

- [x] T020 [P] [US6] Test Vitest de paginación en `apps/web/tests/mvp-notifications.test.ts`: `listNotifications` envía `limit`/`offset`, "Cargar más" agrega al final sin duplicar ítems (mock de respuestas paginadas)

### Implementation for User Story 6

- [x] T021 [US6] Añadir parámetros `limit`/`offset` a la server action `listNotifications` y renderizar botón "Cargar más" (offset += 50, spinner, oculto cuando no hay más) en `apps/web/src/components/notifications/notification-list.tsx` (FR-011, US6-AC1/AC2/AC3)

**Checkpoint**: Lista truncada a 50 con carga progresiva

---

## Phase 9: User Story 7 - Accesibilidad de la campana (Priority: P3)

**Goal**: Todos los controles operables por teclado y anunciados a lectores de pantalla.

**Independent Test**: Navegación solo con Tab/Enter/Escape; estados (sin leer, descartar) anunciados; Escape devuelve el foco al disparador.

### Implementation for User Story 7

- [x] T022 [P] [US7] Hacer los ítems focusables y con semántica correcta en `apps/web/src/components/notifications/notification-item.tsx`: `role="listitem"`, wrapper focusable por Tab (o `<button>`), `aria-label` con estado (sin leer/pendiente/descartar) y acciones (FR-012, US7-AC1/AC2)
- [x] T023 [US7] Verificar cierre con Escape y retorno de foco al disparador (Radix Popover) y `aria-live` del contador en `apps/web/src/components/notifications/notification-bell.tsx` y `notification-list.tsx` (US7-AC3)

**Checkpoint**: Campana navegable por teclado y anunciada por lector de pantalla

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Gates de calidad y cierre

- [x] T024 Ejecutar gates completos: `pnpm test:api` (solo fails preexistentes conocidos), `pnpm contracts:generate` con diff acotado a los cambios intencionales del SDD, `pnpm test:web`, `pnpm typecheck:web`, `pnpm format:check`, `pnpm build:web`, `pnpm verify:migrations` (sin cambios de esquema)
- [x] T025 Validar edge cases manualmente según `quickstart.md` (doble clic en descartar/decidir, descarte de solicitud pendiente decidible por otro canal, lista vacía "Todo al día", agrupación temporal con fechas del servidor, vendedor descartando ajeno rechazado)
- [x] T026 Actualizar `memory.md` (feature activa, estado de 021, skills usadas) y ejecutar `pnpm check:agent-context` tras los cambios de contexto

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias
- **Foundational (Phase 2)**: Depende de Setup — BLOQUEA todas las user stories
- **User Stories (Phase 3+)**: Dependen de Phase 2
  - US1 → US2 → US3 → US4 → US5 → US6 → US7 secuenciales (mismo implementador; archivos compartidos: `notification-bell.tsx` y `notification-item.tsx` se tocan en varias stories)
- **Polish (Phase 10)**: Depende de todas las user stories

### User Story Dependencies

- **US1 (P1)**: Backend dismiss + UI descarte. Depende de Phase 2 (listado).
- **US2 (P1)**: Solo frontend (contador); depende de Phase 2 (conteos globales).
- **US3 (P1)**: Solo frontend (copy ya viene del backend); depende de Phase 2.
- **US4 (P2)**: Backend read-all + UI; depende de US1 (patrón de scope) y Phase 2.
- **US5 (P2)**: Solo frontend (bell); depende de US4 (mismo componente).
- **US6 (P3)**: Frontend paginación; depende de Phase 2 (params API) — el listado de la campana se toca en US1..US5.
- **US7 (P3)**: Accesibilidad sobre los componentes ya modificados; depende de US1..US5.

### Within Each User Story

- Tests (cuando existen) se escriben primero y deben FALLAR antes de implementar.
- Backend → contracts (`pnpm contracts:generate`) → server action → componente.
- Story completa antes de pasar a la siguiente prioridad.

### Parallel Opportunities

- T011 y T013 (tests Vitest de US2/US3) pueden correr en paralelo con su story anterior.
- T020 (test Vitest de US6) puede correr antes de US6.
- Los tests pytest de cada story ([P]) son independientes entre archivos de tests.

---

## Parallel Example: Backend de US1 + US4

```bash
# Tests primero (pueden escribirse juntos, archivos de test distintos):
Task: "T005 tests pytest dismiss en apps/api/tests/test_notifications_management.py"
Task: "T015 tests pytest read-all en apps/api/tests/test_notifications_management.py"

# Luego endpoints (mismo archivo notifications.py → secuencial):
Task: "T006 POST /{id}/dismiss"
Task: "T016 POST /read-all"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational (listado sin descartadas + conteos)
3. Phase 3: US1 (dismiss end-to-end)
4. **STOP and VALIDATE**: US1 con pytest + UI manual
5. Deploy/demo si está listo

### Incremental Delivery

1. Setup + Foundational → listado paginado limpio
2. US1 → descarte (MVP!)
3. US2 → contador numérico
4. US3 → copy + CTA navegable
5. US4 → lectura masiva + refresh al abrir
6. US5 → refresh proactivo 60 s
7. US6 → historial acotado
8. US7 → accesibilidad
9. Polish → gates + memoria

---

## Notes

- No hay migraciones en este SDD: `dismissed_at` y RLS ya existen (ver `data-model.md`).
- Los cambios de `notifications.py` (backend) y de `notification-bell.tsx`/`notification-item.tsx`/`notification-list.tsx` (frontend) se tocan en varias stories → ejecución secuencial de stories para evitar conflictos.
- `pnpm contracts:generate` se ejecuta en T007 (tras dismiss) y T017 (tras read-all); el diff del OpenAPI debe ser acotado a los cambios del SDD.
- Commit sugerido tras cada story o grupo lógico.
