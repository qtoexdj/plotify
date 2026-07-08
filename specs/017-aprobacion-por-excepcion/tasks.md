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
- [x] T004 Aplicado por el usuario (2026-07-08) vía `supabase db push`. Trampa de siempre: `verify_lot_as_admin_rpc` (SDD16) estaba en el historial remoto con el timestamp de aplicación (`20260707144949`) en vez del timestamp del archivo (`20260707020000`) — se reconcilió con `supabase migration repair --status reverted 20260707144949` + `--status applied 20260707020000` antes del push (contenido ya coincidía, verificado por SQL de solo lectura que el RPC existía). Las 3 migraciones de SDD017 se aplicaron limpias. Verificado por SQL de solo lectura: `organizations.escritura_review_policy` (default 'every_sale'), `projects.minuta_warning_acknowledged_by/_at` (nullable), `escritura_cascade_runs` existe, `escritura_matrices.approval_origin` (not null), `legal_review_decisions.decided_by` ahora nullable + origin/trigger/inherited_* presentes. `pnpm verify:migrations` verde.

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

- [x] T008 [P] [US1] `apps/api/tests/test_escritura_auto_pipeline.py` (9 tests): feliz `exceptions_only` → completed con steps executed y decisión origin=system+trigger+molde/versión; `every_sale` → awaiting_review, luego `review_approved` retoma y completa; blockers reales → exception + notificación Telegram (y no lanza si Telegram no está configurado); retry sobre completed → sin efectos; warning de proyecto ausente → exception tras aprobar la matriz; four-eyes+`exceptions_only` → awaiting_review (D8); abogado redactor faltante → exception (no skip silencioso)
- [x] T009 [P] [US1] `apps/api/tests/test_matriz_endpoints.py::TestRetryCascade` (3 tests): completa sin acción humana, idempotente sobre completed, exception con causas

### Implementation for User Story 1

- [x] T010 [US1] `apps/api/services/escritura_auto_pipeline.py`: `run_case_cascade()` — filtra el blocker "revision_juridica.estado pendiente" (checkpoint de política, espejo de `isLegalReviewActionOnlyBlocker`) de los blockers reales; sin blockers reales avanza submit→revisión jurídica (según policy+four-eyes, D8)→approve→generar+entregar a nombre del sistema; exige el warning del proyecto (US4) antes de generar; idempotente por paso (D6); registra `escritura_cascade_runs`. Requirió extender `escritura_case_workflow.py` (aditivo): `_insert_matriz_review_decision`/`_upsert_lot_variable` aceptan actor `None` + origin/trigger/inherited_*; `_generate_minuta_row` desacopla `generated_by` (nullable) de `warning_acknowledged_by/_at` (explícitos)
- [x] T011 [US1] `apps/api/workers/tasks/approval_processor.py`: tras el sale hook con `ready_for_borrador=True`, dispara `run_case_cascade(trigger='sale_validated')` best-effort. 3 tests nuevos en `test_venta_escritura_hook.py`
- [x] T012 [US1] Notificación de excepción: Telegram directo a admins con Telegram vinculado (`_resolve_org_admin_user_ids` + `_recipient_chat_id`), best-effort. **Desviación de contracts §5**: no se modeló como fila de `escritura_deliveries` (esa tabla exige `generation_id NOT NULL` + `channel` acotado a telegram/web — no hay generación en una excepción); en vez de eso queda trazado en `escritura_cascade_runs.steps`/`causes`. Contracts pendiente de actualizar para reflejar esto.
- [x] T013 [US1] `POST /escritura-cases/{case_id}/retry-cascade` + proxy web `escritura-matrices/case/[caseId]/retry-cascade/route.ts` (nombre de ruta ajustado al patrón real de `stage-operational`, no `escritura-cases/[caseId]/...`) + `retryCascade()` en `matriz-client.ts`
- [x] T014 [US1] Campos `cascade_status`/`cascade_causes`/`cascade_last_run_at`/`approval_origin` en `MatrizView`, derivados en `_case_response` de la última fila de `escritura_cascade_runs`; `pnpm contracts:generate` corrido (OpenAPI + `matriz-types.ts` mirror, patrón establecido de esta feature)
- [x] T015 [US1] 692 tests de API + 821 web verdes; `typecheck:web` limpio

