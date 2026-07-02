# Tasks: Motor de Servidumbres de Precision para Visor de Proyecto

**Input**: Design documents from `/specs/014-servidumbre-precision-visor/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Requeridos por la constitucion y por peticion explicita del usuario. Todo cambio de calculo debe partir con tests que fallen antes de implementar.

**Organization**: Tareas agrupadas por user story para permitir implementacion incremental. No avanzar a otra tarea si el usuario pide implementar solo una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo si toca archivos distintos y no depende de tareas incompletas.
- **[Story]**: US1-US5 segun `spec.md`.
- Cada tarea incluye rutas absolutas para facilitar ejecucion por agentes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: preparar contexto, dependencia geoespacial y fixtures sin cambiar comportamiento productivo.

- [x] T001 Confirmar feature activo `specs/014-servidumbre-precision-visor` en `/Users/matiasignacio/Developer/plotify/.specify/feature.json`
- [ ] T002 Ejecutar `git status --short` y `codegraph sync .` desde `/Users/matiasignacio/Developer/plotify` antes de modificar codigo
- [ ] T003 [P] Crear helpers de fixtures metricos WGS84 para tests en `/Users/matiasignacio/Developer/plotify/apps/web/tests/lib/geometry/servidumbre-fixtures.ts`
- [ ] T004 [P] Agregar dependencia modular `@turf/union` en `/Users/matiasignacio/Developer/plotify/apps/web/package.json` y actualizar `/Users/matiasignacio/Developer/plotify/pnpm-lock.yaml`

**Verify**:

```bash
pnpm install --lockfile-only
```

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: motor puro y base legal de area. Bloquea todas las user stories.

- [ ] T005 [P] Agregar tests fallidos para Polygon/MultiPolygon con huecos en `/Users/matiasignacio/Developer/plotify/apps/web/tests/lib/geometry/compute-m2.test.ts`
- [ ] T006 [P] Agregar tests fallidos de huellas, union, anchos 5/10 y doble conteo en `/Users/matiasignacio/Developer/plotify/apps/web/tests/lib/geometry/servidumbre-footprints.test.ts`
- [ ] T007 Implementar area legal UTM para Polygon/MultiPolygon con huecos en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/geometry/compute-m2.ts`
- [ ] T008 Implementar motor puro `normalizeRoadSegmentToFootprint` y `calculateLotServitude` en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/geometry/servidumbre-footprints.ts`
- [ ] T009 Integrar adaptador legacy desde `calculateServidumbre` hacia el nuevo motor sin romper firmas existentes en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/geometry/servidumbre.ts`
- [ ] T010 Actualizar tests E2E existentes para aceptar area legal UTM y conservar redaccion de servidumbre en `/Users/matiasignacio/Developer/plotify/apps/web/tests/lib/geometry/engine-e2e.test.ts`

**Verify**:

```bash
cd apps/web
./node_modules/.bin/vitest run tests/lib/geometry/compute-m2.test.ts tests/lib/geometry/servidumbre-footprints.test.ts tests/lib/geometry/engine-e2e.test.ts --reporter=verbose --pool=forks
```

**Checkpoint**: motor puro listo, sin Supabase ni UI.

---

## Phase 3: User Story 1 - Calcular servidumbre desde huellas reales y anchos por camino (Priority: P1) MVP

**Goal**: persistir caminos/tramos con interpretacion explicita y recalcular lotes desde huellas reales.

**Independent Test**: fixtures de onboarding guardan caminos 5/10/poligono y persisten resultados por lote.

### Tests for User Story 1

- [ ] T011 [P] [US1] Agregar tests fallidos de servicio para guardar caminos con `input_mode`, `width_m` y `footprint_geometry` en `/Users/matiasignacio/Developer/plotify/apps/web/tests/onboarding-servidumbre.test.ts`
- [ ] T012 [P] [US1] Agregar validacion estatica de la migracion SDD14 (tabla `project_road_segments`, campos nuevos de `lots` y comentarios legales) en `/Users/matiasignacio/Developer/plotify/packages/database/scripts/assert-canonical-migrations.mjs`

### Implementation for User Story 1

