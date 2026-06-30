# Tasks: Matriz de Variables por Productor — Rediseño del Centro de Control Legal

**Input**: Design documents from `/specs/013-matriz-variables-ui/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Requeridos por la constitución (VI) y los criterios de éxito para el contrato del inventario y las superficies web.

**Organization**: Tareas agrupadas por user story para implementarlas y probarlas de forma independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias)
- **[Story]**: a qué user story pertenece (US1–US5)
- Rutas de archivo absolutas en cada descripción

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: preparar el carril del feature y los blancos de test sin cambiar comportamiento.

- [x] T001 Confirmar contexto `013-matriz-variables-ui` en `/Users/matiasignacio/Developer/plotify/.specify/feature.json`
- [ ] T002 [P] Crear esqueleto de tests vitest de la matriz en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix.test.tsx`
- [ ] T003 [P] Extender el test del inventario para cubrir `producer` por grupo/clave en `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_escrituras_variable_inventory.py`

**Verify**: `pnpm test:api`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: contrato y helpers de presentación que toda user story necesita.

**CRITICAL**: ninguna user story arranca hasta cerrar esta fase.

- [x] T004 Exponer `producer` como `computed_field` en `VariableResolutionResponse` (derivado de `catalog.variable_producer`) en `/Users/matiasignacio/Developer/plotify/apps/api/schemas/legal_variables.py` _(hecho 2026-06-30)_
- [x] T005 Regenerar el contrato tipado con `pnpm contracts:generate` y verificar `producer: string` en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/services/plotify-chat.generated.ts` + `/Users/matiasignacio/Developer/plotify/packages/contracts/openapi/plotify-chat.v1.json` _(hecho 2026-06-30; tests inventario+catálogo verdes)_
- [x] T006 Definir el enum/labels de `producer` (extraída/manual/autoría/hueco de venta/firma) en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/legal/variable-resolution-types.ts` y los helpers de agrupación, colapso SII y progreso del molde en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/legal/variable-matrix-model.ts` _(hecho 2026-06-30)_
- [x] T007 [P] Tests unitarios de los helpers (agrupación por productor, colapso de `sii.unidad_nombre`+`sii.pre_rol_lote` por lote, conteo "por revisar", exclusión de `sale_gap`/`signing`) en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix-model.test.ts` — **9 tests verdes, reproducen Teno 13/21/34** _(hecho 2026-06-30)_
- [x] T008 Scaffold del orquestador `VariableMatrix` (modos `scope: project | lot`) en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/variable-matrix.tsx`

**Verify**: `pnpm test:web`

**Checkpoint**: fundación lista — las user stories pueden arrancar.

---

## Phase 3: User Story 1 - Revisar y aprobar el molde por productor (Priority: P1) 🎯 MVP

**Goal**: ver y resolver las variables del molde agrupadas por productor, con evidencia, hasta dejarlo aprobable.

**Independent Test**: en Teno, ver las 13 decisiones por productor, aprobar extraídas/manuales y habilitar "Aprobar molde" sin la pantalla vieja.

- [x] T009 [P] [US1] Test de componentes (grupo por productor, fila con valor/confianza/fuente, inspector de evidencia) en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix.test.tsx`
- [x] T010 [P] [US1] `VariableRow` (valor · confianza · fuente · acciones aprobar/corregir/no aplica) en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/variable-row.tsx`
- [x] T011 [P] [US1] `VariableInspector` con evidencia lado a lado reutilizando `LegalEvidenceViewer` en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/variable-inspector.tsx`
- [x] T012 [US1] `ProducerGroup` (sección por productor, orden extracted→manual→authored→sale_gap) en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/producer-group.tsx`
- [x] T013 [US1] `MoldeProgressHeader` (progreso "por revisar"/listas + CTA "Aprobar molde") en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/molde-progress-header.tsx`
- [x] T014 [US1] Cablear aprobar/corregir/no-aplica al endpoint existente `PATCH /projects/{id}/legal-variables/{variableId}` desde `variable-matrix.tsx` (sin tocar el motor)
- [x] T015 [US1] Montar `VariableMatrix scope=project` reemplazando la sección de variables y los 3 KPI cards en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/detail/legal-control-center.tsx`

**Checkpoint**: US1 funcional y testeable de forma independiente (el molde se revisa por productor).

---

## Phase 4: User Story 2 - Colapsar repeticiones por lote y aprobar en bloque (Priority: P2)

**Goal**: las repeticiones SII se ven como una entrada; aprobación en bloque por grupo/fuente.

**Independent Test**: en Teno las 106 filas SII son una entrada "53 lotes" y "Aprobar" las resuelve; el conteo baja a 13.

- [ ] T016 [P] [US2] Tests de colapso y bulk en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix.test.tsx`
- [ ] T017 [US2] `SiiLotGroup` (fila colapsada "Roles SII · N lotes" + detalle por lote + ajuste manual de rol vía `PATCH /projects/{id}/legal-roles/{lotId}`, FR-013) en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/sii-lot-group.tsx`
- [ ] T018 [US2] `BulkApproveBar` cableado a `POST /projects/{id}/legal-variables/bulk-approve` (por grupo y por claves) en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/bulk-approve-bar.tsx`
- [ ] T019 [US2] Acción "ingresar dato" manual vía `PUT /projects/{id}/legal-variables/by-key` integrada en el productor `manual`

