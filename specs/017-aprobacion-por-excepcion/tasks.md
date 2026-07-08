# Tasks: Aprobación por excepción del pipeline venta → minuta

**Input**: Design documents from `/specs/017-aprobacion-por-excepcion/`

**Prerequisites**: plan.md, spec.md, research.md (D1-D8), data-model.md, contracts/cascade-endpoints.md, quickstart.md

**Tests**: OBLIGATORIOS (Constitución VI: el feature toca generación de documentos y transacciones de venta). Los tests de cada historia se escriben primero y deben fallar antes de implementar.

**Organization**: por user story. Orden de fases: US1 (P1) → US2 (P2) → US4 (P3, adelantada) → US3 (P2). US4 se adelanta a US3 porque la cascada completa necesita el warning por proyecto resuelto para correr sin diálogo; US3 (la mesa) es la capa visual final que consume todo lo anterior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1/US2/US3/US4 según spec.md

## Path Conventions

Monorepo: `apps/api` (FastAPI), `apps/web` (Next.js), `packages/database/supabase/migrations` (migraciones canónicas, Principio III).

---

## Phase 1: Setup — Migraciones (bloqueante para todo)

**Purpose**: el esquema que todas las historias comparten (data-model.md).

- [x] T001 [P] Migración `packages/database/supabase/migrations/20260708000100_escritura_review_policy.sql`: `organizations.escritura_review_policy` text not null default 'every_sale' + check ('every_sale','exceptions_only')
- [x] T002 [P] Migración `packages/database/supabase/migrations/20260708000200_project_minuta_warning_ack.sql`: `projects.minuta_warning_acknowledged_by` (uuid ref auth.users) + `minuta_warning_acknowledged_at` (timestamptz)
- [x] T003 [P] Migración `packages/database/supabase/migrations/20260708000300_escritura_cascade_runs.sql`: tabla `escritura_cascade_runs` (trigger/outcome/causes/steps + índice por caso + RLS admin/member/service_role), `escritura_matrices.approval_origin` ('human' default | 'system'), extensión `legal_review_decisions` (decided_by ahora nullable, origin/trigger/inherited_from_matriz_id/inherited_matriz_version)
- [ ] T004 **Pendiente del usuario** — aplicar migraciones con `supabase db push` (NUNCA vía MCP apply_migration — memoria: divergencia del historial) + `pnpm verify:migrations` verde (chequeo estructural ya verde) + regenerar `apps/web/src/types/database.types.ts` si el flujo del repo lo genera. No aplicado automáticamente: escribir sobre la base compartida requiere confirmación explícita.

**Checkpoint**: esquema listo; `pnpm verify:migrations` verde.

---

## Phase 2: Foundational — Extraer el workflow a servicio (bloqueante para US1 y US3)

**Purpose**: la cascada no puede reusar lógica que vive en endpoints (research D1). Refactor SIN cambio de comportamiento, cubierto por los tests existentes.

- [x] T005 Creado `apps/api/services/escritura_case_workflow.py` (2340 líneas): toda la lógica compartida (fetchers, `_case_response`/`_project_matriz_response`, blockers, `_workflow_context`/`_fresh_workflow_view`) + 4 funciones públicas nuevas `submit_case_matriz()`/`approve_case_matriz()`/`reject_case_matriz()`/`generate_case_minuta()` (cuerpos exactos de los antiguos endpoints, sin `Query(...)`). El módulo reexporta todo vía `__all__` para que `escritura_matrices.py` y los tests que importaban símbolos internos sigan funcionando.
- [x] T006 `apps/api/api/v1/endpoints/escritura_matrices.py` reducido de 2904 a 725 líneas: `submit_matriz`/`approve_matriz`/`reject_matriz`/`generate_minuta` son wrappers de una línea que delegan al servicio; `get_project_matriz`/`get_case_matriz`/`submit_legal_review`/`save_matriz`/`list_case_generations`/`get_escritura_trace`/`stage_operational_variables`/`bulk_verify_lots` sin cambios, importando del servicio vía `import *`.
- [x] T007 677 tests de API verdes (675 sin tocar + 2 que necesitaron re-apuntar su monkeypatch de `fetch_project_matriz_snapshot` al módulo donde ahora vive la función que lo llama — mismo target conceptual, las aserciones no cambiaron). Commits: `2351818` (refactor).