**Extra (US2 adelantado, necesario para que every_sale entregue su promesa)**: `submit_legal_review` (SDD16) retoma la cascada con `trigger='review_approved'` tras la aprobación humana — sin esto, el modo `every_sale` nunca llegaba a generar sola tras el único acto humano (SC-002).

**Checkpoint MVP alcanzado en código y tests unitarios (FakeStore). Pendiente**: T004 (aplicar las 3 migraciones a Supabase) y correr el quickstart Escenarios 2-3 contra Teno real — sin la migración aplicada, `organizations.escritura_review_policy`/`projects.minuta_warning_acknowledged_by` no existen todavía en la base real.

---

## Phase 4: User Story 2 — Revisión jurídica como política de la organización (P2)

**Goal**: la org elige `every_sale` (default, 1 acto: la revisión; al aprobarla la cascada termina sola) o `exceptions_only` (0 actos); cambio auditado, aplica a ventas futuras.

**Independent Test**: PATCH de política queda auditado; en `every_sale`, aprobar la revisión jurídica reanuda la cascada hasta la entrega sin más actos; rechazo → excepción con comentario.

### Tests for User Story 2 (primero, deben fallar)

- [x] T016 [P] [US2] `apps/web/tests/settings-actions.test.ts` (8 tests): sin sesión, no-admin rechazado, membresía ausente rechazada, escribe+audita from→to, no-op idempotente sin cambio real, default 'every_sale' cuando la org no tiene valor previo, errores de lectura/escritura propagados
- [x] T017 [P] [US2] Cubierto en `test_escritura_auto_pipeline.py`: reanudación (`TestEverySalePolicy::test_review_approved_trigger_resumes_and_completes`), four-eyes+exceptions_only (`TestFourEyesInteraction`), y — encontrado al implementar, no estaba en el plan original — rechazo→exception con comentario (`TestLegalReviewRejected`, 2 tests) + test de endpoint (`test_reject_triggers_cascade_exception_run`)

### Implementation for User Story 2

- [x] T018 [US2] `updateEscrituraReviewPolicyAction` en `settings/actions.ts` (patrón casa: chequeo admin + escritura directa + `logAudit` con from→to). La cascada solo LEE la columna, ya implementado en T010.
- [x] T019 [US2] `submit_legal_review` retoma la cascada tras CUALQUIER decisión (no solo aprobada) con `trigger='review_approved'` — necesario para que el rechazo también quede reflejado como la corrida más reciente en `cascade_status`.
- [x] T020 [US2] Four-eyes ya implementado dentro de `run_case_cascade` (T010): `requires_human_review = policy=='every_sale' or (policy=='exceptions_only' and four_eyes_active)`.
- [x] T021 [US2] `WorkspaceEscrituraReviewPolicyForm` (selector + descripción de cada modo) montado en `settings/workspace/page.tsx`.
- [x] T022 [US2] `pnpm test:api` (696), `pnpm --filter web test` (829), `pnpm typecheck:web` y `pnpm build` (producción) verdes.

**Bug real encontrado y corregido al implementar T017** (no estaba en el diseño original, D8 no lo previó): `_evaluate_variable_gate` (`escritura_readiness.py`) solo chequeaba que `revision_juridica.estado` TUVIERA un valor, no cuál — 'rechazada' satisfacía el gate `legal_review_ready` igual que 'aprobada'. Sin el fix, un caso rechazado podía aprobarse igual (a mano o vía la cascada). Corregido: esa variable es la única cuyo valor exacto decide el gate. La cascada distingue "revisión pendiente" (awaiting_review) de "revisión rechazada" (exception inmediata con el motivo, nunca awaiting_review).

**Checkpoint alcanzado en código y tests (FakeStore + Vitest). Pendiente**: correr el quickstart Escenario 1 (1 acto) y Escenario 2 (0 actos) contra Teno real — Escenario 3 (excepción con causas reales + notificación Telegram) ya se validó en vivo contra el lote 14 de Teno.

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