**Checkpoint**: US1+US2 funcionan; revisar un proyecto real es cuestión de minutos.

---

## Phase 5: User Story 3 - Huecos de venta visibles, no editables ni bloqueantes (Priority: P2)

**Goal**: comprador/precio/lote/servidumbre como "se completa en la venta", fuera del conteo.

**Independent Test**: en un proyecto sin ventas, los grupos de venta son informativos y el molde puede aprobarse.

- [ ] T020 [P] [US3] Tests de exclusión del conteo y no-edición de `sale_gap`/`signing` en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix-model.test.ts`
- [ ] T021 [US3] `SaleGapPanel` ("se completa en la venta", no editable) en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/sale-gap-panel.tsx`
- [ ] T022 [US3] Excluir `sale_gap`/`signing` del progreso y del CTA "Aprobar molde" en `molde-progress-header.tsx` y los helpers

**Checkpoint**: el conteo es honesto; los huecos de venta no bloquean el molde.

---

## Phase 6: User Story 5 - Revisar el borrador de venta de un lote (Priority: P2)

**Goal**: la misma matriz a nivel lote, con los huecos de venta ya rellenos "desde la venta".

**Independent Test**: con un lote vendido y validado, su borrador muestra los datos de venta rellenos y el resto heredado del molde.

- [ ] T023 [P] [US5] Test del modo lote (huecos de venta con valor + origen "desde la venta", herencia del molde) en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix.test.tsx`
- [ ] T024 [US5] Modo `scope=lot` en `variable-matrix.tsx` (inventario del caso; `sale_gap` con valor, solo lectura) leyendo el inventario por lote
- [ ] T025 [US5] Montar la matriz del borrador donde hoy se ve el caso/lote de venta (superficie de revisión legal del borrador)

**Checkpoint**: el ciclo completo (molde → venta → borrador) usa una sola matriz por productor.

---

## Phase 7: User Story 4 - Un solo lugar para variables y escritura (Priority: P3)

**Goal**: la matriz es la superficie principal; los paneles a medida se reemplazan; acceso a la escritura.

**Independent Test**: desde la matriz se llega a la matriz de escritura del proyecto sin buscar otra ruta.

- [ ] T026 [US4] Eliminar `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/sag-article-two-panel.tsx` y `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/plano-archive-panel.tsx`, migrando su detalle al productor correspondiente
- [ ] T027 [US4] Quitar la tabla + formulario inline de Roles SII de `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/detail/legal-control-center.tsx` (su override vive ahora en `sii-lot-group.tsx`)
- [ ] T028 [US4] Agregar acceso directo a la matriz de escritura del proyecto (`/documentos/matriz/proyecto/[projectId]`) y, si hay ventas, contador de borradores
- [ ] T029 [US4] Resolver el destino del huérfano `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/legal-variable-table.tsx` (reemplazado por `variable-matrix/`) — eliminar o reusar

**Checkpoint**: todas las user stories funcionan; acceso centralizado.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T030 [P] Conservar `legal-document-status-panel.tsx` y `escritura-readiness-panel.tsx` como contexto secundario (no portada)
- [ ] T031 Validar `quickstart.md` contra Teno (las 13, colapso SII, vendedor visible, huecos fuera del conteo, molde aprobable, borrador con venta rellena)
- [ ] T032 Correr gates: `pnpm typecheck:web`, `pnpm test:web`, `pnpm build:web`, `pnpm test:api`, `pnpm contracts:generate`
- [ ] T033 No-regresión (FR-011): suites de matriz/escritura/variables verdes; aprobar molde y generar borrador de Teno siguen funcionando igual

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2, bloqueante)** → user stories.
- **US1 (P1)** es el MVP; **US2/US3/US5 (P2)** dependen de la fundación y de US1 para la superficie; **US4 (P3)** al final (limpieza/centralización).
- Dentro de cada story: tests → componentes hoja ([P]) → orquestación → montaje en el CCL.

## Notes

- **T004 y T005 ya están hechas** en este ciclo (backend `producer` + `contracts:generate`, tests verdes). El resto está pendiente.
- El motor no se toca (FR-011): toda acción usa endpoints existentes (PATCH variable, bulk-approve, by-key, legal-roles).
- Commit después de cada tarea o grupo lógico.