**Checkpoint**: workflow reutilizable desde servicios; `escritura_matrices.py` reducido.

---

## Phase 3: User Story 1 — Cascada automática venta → minuta entregada (P1) 🎯 MVP

**Goal**: venta validada sin pendientes → caso aprobado por el sistema → minuta generada y entregada, sin actos humanos (según política). Excepción con causas + notificación cuando falta algo.

**Independent Test**: con FakeStore, una venta validada en org `exceptions_only` termina en corrida `completed` con decisión system auditada y generación registrada; con un dato faltante termina en `exception` con causas y sin minuta. Contra Teno real: quickstart Escenarios 2 y 3.

### Tests for User Story 1 (primero, deben fallar)

- [ ] T008 [P] [US1] Tests del servicio en `apps/api/tests/test_escritura_auto_pipeline.py`: (a) feliz `exceptions_only` → completed con steps executed y decisión origin=system + trigger + molde/versión; (b) `every_sale` → awaiting_review sin aprobar; (c) blockers → exception con causas humanizadas, sin generación, notificación emitida; (d) retry sobre completed → completed sin efectos (steps skipped); (e) retry tras corregir → reanuda desde el paso pendiente; (f) warning de proyecto ausente → exception con causa "aviso legal sin confirmar"
- [ ] T009 [P] [US1] Tests del endpoint retry en `apps/api/tests/test_matriz_endpoints.py` (clase nueva `TestRetryCascade`): 200 con outcome, 404 cross-org, idempotencia

### Implementation for User Story 1

- [ ] T010 [US1] Crear `apps/api/services/escritura_auto_pipeline.py`: `run_case_cascade(case_id, trigger, supabase)` — staging (reusa `stage_operational_variables`) → snapshot (reusa `create_escritura_case_snapshot`) → blockers (reusa workflow service T005) → política de la org → aprobar system (`approval_origin='system'`, approved_by NULL, decisión en `legal_review_decisions` con trigger + molde/versión heredados) → `generate_case_minuta` (amparo del warning del proyecto) → entrega (ya integrada en la generación); registra `escritura_cascade_runs` (outcome, causes, steps) con idempotencia por paso (research D6)
- [ ] T011 [US1] `apps/api/services/escritura_sale_hook.py`: al validar la venta, disparar `run_case_cascade(trigger='sale_validated')` best-effort (una falla de cascada nunca revierte la venta; queda corrida exception)
- [ ] T012 [US1] Notificación de excepción en `apps/api/services/escritura_delivery.py`: mensaje Telegram a admins (lote + causas humanizadas + link a la mesa), registrado como delivery tipo `exception_notice`, best-effort (contracts §5)
- [ ] T013 [US1] Endpoint `POST /escritura-cases/{case_id}/retry-cascade` en `apps/api/api/v1/endpoints/escritura_matrices.py` (auth admin, tenant inferido, gatillo `manual_retry`) según contracts §1 + ruta proxy web `apps/web/src/app/api/escritura-cases/[caseId]/retry-cascade/route.ts` + helper `retryCascade()` en `apps/web/src/lib/documents/matriz-client.ts` (patrón submit/approve existente)
- [ ] T014 [US1] Campos `cascade_status`/`cascade_causes`/`cascade_last_run_at`/`approval_origin` en `MatrizCaseResponse` (`apps/api/schemas/escritura_matrices.py` + derivación en `_case_response`; casos sin corridas → `legacy`) + `pnpm contracts:generate`
- [ ] T015 [US1] `pnpm test:api` completo verde (nuevos + 677 existentes)

**Checkpoint**: MVP — la cascada corre de punta a punta; validar quickstart Escenarios 2 y 3 contra Teno real.

---

## Phase 4: User Story 2 — Revisión jurídica como política de la organización (P2)

**Goal**: la org elige `every_sale` (default, 1 acto: la revisión; al aprobarla la cascada termina sola) o `exceptions_only` (0 actos); cambio auditado, aplica a ventas futuras.

**Independent Test**: PATCH de política queda auditado; en `every_sale`, aprobar la revisión jurídica reanuda la cascada hasta la entrega sin más actos; rechazo → excepción con comentario.

### Tests for User Story 2 (primero, deben fallar)