- [ ] T013 [US1] Crear migracion `project_road_segments` y campos nuevos de `lots` en `/Users/matiasignacio/Developer/plotify/packages/database/supabase/migrations/20260702000100_servidumbre_precision.sql`
- [ ] T014 [US1] Actualizar tipos manuales de base en `/Users/matiasignacio/Developer/plotify/apps/web/src/types/database.types.ts`
- [ ] T015 [US1] Actualizar tipos generados de database para campos/tablas SDD14 en `/Users/matiasignacio/Developer/plotify/packages/database/types/database.generated.ts`
- [ ] T016 [US1] Extender payloads de onboarding para modo/ancho de camino en `/Users/matiasignacio/Developer/plotify/apps/web/src/types/onboarding.types.ts`
- [ ] T017 [US1] Reescribir guardado de infraestructura para persistir segmentos y recalcular lotes en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/services/onboarding.service.ts`
- [ ] T018 [US1] Mantener adaptador legacy para proyectos con solo `projects.road_geometry` en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/services/onboarding.service.ts`
- [ ] T019 [US1] Ajustar rutas de onboarding para validar modo/ancho sin romper payloads antiguos en `/Users/matiasignacio/Developer/plotify/apps/web/src/app/api/onboarding/save-infrastructure/route.ts`
- [ ] T020 [US1] Recalcular lote al asignar geometria despues de existir caminos en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/services/onboarding.service.ts`

**Verify**:

```bash
pnpm verify:migrations
cd apps/web
./node_modules/.bin/vitest run tests/onboarding-servidumbre.test.ts --reporter=verbose --pool=forks
```

**Checkpoint**: US1 entrega servidumbre persistida por lote desde caminos interpretados.

---

## Phase 4: User Story 2 - Registrar y mostrar anchos multiples por lote (Priority: P1)

**Goal**: guardar y mostrar `5`, `10` o `5 y 10` por lote, con compatibilidad legacy.

**Independent Test**: un lote afectado por caminos 5 y 10 persiste widths `[5,10]`, label `5 y 10` y area sin doble conteo.

### Tests for User Story 2

- [ ] T021 [P] [US2] Agregar tests fallidos de formato de anchos en `/Users/matiasignacio/Developer/plotify/apps/web/tests/lib/geometry/servidumbre-footprints.test.ts`
- [ ] T022 [P] [US2] Agregar tests fallidos de panel de lote con ancho multiple en `/Users/matiasignacio/Developer/plotify/apps/web/tests/viewer-servidumbre-overlay.test.tsx`

### Implementation for User Story 2

- [ ] T023 [US2] Implementar helper `formatServidumbreWidths` en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/geometry/servidumbre-footprints.ts`
- [ ] T024 [US2] Persistir `servidumbre_widths_m` y `servidumbre_ancho_label` desde el recalculo en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/services/onboarding.service.ts`
- [ ] T025 [US2] Extender `LotDetails` y `ViewerFeature` para anchos multiples en `/Users/matiasignacio/Developer/plotify/apps/web/src/types/viewer.types.ts`
- [ ] T026 [US2] Mostrar ancho(s), superficie total, servidumbre y superficie util en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/viewer/LotInfoView.tsx`

**Verify**:

```bash
cd apps/web
./node_modules/.bin/vitest run tests/lib/geometry/servidumbre-footprints.test.ts tests/viewer-servidumbre-overlay.test.tsx --reporter=verbose --pool=forks
```

**Checkpoint**: US2 representa correctamente el caso `5 y 10`.

---

## Phase 5: User Story 3 - Renderizar la superficie afecta en el visor (Priority: P2)

**Goal**: mostrar huella afecta como overlay MapLibre y mantener seleccion/hover coherente.

**Independent Test**: viewer service expone features `servitude` y `MapLotLayers` crea capas fill/outline filtradas.

### Tests for User Story 3

- [ ] T027 [P] [US3] Agregar tests fallidos de feature collection con overlays en `/Users/matiasignacio/Developer/plotify/apps/web/tests/viewer-servidumbre-overlay.test.tsx`
- [ ] T028 [P] [US3] Agregar tests fallidos de capas MapLibre para `geometry_type = servitude` en `/Users/matiasignacio/Developer/plotify/apps/web/tests/viewer-servidumbre-overlay.test.tsx`

