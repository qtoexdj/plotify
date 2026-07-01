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
- [x] T002 [P] Crear esqueleto de tests vitest de la matriz en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix.test.tsx` _(ya existe con tests de header, grupos, colapso SII y huecos de venta)_
- [x] T003 [P] Extender el test del inventario para cubrir `producer` por grupo/clave en `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_escrituras_variable_inventory.py` _(hecho 2026-06-30; cubre extracted/manual/sale_gap/authored/signing; `pnpm test:api` verde: 630 passed, 2 skipped)_

**Verify**: `pnpm test:api`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: contrato y helpers de presentación que toda user story necesita.

**CRITICAL**: ninguna user story arranca hasta cerrar esta fase.

- [x] T004 Exponer `producer` como `computed_field` en `VariableResolutionResponse` (derivado de `catalog.variable_producer`) en `/Users/matiasignacio/Developer/plotify/apps/api/schemas/legal_variables.py` _(hecho 2026-06-30)_
- [x] T005 Regenerar el contrato tipado con `pnpm contracts:generate` y verificar `producer: string` en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/services/plotify-chat.generated.ts` + `/Users/matiasignacio/Developer/plotify/packages/contracts/openapi/plotify-chat.v1.json` _(hecho 2026-06-30; tests inventario+catálogo verdes)_
- [x] T006 Definir el enum/labels de `producer` (extraída/manual/autoría/hueco de venta/firma) en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/legal/variable-resolution-types.ts` y los helpers de agrupación, colapso SII y progreso del molde en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/legal/variable-matrix-model.ts` _(hecho 2026-06-30)_
- [x] T007 [P] Tests unitarios de los helpers (agrupación por productor, colapso de `sii.unidad_nombre`+`sii.pre_rol_lote` por lote, conteo "por revisar", exclusión de `sale_gap`/`signing`) en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix-model.test.ts` — **9 tests verdes, reproducen Teno 13/21/34** _(hecho 2026-06-30)_
- [x] T008 Scaffold del orquestador `VariableMatrix` para `scope: project` en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/variable-matrix.tsx` (`scope: lot` queda solo como trazabilidad opcional si se decide exponerla)

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

- [x] T016 [P] [US2] Tests de colapso y bulk en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix.test.tsx`
- [x] T017 [US2] `SiiLotDetail` (Dialog con tabla por lote del certificado SII + ajuste manual de rol vía `PATCH /projects/{id}/legal-roles/{lotId}`, FR-013) en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/sii-lot-detail.tsx`, abierto desde "Ver lotes" (fila colapsada) y "Ver detalle por lote" (inspector). _(hecho 2026-06-30)_
- [x] T018 [US2] Aprobación en bloque cableada a `POST /projects/{id}/legal-variables/bulk-approve` por claves: botón "Aprobar N" por sección de productor (`producer-group.tsx`) + "Aprobar N lotes" en el inspector colapsado (`variable-inspector.tsx`), orquestado en `variable-matrix.tsx`. El molde queda 100% aprobable. _(hecho 2026-06-30)_
- [x] T019 [US2] Acción "ingresar dato" manual vía `PUT /projects/{id}/legal-variables/by-key` integrada en el productor `manual`

**Checkpoint**: US1+US2 funcionan; revisar un proyecto real es cuestión de minutos.

---

## Phase 5: User Story 3 - Huecos de venta visibles, no editables ni bloqueantes (Priority: P2)

**Goal**: comprador/precio/lote/servidumbre como "se completa en la venta", fuera del conteo.

**Independent Test**: en un proyecto sin ventas, los grupos de venta son informativos y el molde puede aprobarse.

- [x] T020 [P] [US3] Tests de exclusión del conteo y no-edición de `sale_gap`/`signing` en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix-model.test.ts`
- [x] T021 [US3] `SaleGapPanel` ("se completa en la venta", no editable) en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/legal/variable-matrix/sale-gap-panel.tsx`
- [x] T022 [US3] Excluir `sale_gap`/`signing` del progreso y del CTA "Aprobar molde" en `molde-progress-header.tsx` y los helpers

**Checkpoint**: el conteo es honesto; los huecos de venta no bloquean el molde.

---

## Phase 6: User Story 5 - Trazabilidad opcional de la escritura generada por venta (Priority: P3, opcional)

**Goal**: no agregar una revisión obligatoria por lote. Si se conserva esta story, debe ser una vista opcional de trazabilidad para confirmar que el documento del lote se rellenó desde la venta comercial; el flujo principal del abogado sigue siendo aprobar una sola vez el molde del proyecto.

**Independent Test**: pendiente de decisión de alcance. La validación principal debe demostrar que comprador/precio/lote/servidumbre se rellenan automáticamente al generar la escritura del lote, sin pedir al abogado revisar cada venta como paso normal.