- [ ] T016 [P] [US2] Vitest del server action de política en `apps/web/tests/settings-actions.test.ts`: solo admin de la org puede cambiarla, valor inválido rechazado, escribe `organizations.escritura_review_policy` y registra el cambio (de→a) vía `logAudit` en `audit_logs`
- [ ] T017 [P] [US2] Tests de reanudación en `apps/api/tests/test_escritura_auto_pipeline.py`: aprobar revisión → cascada continúa (trigger `review_approved`) hasta completed; rechazo → exception con comentario del revisor; four-eyes activo + `exceptions_only` → awaiting_review (research D8, gana el control más estricto)

### Implementation for User Story 2

- [ ] T018 [US2] Server action `updateEscrituraReviewPolicyAction` en `apps/web/src/app/(dashboard)/settings/actions.ts` (patrón casa de SDD016: chequeo admin vía `organization_members` + escritura directa + `logAudit` de `apps/web/src/lib/services/audit.service.ts` con valor anterior→nuevo). La cascada (FastAPI) solo LEE la columna — contracts §2
- [ ] T019 [US2] `submit_legal_review` (`apps/api/api/v1/endpoints/escritura_matrices.py`): decisión `aprobada` → `run_case_cascade(trigger='review_approved')`; `rechazada` → corrida exception con causa "revisión rechazada" + comentario
- [ ] T020 [US2] Interacción four-eyes en `escritura_auto_pipeline.py`: envío origin system satisface el distinct-reviewer para cualquier humano; `exceptions_only` + flag activo → detenerse en awaiting_review (D8)
- [ ] T021 [US2] Toggle de política en `apps/web/src/app/(dashboard)/settings/workspace/page.tsx` (pantalla de org de SDD016): selector con descripción de cada modo + quién/cuándo del último cambio; test Vitest del componente
- [ ] T022 [US2] Gates de la historia verdes (`pnpm test:api`, `pnpm --filter web test`, `pnpm typecheck:web`)

**Checkpoint**: quickstart Escenario 1 (1 acto) y Escenario 2 (0 actos) completos contra Teno real.

---

## Phase 5: User Story 4 — Warning legal una vez por proyecto (P3, adelantada)

**Goal**: confirmar el aviso de borrador UNA vez por proyecto; las generaciones (manuales y automáticas) heredan y registran el amparo.

**Independent Test**: confirmar en el checklist → generaciones posteriores no lo piden y cada una registra el amparo; proyecto sin confirmar → la cascada cae en excepción con esa causa (ya cubierto por T008-f).

### Tests for User Story 4 (primero, deben fallar)

- [ ] T023 [P] [US4] Tests en dos capas: Vitest del server action de confirmación (solo admin, idempotente — repetir responde la vigente sin sobre-escribir, registra `logAudit`) en `apps/web/tests/settings-actions.test.ts` o archivo propio; pytest en `apps/api/tests/test_matriz_endpoints.py` de que la generación copia el amparo del proyecto en `warning_acknowledged_by/_at`

### Implementation for User Story 4

- [ ] T024 [US4] Server action `acknowledgeMinutaWarningAction` (patrón casa: chequeo admin + update de `projects.minuta_warning_acknowledged_by/_at` + `logAudit`), en las actions del proyecto o de settings según dónde viva el checklist — contracts §3
- [ ] T025 [US4] `generate_case_minuta` (workflow service T005): exige amparo del proyecto (no el flag por-request) y copia `minuta_warning_acknowledged_by/_at` del proyecto a la generación; el parámetro `warning_acknowledged` del request queda como fallback legacy para proyectos pre-SDD017 (primera generación lo persiste al proyecto)
- [ ] T026 [US4] Paso "Confirmar aviso legal de minutas" en el checklist de preparación del proyecto (`apps/web/src/components/projects/` — checklist de SDD016), con quién/cuándo una vez confirmado; test Vitest

**Checkpoint**: la cascada corre sin diálogo de warning en proyectos confirmados.

---

## Phase 6: User Story 3 — La mesa como sala de control de excepciones (P2)

**Goal**: casos terminados = "Minuta entregada" + descarga; excepciones = causas accionables + Reintentar; fuera enviar/aprobar del camino feliz; sin diálogos de confirmación en acciones reversibles.

**Independent Test**: Vitest de `decideMesaVista`/acciones por `cascade_status`; manual: mesa de un caso completed y otro exception según quickstart Escenario 3-4.