### Implementation for User Story 3

- [ ] T029 [US3] Seleccionar campos nuevos de servidumbre y emitir features `servitude` en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/services/viewer.service.ts`
- [ ] T030 [US3] Agregar `servitude` al tipo/union de geometria del visor en `/Users/matiasignacio/Developer/plotify/apps/web/src/types/viewer.types.ts`
- [ ] T031 [US3] Agregar capas MapLibre de fill/outline para servidumbre en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/geometry-viewer/MapLotLayers.tsx`
- [ ] T032 [US3] Asegurar que hover/click sobre overlay resuelva el lote dueño en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/projects/geometry-viewer/MapLotLayers.tsx`

**Verify**:

```bash
cd apps/web
./node_modules/.bin/vitest run tests/viewer-servidumbre-overlay.test.tsx --reporter=verbose --pool=forks
```

**Checkpoint**: US3 deja validacion visual de la superficie afecta.

---

## Phase 6: User Story 4 - Mantener consistencia legal y documental (Priority: P2)

**Goal**: variables, documentos y generadores usan los mismos valores persistidos que el visor.

**Independent Test**: documento/variable de un lote con `servidumbre_ancho_label = "5 y 10"` usa ese label y la superficie persistida.

### Tests for User Story 4

- [ ] T033 [P] [US4] Agregar tests fallidos de generacion documental con `servidumbre_ancho_label` en `/Users/matiasignacio/Developer/plotify/apps/web/tests/servidumbre-documents.test.ts`
- [ ] T034 [P] [US4] Agregar tests Python del puente operacional para `servidumbre_ancho_label` en `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_matriz_operational_bridge.py`

### Implementation for User Story 4

- [ ] T035 [US4] Actualizar wizard/documentos web para preferir label sobre ancho numerico en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/dashboard/documents/generation-wizard.tsx`
- [ ] T036 [US4] Actualizar generador legal de servidumbre para anchos multiples sin romper cabeza/occlusion en `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/legal/servidumbre-generator.ts`
- [ ] T037 [US4] Actualizar puente operacional Python para exponer `servidumbre_ancho_label` en `/Users/matiasignacio/Developer/plotify/apps/api/services/escritura_operational_bridge.py`
- [ ] T038 [US4] Actualizar motor documental Python para preferir `servidumbre_ancho_label` en `/Users/matiasignacio/Developer/plotify/apps/api/services/document_engine.py`

**Verify**:

```bash
cd apps/web
./node_modules/.bin/vitest run tests/servidumbre-documents.test.ts --reporter=verbose --pool=forks
pnpm test:api
```

**Checkpoint**: US4 elimina divergencia entre visor y documentos.

---

## Phase 7: User Story 5 - Validar contra casos de plano real y regresiones geometricas (Priority: P2)

**Goal**: fixture tipo Teno y suite completa que proteja el calculo fundacional.

**Independent Test**: la suite falla si se vuelve a ancho unico global, area Turf persistida o falta overlay.

### Tests for User Story 5

- [ ] T039 [P] [US5] Crear fixture Teno-like con casos 5, 10, 5 y 10, cero, solape y hueco en `/Users/matiasignacio/Developer/plotify/apps/web/tests/lib/geometry/teno-servidumbre.fixture.ts`
- [ ] T040 [P] [US5] Agregar tests de identidad `util + servidumbre = total` en `/Users/matiasignacio/Developer/plotify/apps/web/tests/lib/geometry/servidumbre-footprints.test.ts`
- [ ] T041 [P] [US5] Agregar tests de no-regresion legacy ancho unico en `/Users/matiasignacio/Developer/plotify/apps/web/tests/lib/geometry/engine-e2e.test.ts`

### Implementation for User Story 5

- [ ] T042 [US5] Agregar script read-only de verificacion de fixtures Teno-like en `/Users/matiasignacio/Developer/plotify/apps/web/scripts/verify_servidumbre_precision_teno.ts`
- [ ] T043 [US5] Documentar resultado y comandos en `/Users/matiasignacio/Developer/plotify/plotify_memori/50 - Implementaciones/SDD 014 Servidumbre Precision Visor.md`