- [ ] T023 [P] [US5] Test opcional de trazabilidad por venta: `sale_gap` con valor + origen "desde la venta", herencia del molde y **sin** acciones obligatorias en `/Users/matiasignacio/Developer/plotify/apps/web/tests/variable-matrix.test.tsx`
- [ ] T024 [US5] Modo lectura opcional para trazabilidad de caso/lote en `variable-matrix.tsx`, solo si se decide exponerlo; no debe componer una nueva cola de aprobación legal por lote.
- [ ] T025 [US5] Montar la vista opcional de trazabilidad donde hoy se ve el caso/lote de venta; fuera del cierre obligatorio del molde y sin bloqueo para ventas.

**Checkpoint**: el molde sigue siendo único; la venta rellena datos comerciales sin revisión obligatoria por lote.

---

## Phase 7: User Story 4 - Un solo lugar para variables y escritura (Priority: P3)

**Goal**: la matriz es la superficie principal; los paneles a medida se reemplazan; acceso a la escritura.

**Independent Test**: desde la matriz se llega a la matriz de escritura del proyecto sin buscar otra ruta.

- [x] T026 [US4] Eliminados `sag-article-two-panel.tsx` y `plano-archive-panel.tsx` (su detalle vive ahora en la matriz por productor) _(hecho 2026-06-30)_
- [x] T027 [US4] Quitada la tabla + formulario inline de Roles SII del CCL (override ahora en `sii-lot-detail.tsx`); CCL reescrito minimal (header + matriz + documentos/readiness/título). _(hecho 2026-06-30)_
- [x] T028 [US4] Acceso directo "Ver matriz de escritura" → `/documentos/matriz/proyecto/[projectId]` en la cabecera del CCL. (Contador de ventas/escrituras: opcional, diferido.) _(hecho 2026-06-30)_
- [x] T029 [US4] Eliminado el huérfano `legal-variable-table.tsx` (nunca montado; reemplazado por `variable-matrix/`). _(hecho 2026-06-30)_

**Checkpoint**: todas las user stories funcionan; acceso centralizado.

---

## Phase 8: Polish & Cross-Cutting

- [x] T030 [P] Conservar `legal-document-status-panel.tsx` y `escritura-readiness-panel.tsx` como contexto secundario (no portada) _(hecho: el CCL monta `VariableMatrix` primero y deja documentos/readiness/título bajo la matriz)_
- [x] T031 Validar `quickstart.md` contra Teno (las 13, colapso SII, vendedor visible, huecos fuera del conteo, molde aprobable; venta automática sin revisión legal por lote) _(hecho 2026-06-30 con `./.venv/bin/python scripts/verify_matriz_variables_ui_teno.py`; base quickstart 13/21/34, live actual Teno 2/32/34)_
- [x] T032 Correr gates: `pnpm typecheck:web`, `pnpm test:web`, `pnpm build:web`, `pnpm test:api`, `pnpm contracts:generate` _(hecho 2026-06-30; también `pnpm --filter web lint` y `pnpm format:check` verdes)_
- [x] T033 No-regresión (FR-011): suites de matriz/escritura/variables verdes; aprobar molde y generar escritura de Teno desde una venta siguen funcionando igual _(hecho 2026-06-30: `pnpm --filter web lint`, `pnpm format:check`, `pnpm typecheck:web`, `pnpm test:web`, `pnpm build:web`, `pnpm test:api`, `./.venv/bin/python scripts/verify_venta_escritura_supabase.py --allow-remote`)_

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2, bloqueante)** → user stories.
- **US1 (P1)** es el MVP; **US2/US3 (P2)** dependen de la fundación y de US1; **US4 (P3)** centraliza acceso; **US5 (P3 opcional)** solo agrega trazabilidad en lectura si se decide exponerla.
- Dentro de cada story: tests → componentes hoja ([P]) → orquestación → montaje en el CCL.

## Notes

- **Estado actual**: T001–T022 y T026–T033 están cerradas; T023–T025 quedan como trazabilidad opcional/futura.
- El motor no se toca (FR-011): toda acción usa endpoints existentes (PATCH variable, bulk-approve, by-key, legal-roles).
- Commit después de cada tarea o grupo lógico.
- **Excepción puntual y documentada a "el motor no se toca" (2026-06-30, alineación LOTE 29)**: se agregó
  `services/legal_variable_resolution._ensure_authored_variable_gaps`, invocada desde
  `get_project_variable_inventory` solo cuando `lot_id is None` (molde del proyecto). Corrige un bug verificado en
  Supabase (proyecto Teno: cero filas en `variable_resolutions` para `mandato.*`/`evidencia.*`/`personeria.*`/
  `clausulas.*` — todo el productor `authored` sin default de catálogo era invisible en la matriz aunque el
  template publicado lo exigiera al renderizar). El paso es autosanador (corre en cada fetch, sin migración de
  backfill), inserta únicamente filas `state=missing` para claves `authored` sin default referenciadas por el
  template publicado y sin fila existente; no toca resolución, gates, snapshot, aprobación en bloque ni el
  renderer. No es una reescritura del resolutor ni una feature nueva: es el cierre de un hueco de datos que el
  propio SDD 013 dejó expuesto al exponer `producer` en el inventario.