### Tests for User Story 3 (primero, deben fallar)

- [ ] T027 [P] [US3] Tests en `apps/web/tests/mesa-escritura.test.ts`: vista por `cascade_status` (completed → entregada sin botones de workflow; exception → causas + Reintentar; awaiting_review → solo aprobar/rechazar revisión; legacy → comportamiento actual intacto)

### Implementation for User Story 3

- [ ] T028 [US3] `apps/web/src/components/documents/mesa/mesa-escritura.tsx`: rama por `cascade_status` (tipos del cliente generado); `legacy` conserva el flujo actual
- [ ] T029 [US3] `apps/web/src/components/documents/mesa/workflow-acciones.tsx`: quitar "Enviar a revisión"/"Aprobar" para casos con cascada; botón "Reintentar" → `POST retry-cascade`; quitar AlertDialogs de acciones reversibles (reintentar/regenerar; rechazar conserva el campo razón inline); quitar el diálogo de warning en "Generar" (el amparo viene del proyecto, US4)
- [ ] T030 [US3] `apps/web/src/components/documents/mesa/estado-preparacion.tsx` + `pendientes-list.tsx`: excepciones con causa humanizada + link de corrección (fix_url) + estado de la última corrida (`cascade_last_run_at`)
- [ ] T031 [US3] Vista "Minuta entregada": descarga + historial (`historial-generaciones.tsx`) + trazabilidad visible de aprobación system (molde/versión heredados — SC-005)
- [ ] T032 [US3] Gates de la historia: `pnpm --filter web test`, `pnpm typecheck:web`, `pnpm build:web` verdes

**Checkpoint**: todas las historias funcionales de punta a punta.

---

## Phase 7: Polish & Cierre

- [ ] T033 Ejecutar quickstart.md completo contra Teno real (4 escenarios) y registrar mediciones al pie (SC-001/002/003/004/006)
- [ ] T034 [P] Verificar conteo de acciones humanas del camino feliz: `every_sale` = 1, `exceptions_only` = 0 (SC-001/SC-002) y documentar en quickstart
- [ ] T035 [P] Actualizar handoff en `plotify_memori/50 - Implementaciones/` (SDD017) con decisiones y estado final
- [ ] T036 Gates finales completos: `pnpm test:api && pnpm --filter web test && pnpm typecheck:web && pnpm build:web && pnpm verify:migrations && pnpm contracts:generate` (sin diffs pendientes)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (migraciones)**: sin dependencias — T001-T003 en paralelo, T004 al final
- **Phase 2 (refactor workflow)**: independiente de Phase 1 (puede correr en paralelo); bloquea US1 y US3
- **US1 (Phase 3)**: requiere Phases 1 y 2 — es el MVP
- **US2 (Phase 4)**: requiere US1 (reanuda la cascada); el toggle web (T021) solo requiere T018
- **US4 (Phase 5)**: requiere Phase 1 (T002) y Phase 2 (T005); independiente de US2
- **US3 (Phase 6)**: requiere US1 (campos cascade en el contrato); T029 completo requiere US4 (quitar diálogo warning)
- **Polish (Phase 7)**: requiere todo lo anterior

### Parallel Opportunities

- T001 ∥ T002 ∥ T003 (archivos de migración distintos)
- Phase 1 ∥ Phase 2 (esquema vs. refactor puro)
- T008 ∥ T009 (tests en archivos distintos); T016 ∥ T017; dentro de US2: T018 ∥ T021 tras contratos
- US2 ∥ US4 (tras US1): tocan archivos distintos
- T034 ∥ T035 en el cierre

## Implementation Strategy

**MVP = Phases 1+2+3 (US1)**: con solo eso, una org en `exceptions_only` (seteada por SQL/config) ya vive el producto prometido: venta aprobada → minuta en Telegram. Validar contra Teno real (quickstart Esc. 2-3) ANTES de seguir — la memoria del proyecto es explícita en que los fakes ocultan bugs de PostgREST.

Luego entrega incremental: US2 (la política operable desde la UI + revisión reanudable) → US4 (warning por proyecto) → US3 (la mesa nueva) → Polish. Cada historia cierra con sus gates verdes (SC-007) y un commit por tarea o grupo lógico.
