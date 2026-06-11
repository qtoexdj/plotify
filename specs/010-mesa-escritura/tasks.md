# Tasks: Mesa de Escritura — Consolidacion UX Legal

**Input**: Design documents from `/specs/010-mesa-escritura/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [agent-execution.md](./agent-execution.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. Contratos API aditivos, inventario de etiquetas,
vocabulario de pantalla, logica de presentacion migrada y no-regresion del
flujo de generacion documental.

**Organization**: Tareas agrupadas por fase/user story. Regla del repo: una
tarea sin checkear por pasada salvo pedido explicito de mayor alcance.
**Gates humanos**: T007 y T023 los marca solo el usuario, nunca un agente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable dentro de su fase si las dependencias estan listas.
- Cada tarea incluye rutas exactas y comando Verify.

## Phase 1: Setup

- [x] T001 Update active SDD pointers to 010 in `.agents/rules/sdd-implementation.md`, `.agents/rules/plotify-rules.md` and `AGENTS.md`; Verify: `pnpm format:check`
- [x] T002 Inventario de etiquetas: `VARIABLE_LABELS`, `VARIABLE_GROUP_LABELS` y `variable_label_for_key()` en `apps/api/services/legal_variable_catalog.py` (data-model §1) + test de cobertura 100% en `apps/api/tests/test_variable_catalog_labels.py` + test de paridad de etiquetas de grupo con la copia web del CCL (`apps/web/src/lib/legal/variable-resolution-types.ts`, que permanece para el CCL hasta el rediseno futuro — research D4); Verify: `pnpm test:api`
- [x] T003 [P] Diccionario server-side `apps/api/services/legal_microcopy.py` (gates, causas de bloqueo, tipos de alerta, acciones, estados — data-model §2) con tests de redaccion (caso `dl_3516`, `derechos_aguas`, `token_missing`); Verify: `pnpm test:api`

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T004 Manifiesto humanizado: extension aditiva de `apps/api/schemas/escritura_matrices.py` + `matriz_token_resolution.py` emite `label`/`category`/`category_label`/`source_label`, blockers ganan `title`/`description`/`action_label`/`action_href`, respuesta GET gana `insertable_variables` y `omitted_reason` (contracts/api-contracts.md); tests con snapshot Teno en `apps/api/tests/test_matriz_manifest_humanized.py`; Verify: `pnpm test:api`
- [x] T005 Regenerar contratos y tipos: `pnpm contracts:generate` + extension de `apps/web/src/lib/documents/matriz-types.ts`; Verify: `pnpm typecheck:web`
- [x] T006 [P] Vocabulario estatico de UI en `apps/web/src/lib/documents/matriz-microcopy.ts` (tabla ui-contracts §3) + test permanente de terminos prohibidos `apps/web/tests/mesa-vocabulario.test.ts` (corre sobre `components/documents/mesa/`); Verify: `pnpm test:web`
- [x] T007 **GATE (usuario)** Wireframes de las 5 pantallas clave (preparacion, mesa lectura, popover evidencia, edicion + picker, workflow de generacion) partiendo del mockup 2026-06-11; aprobacion explicita del usuario registrada en `quickstart.md` (2026-06-11: "apruebo las 5"); Verify: aprobacion del usuario (no automatizable) — **bloquea Fases 3-7**

## Phase 3: US2 — Llegada guiada y pendientes accionables (P1)

- [x] T008 [US2] `estado-preparacion.tsx` + `pendientes-list.tsx` en `apps/web/src/components/documents/mesa/` y orquestador `mesa-escritura.tsx` que decide preparacion vs mesa desde gates/blockers del GET (research D7); recablear `apps/web/src/app/(dashboard)/documentos/matriz/[caseId]/page.tsx`; tests en `apps/web/tests/mesa-escritura.test.ts`; Verify: `pnpm test:web`
- [ ] T009 [US2] CTA "Abrir mesa de escritura" + estados unificados del caso en el CCL del proyecto (vocabulario de `matriz-microcopy.ts`, handoff SDD 008); Verify: `pnpm test:web`

## Phase 4: US1 — Mesa de lectura con evidencia (P1)

- [ ] T010 [US1] `mesa-documento.tsx`: clausulas resueltas apiladas en orden, numeracion, tipografia serif del documento, bloques de titulo distinguidos con explicacion, clausulas omitidas consultables (`omitted_reason`), y toggle "Mostrar estructura" (FR-001, research D2) que alterna a los huecos de datos con nombre humano; Verify: `pnpm test:web`
- [ ] T011 [US1] `dato-chip.tsx` + `dato-popover.tsx`: estados verificado/por revisar/falta (AA, teclado), popover con etiqueta humana, valor, evidencia via `legal-evidence-viewer` compact o `source_label`, CTA "Corregir en Centro de Control Legal"; Verify: `pnpm test:web`
- [ ] T012 [P] [US1] `panel-datos.tsx`: datos agrupados por `category_label` con estado y acceso al mismo popover; Verify: `pnpm test:web`
- [ ] T013 [US1] `mesa-encabezado.tsx` (proyecto · lote · comprador, estado, contador de pendientes, acciones) + `mesa-indice.tsx` (navegacion + dnd-kit con fijas ancladas, logica de reorden migrada con sus tests desde `matriz-builder.test.ts`); Verify: `pnpm test:web && pnpm typecheck:web`

## Phase 5: US3 — Edicion en contexto (P2)

- [ ] T014 [US3] `clausula-editor-inline.tsx`: ProseKit montado in-place al click (una instancia activa, research D1), solo-lectura segun estado del workflow, `block_token` no editable dentro de la clausula (conserva la regla de schema SDD 008) con explicacion y link al panel de titulo (US3 escenario 3), guardado con optimistic locking y mensaje humano de conflicto; Verify: `pnpm test:web`
- [ ] T015 [US3] `insertar-dato-picker.tsx`: shadcn `Command` sobre `insertable_variables` agrupado por categoria, boton "Insertar dato" + atajo `@`, insercion de nodo `variable_token` con label del catalogo; Verify: `pnpm test:web`

## Phase 6: US4 — Workflow y generacion con lenguaje humano (P2)

- [ ] T016 [US4] `workflow-acciones.tsx`: enviar/aprobar/rechazar/generar con resumen humano previo, dialogo warning ADR-009 intacto (logica migrada de `matriz-approval-bar.tsx`), bloqueos mostrando `pendientes-list`; Verify: `pnpm test:web`
- [ ] T017 [P] [US4] `historial-generaciones.tsx` con descripciones humanas (quien/cuando/desde que version) + recableo de `documentos/historial/page.tsx`; Verify: `pnpm test:web`

## Phase 7: US5 — Plantillas sin JSON (P3)

- [ ] T018 [US5] `plantilla-editor.tsx` + `condicion-clausula-form.tsx`: mismo editor de la mesa con picker, condiciones declarativas mapeadas a `condition_key`/`condition_mode`, alerta elegida de lista humana, posicion por arrastre; API acepta `clause_key` omitido y lo autogenera (slug + sufijo ante colision) en `apps/api/api/v1/endpoints/escritura_templates.py`; recablear `documentos/plantillas/page.tsx`; tests api+web; Verify: `pnpm test:api && pnpm test:web`
- [ ] T019 [US5] Errores de catalogo humanizados: `invalid_keys` gana `display_text`/`suggested_label` en API y la UI los muestra con texto visible + sugerencia (FR-014); Verify: `pnpm test:api && pnpm test:web`

## Phase 8: Polish & Gates de Cierre

- [ ] T020 Retiro de la capa vieja (FR-018): eliminar `matriz-builder.tsx`, `matriz-view-switch.tsx`, `matriz-clause-editor.tsx`, `template-clause-form.tsx` y sus tests ya migrados; `apps/web/src/app/(dashboard)/documentos/page.tsx` con vocabulario nuevo; Verify: `pnpm build:web && pnpm test:web`
- [ ] T021 [P] Auditoria SC-002 + accesibilidad FR-016: completar `mesa-vocabulario.test.ts` con la lista vetada final + checklist pantalla-por-pantalla documentado en `quickstart.md` (paso A10) + recorrido completo por teclado y verificacion de contraste AA de los estados de chip (quickstart paso A12); Verify: `pnpm test:web`
- [ ] T022 Quickstart A completo (pasos 1-12: incluye no-regresion DOCX paso 7, medicion SC-007 paso 11 y accesibilidad paso 12) documentando resultados en `quickstart.md`; Verify: gates tecnicos completos (`pnpm test:api && pnpm test:web && pnpm typecheck:web && pnpm --filter web lint && pnpm format:check && pnpm build:web`)
- [ ] T023 **GATE (usuario)** Sesion de usabilidad observada (quickstart B): ≥ 4/5 en las tareas 1-5 sin ayuda y revision < 15 min, mas la tarea 6 de plantillas (SC-003) con perfil admin en la misma sesion o mini-sesion aparte tras T018; resultados registrados en `quickstart.md`; Verify: aprobacion del usuario (no automatizable) — **bloquea el cierre del feature**
- [ ] T024 Memoria y handoff: actualizar `plotify_memori/50 - Implementaciones/` con "SDD 010 Mesa de Escritura - Handoff" (estado implementado + pendientes para el rediseno completo del CCL) y punteros de memoria; Verify: `pnpm format:check`