**Verify**:

```bash
cd apps/web
./node_modules/.bin/vitest run tests/lib/geometry/servidumbre-footprints.test.ts tests/lib/geometry/engine-e2e.test.ts --reporter=verbose --pool=forks
```

**Checkpoint**: US5 deja el calculo protegido por regresiones Teno-like.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T044 Ejecutar `pnpm verify:migrations` desde `/Users/matiasignacio/Developer/plotify`
- [ ] T045 Ejecutar `pnpm --filter web lint` desde `/Users/matiasignacio/Developer/plotify`
- [ ] T046 Ejecutar `pnpm format:check` desde `/Users/matiasignacio/Developer/plotify`
- [ ] T047 Ejecutar `pnpm typecheck:web` desde `/Users/matiasignacio/Developer/plotify`
- [ ] T048 Ejecutar `pnpm test:web` desde `/Users/matiasignacio/Developer/plotify`
- [ ] T049 Ejecutar `pnpm build:web` desde `/Users/matiasignacio/Developer/plotify`
- [ ] T050 Ejecutar `pnpm test:api` y `pnpm contracts:generate` solo si se modificaron archivos bajo `/Users/matiasignacio/Developer/plotify/apps/api`
- [ ] T051 Ejecutar `codegraph sync .` desde `/Users/matiasignacio/Developer/plotify` y revisar impacto antes de cerrar
- [ ] T052 Marcar en este archivo solo las tareas completadas cuyo Verify paso correctamente en `/Users/matiasignacio/Developer/plotify/specs/014-servidumbre-precision-visor/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: sin dependencias.
- **Phase 2 Foundational**: depende de Setup; bloquea todas las historias.
- **US1 y US2**: dependen de Phase 2. US2 depende de que US1 persista resultados.
- **US3**: depende de US1/US2 para tener geometria y label persistidos.
- **US4**: depende de US2 y parcialmente de US3 para consistencia de datos.
- **US5**: puede arrancar fixtures en paralelo tras Phase 2, pero su cierre depende de US1-US4.
- **Polish**: depende de todas las historias incluidas en el pase.

### User Story Dependencies

- **US1 (P1)**: MVP tecnico; entrega calculo persistido.
- **US2 (P1)**: completa anchos multiples; debe ir antes de visor/documentos finales.
- **US3 (P2)**: visualiza huella persistida.
- **US4 (P2)**: alinea salida documental.
- **US5 (P2)**: endurece no-regresion y validacion tipo Teno.

### Within Each User Story

- Tests antes de implementacion.
- Migracion y tipos antes de servicios que escriben campos nuevos.
- Motor puro antes de onboarding, visor o documentos.
- Viewer service antes de MapLibre layers.
- Puente/documentos solo despues de tener datos persistidos correctos.

## Parallel Opportunities

- T003 y T004 pueden correr en paralelo.
- T005 y T006 pueden correr en paralelo.
- Tests de cada user story marcados [P] pueden escribirse en paralelo.
- T027/T028 pueden correr en paralelo con T033/T034 si US2 ya esta cerrado.
- Gates finales T044-T050 deben correr secuencialmente para diagnostico claro.

## Implementation Strategy

### MVP First

1. Completar Phase 1.
2. Completar Phase 2.
3. Completar US1 y US2.
4. Detenerse y validar que un lote puede calcular `servidumbre_m2`, `superficie_neta_m2` y `5 y 10`.

### Incremental Delivery

1. Motor puro con fixtures.
2. Persistencia/onboarding.
3. Overlay del visor.
4. Documentos/variables.
5. Fixture Teno-like y gates completos.

## Notes

- No implementar mas de una tarea por pase si el usuario pide una tarea especifica.
- No marcar tareas como `[x]` sin Verify verde o aceptacion explicita del usuario.
- Mantener compatibilidad legacy hasta que exista migracion/backfill verificada.
- El PDF Teno es evidencia de dominio; las pruebas deben ser fixtures reproducibles, no dependientes de leer el PDF.
