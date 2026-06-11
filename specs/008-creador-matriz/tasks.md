# Tasks: Creador de Matriz y Minuta DOCX

**Input**: Design documents from `/specs/008-creador-matriz/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [agent-execution.md](./agent-execution.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. Migraciones, contratos API, aislamiento de tenant,
workflow legal y generacion documental con riesgo juridico.

**Organization**: Tareas agrupadas por fase/user story. Regla del repo: una
tarea sin checkear por pasada salvo pedido explicito de mayor alcance.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable dentro de su fase si las dependencias estan listas.
- Cada tarea incluye rutas exactas y comando Verify.

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Update active SDD pointers to 008 in `.agents/rules/sdd-implementation.md`, `.agents/rules/plotify-rules.md` and `AGENTS.md`; Verify: `pnpm format:check`
- [x] T002 Create migration `packages/database/supabase/migrations/20260611000100_creador_matriz.sql`: `escritura_templates`, `escritura_template_clauses`, `escritura_matrices`, `escritura_minuta_generations` con CHECKs, indices, triggers de scope, inmutabilidad de published/generations y RLS (data-model.md §1-4, §7); Verify: `pnpm verify:migrations`
- [x] T003 Regenerate database types in `packages/database/types/database.generated.ts`; Verify: `pnpm typecheck:web`
- [x] T004 [P] Add catalog keys from research D11 (comprador.nacionalidad, documento.notaria.jurisdiccion, clausulas.ocupantes_excepciones/exencion_eviccion_texto/entrega_fecha/gastos_excepciones, evidencia.gravamenes_excepciones/certificado_gp_referencia, personeria.delegacion_facultades) in `apps/api/services/legal_variable_catalog.py`; Verify: `pnpm test:api`
- [x] T005 [P] Build fixtures in `apps/api/tests/fixtures/matriz/`: snapshot Teno completo (titulo aprobado + operacionales aprobadas), fila `lot_records`/`lots` de prueba con boundaries_official, y template golden como JSON de clausulas (derivado de `labs/labs_escrituras/docs/template-draft.md` con clausula 2 → block_token `titulo.clausula_primero_texto`); Verify: `pnpm test:api`
- [x] T006 [P] Add web types in `apps/web/src/lib/documents/matriz-types.ts` (matriz, clauses, resolution manifest, blockers, template library); Verify: `pnpm typecheck:web`

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T007 Pydantic schemas (templates, clauses, matriz, resolution manifest, blockers, generations, requests) in `apps/api/schemas/escritura_matrices.py`; Verify: `pnpm test:api`
- [x] T008 Routers skeleton registrados en `apps/api/api/v1/endpoints/escritura_templates.py`, `apps/api/api/v1/endpoints/escritura_matrices.py` y `apps/api/api/v1/router.py`; Verify: `pnpm test:api`
- [x] T009 [P] Service skeleton `apps/api/services/escritura_operational_bridge.py` (mapeo research D3, hash de fila fuente, sin staging aun); Verify: `pnpm test:api`
- [x] T010 [P] Service skeleton `apps/api/services/matriz_token_resolution.py` (entrada/salida del manifiesto D6); Verify: `pnpm test:api`
- [x] T011 [P] Service skeleton `apps/api/services/matriz_docx_renderer.py` (walker de nodos ProseMirror, error explicito en nodo desconocido); Verify: `pnpm test:api`
- [x] T012 [P] ProseMirror schema compartido (variable_token, block_token, repeat_section, conditional_section; `schema_version: 1`) en `apps/web/src/lib/documents/matriz-schema.ts` + validador de claves en `apps/api/services/matriz_template_validation.py`; Verify: `pnpm test:api && pnpm typecheck:web`

## Phase 3: US6 — Puente de datos operacionales (P1)

- [x] T013 [US6] Bridge completo: lee `lot_records`/`lots`/`organization_payment_info`, propone comprador._/transaccion._/lote._/servidumbre._ via `LegalVariableResolutionService` con source_type system/geometry/derived y `source_ref.source_row_hash` en `apps/api/services/escritura_operational_bridge.py`; tests en `apps/api/tests/test_matriz_operational_bridge.py` (mapeo campo a campo, faltantes ⇒ missing); Verify: `pnpm test:api`
- [x] T014 [US6] Derivadas en palabras: `transaccion.precio_letras`, `lote.superficie_texto/ha_texto`, `servidumbre.superficie_texto` reutilizando `services/legal_title_words.py` (agregar alli `pesos_to_words` si el formato lo exige, con tests); Verify: `pnpm test:api`
- [x] T015 [US6] Idempotencia y re-proposicion: mismo hash ⇒ skip; hash distinto ⇒ supersede + nueva propuesta; jamas toca approved; tests de regresion en `test_matriz_operational_bridge.py`; Verify: `pnpm test:api`
- [x] T016 [US6] Integrar bridge en creacion de caso + endpoint `POST /escritura-cases/{id}/stage-operational` (contracts) y composicion de `lote.deslindes` desde `boundaries_official`; verificar gates party/price/geometry con fixture Teno en `apps/api/tests/test_matriz_operational_gates.py`; Verify: `pnpm test:api`

## Phase 4: US1 — Biblioteca y builder (P1)

- [x] T017 [US1] Endpoints biblioteca (list/create/clone, upsert clause con validacion de catalogo + suggested_migration, publish con inmutabilidad) en `escritura_templates.py`; tests en `apps/api/tests/test_matriz_templates.py`; Verify: `pnpm test:api`
- [x] T018 [US1] Seed del template "Compraventa predio rustico" v1 desde el fixture golden (script/seed idempotente por org) en `apps/api/scripts/seed_matriz_template.py`; Verify: `pnpm test:api`
- [x] T019 [US1] Resolutor completo: tokens escalares, block_tokens de titulo, repeat_sections (inscripciones/propietarios/representantes/detalle_pago con palabras registrales), conditional_sections, manifiesto con missing/blocked; tests con snapshot Teno en `apps/api/tests/test_matriz_resolution.py`; Verify: `pnpm test:api`
- [x] T020 [US1] Endpoints matriz: GET case (lazy create + resolucion + blockers), PUT guardado con optimistic locking y snapshot_stale en `escritura_matrices.py`; tests en `apps/api/tests/test_matriz_endpoints.py`; Verify: `pnpm test:api`
- [x] T021 [P] [US1] Proxies Next.js en `apps/web/src/app/api/escritura-matrices/...` y `apps/web/src/app/api/escritura-templates/...` + cliente en `apps/web/src/lib/documents/matriz-client.ts`; Verify: `pnpm typecheck:web`
- [x] T022 [US1] Builder UI: `matriz-builder.tsx` + `matriz-clause-editor.tsx` (ProseKit, 4 nodos, chips de estado, block de titulo no editable) en `apps/web/src/components/documents/matriz/` y ruta `apps/web/src/app/(dashboard)/documentos/matriz/[caseId]/page.tsx`; tests en `apps/web/tests/matriz-builder.test.ts`; Verify: `pnpm test:web && pnpm typecheck:web`
- [x] T023 [P] [US1] Biblioteca UI: `template-library.tsx` + `template-clause-form.tsx` con validacion de claves inline y ruta `documentos/plantillas/page.tsx` nueva; Verify: `pnpm test:web`

## Phase 5: US2 — Generacion DOCX (P1)

- [ ] T024 [US2] Renderer DOCX completo (estilos minuta: clausulas numeradas en negrita, parrafos justificados, bloques de titulo verbatim) en `matriz_docx_renderer.py`; tests round-trip python-docx en `apps/api/tests/test_matriz_docx.py` (orden, cero tokens sin resolver, PRIMERO verbatim); Verify: `pnpm test:api`
- [ ] T025 [US2] Endpoint generate: precondiciones (approved + snapshot vigente + warning ack), persistencia en `escritura_minuta_generations` + Storage + URL firmada; tests incl. 409/422 en `test_matriz_endpoints.py`; Verify: `pnpm test:api`
- [ ] T026 [US2] UI generacion: `matriz-approval-bar.tsx` (dialogo warning ADR-009, descarga) + `generation-history.tsx` + recableo de `documentos/historial/page.tsx` a la tabla nueva; Verify: `pnpm test:web`

## Phase 6: US3 — Vistas y evidencia (P2)

- [ ] T027 [US3] `matriz-view-switch.tsx` con modos template/resuelto/evidencia alimentados por el manifiesto; Verify: `pnpm test:web`
- [ ] T028 [US3] Vista evidencia: reutilizar `legal-evidence-viewer.tsx` por token (snippet/pagina/documento desde evidence_snapshot) + boton "Corregir en Centro de Control Legal" con deep link; Verify: `pnpm test:web`

## Phase 7: US4 — Orden y contrato de alertas (P2)

- [ ] T029 [US4] dnd-kit sortable con `fixed_position` anclado y persistencia de `clause_order` (PUT con CAS); tests de orden en `matriz-builder.test.ts`; Verify: `pnpm test:web`
- [ ] T030 [US4] Contrato de alertas server-side: blockers `alert_clause_missing` desde `titulo.alertas_resueltas[]` × `alert_tipo` de clausulas activas; razon de dismissed en respuesta; tests en `test_matriz_endpoints.py` (caso derechos_aguas Teno); Verify: `pnpm test:api`
- [ ] T031 [US4] UI blockers (patron title-blocking-list) + sidebar con razones de alertas descartadas; Verify: `pnpm test:web`

## Phase 8: US5 — Workflow de revision (P3)

- [ ] T032 [US5] Transiciones submit/approve/reject con revisor autorizado, auditoria en `legal_review_decisions`, candado de editor en approved; tests en `test_matriz_endpoints.py`; Verify: `pnpm test:api`
- [ ] T033 [US5] Supersesion: deteccion de snapshot_hash divergente en GET/PUT/generate, vuelta a draft preservando historial, banner `snapshot_stale` + recarga en UI; tests api+web; Verify: `pnpm test:api && pnpm test:web`

## Phase 9: Polish & Cross-Cutting

- [ ] T034 Retirar paginas MVP (`documentos/generar`, `documentos/bloques`, `documentos/plantillas` viejas) de navegacion y rutas; marcar `document_engine.py`/`document_generator.py` como deprecated sin rutas (eliminacion en tarea separada si nada los importa); Verify: `pnpm build:web && pnpm test:api`
- [ ] T035 [P] Regresion tenant cross-org/cross-project para los 4 recursos nuevos (patron TestTenantRegression) en `apps/api/tests/test_matriz_endpoints.py`; Verify: `pnpm test:api`
- [ ] T036 [P] Contracts: regenerar OpenAPI (`pnpm contracts:generate`) y tipos `plotify-chat.generated.ts`; Verify: `pnpm typecheck:web`
- [ ] T037 Quickstart E2E Teno completo (quickstart.md pasos 1-8) documentando resultados; actualizar `plotify_memori/50 - Implementaciones/SDD 008 Creador de Matriz - Handoff.md` a estado implementado + handoff de consolidacion UX legal; Verify: `pnpm format:check`
