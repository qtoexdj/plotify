# Tasks: Venta → Escritura — Matriz del Proyecto y Borrador Automatico

**Input**: Design documents from `/specs/011-venta-escritura/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md)
(required), [research.md](./research.md), [data-model.md](./data-model.md),
[checklists/requirements.md](./checklists/requirements.md)

**Tests**: Required (constitucion VI). Cada tarea de implementacion incluye
su comando `Verify`; las superficies nuevas suman tests de render (web) y de
contrato/servicio (api).

**Organization**: Tareas agrupadas por user story para implementar y probar
cada una de forma independiente. Regla del repo: una tarea sin checkear por
pasada salvo pedido explicito de mayor alcance.

**Gates humanos**: T006 (wireframes) y T026 (usabilidad) los marca solo el
usuario, nunca un agente.

**Dependencia de feature**: requiere **cerrar SDD 010** (la mesa es la
superficie reutilizada). El gate de usabilidad de SDD 010 debe estar cerrado
antes de iniciar la Fase 4 (US2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (distinto archivo, sin dependencias incompletas).
- **[Story]**: a que user story pertenece (US1–US5); Setup/Foundational/Polish
  no llevan label.
- Cada tarea incluye ruta exacta y comando `Verify`.

---

## Phase 1: Setup (Infraestructura compartida)

**Purpose**: punteros del feature y la unica migracion (aditiva acotada) que
habilita la matriz del proyecto y las entregas.

- [x] T001 Actualizar punteros SDD activos a 011 en `AGENTS.md`,
      `.agents/rules/sdd-implementation.md` y `.agents/rules/plotify-rules.md`
      (el puntero `.specify/feature.json` ya apunta a 011); Verify:
      `pnpm format:check`
- [x] T002 Migracion aditiva acotada
      `packages/database/supabase/migrations/20260616000100_venta_escritura.sql`
      (data-model §1, §4): `escritura_matrices.escritura_case_id` nullable +
      columna `source_project_matriz_id` + indice unico parcial de matriz de
      proyecto; tabla `escritura_deliveries` con RLS por organizacion y por
      vendedor; Verify: `pnpm verify:migrations` + regenerar tipos DB
      — Estado: ✅ aplicada al remoto (`supabase db push`, version 20260616000100),
      `pnpm verify:migrations` ✅, tipos regenerados en
      `packages/database/types/database.generated.ts` + `pnpm typecheck:web` ✅;
      advisors de seguridad sin ERROR nuevo (RLS habilitada en `escritura_deliveries`).

---

## Phase 2: Foundational (Prerrequisitos bloqueantes)

**Purpose**: contratos, diccionario de estados y gate de diseño que todas las
historias necesitan.

**⚠️ CRITICAL**: ninguna user story puede empezar hasta completar esta fase.

- [x] T003 Schemas Pydantic aditivos en
      `apps/api/schemas/escritura_matrices.py`: scope de la matriz del
      proyecto (`escritura_case_id` opcional), borrador instanciado
      (`source_project_matriz_id`/version) y entrega; Verify: `pnpm test:api`
- [x] T004 [P] Diccionario de estados del flujo en
      `apps/api/services/legal_microcopy.py` +
      `apps/web/src/lib/documents/matriz-microcopy.ts` (esperando matriz del
      proyecto / en preparacion / borrador por revisar / aceptada / entregada
      — data-model §5, FR-014) con tests de redaccion; Verify:
      `pnpm test:api && pnpm test:web`
- [x] T005 Regenerar contratos y tipos: `pnpm contracts:generate` + extension
      de `apps/web/src/lib/documents/matriz-types.ts`; Verify:
      `pnpm typecheck:web`
- [x] T006 **GATE (usuario)** Wireframes de la matriz del proyecto (huecos de
      venta `______` señalizados), de la matriz de variables del proyecto
      (CCL existente, sin entidad nueva) y de "mis documentos del vendedor";
      aprobacion explicita registrada en `quickstart.md`; Verify: aprobacion
      del usuario (no automatizable) — **bloquea las fases de UI (US1, US3-US5)**

**Checkpoint**: contratos, vocabulario y diseño listos — las user stories
pueden comenzar.

---

## Phase 3: User Story 1 — Matriz del proyecto aprobada una vez (P1) 🎯 MVP

**Goal**: el abogado genera la matriz de la escritura del proyecto desde la
plantilla general, la ve resuelta contra los datos del proyecto con los datos
de venta como huecos, la edita en la mesa y la aprueba una sola vez → queda
"esperando ventas".

**Independent Test**: con el proyecto Teno revisado, generar la matriz del
proyecto, verificar que la mesa la muestra con vendedor/predio/titulo
resueltos y comprador/precio/lote como huecos con nombre humano, editar una
clausula y aprobarla → estado "esperando ventas" sin ningun caso de lote.

- [x] T007 [US1] Generar la matriz del proyecto desde la plantilla general en
      `apps/api/api/v1/endpoints/escritura_matrices.py` (`escritura_case_id`
      NULL): copia propia del proyecto, resuelta contra el snapshot de
      variables del proyecto, datos de venta como huecos (FR-001/FR-002);
      tests api con fixture Teno; Verify: `pnpm test:api`
- [x] T008 [US1] Aprobacion de la matriz del proyecto (FR-003) en el mismo
      endpoint/servicio: bloqueada mientras la revision del proyecto tenga
      pendientes (titulo, variables legales) con pendientes humanizados
      accionables; aprobada queda inmutable "esperando ventas" (cambios =
      nueva version); Verify: `pnpm test:api`
- [x] T009 [US1] Seccion Documentos por proyecto en
      `apps/web/src/app/(dashboard)/documentos/page.tsx` (elegir proyecto →
      acceso a la **matriz de escritura del proyecto** y a la **matriz de
      variables**; esta ultima NO es una entidad nueva: es la revision de
      variables legales del proyecto que ya existe en el CCL
      —`variable_resolutions`, `legal-variable-editor` SDD 007— solo expuesta
      aqui) + sub-items del sidebar en
      `apps/web/src/components/app-sidebar.tsx`; reusa la mesa de SDD 010;
      tests web; Verify: `pnpm test:web`
- [x] T010 [P] [US1] Editar la matriz del proyecto en la mesa (texto y
      clausulas) sin afectar la plantilla general ni otros proyectos
      (US1 escenario 2); tests web; Verify: `pnpm test:web`

**Checkpoint**: US1 funciona sola — el abogado prepara y aprueba la escritura
del proyecto antes de cualquier venta (MVP).

---

## Phase 4: User Story 2 — La venta validada genera el borrador sola (P1)

**Goal**: al validar la venta, el sistema crea el caso del lote, propone los
datos del formulario e instancia el borrador desde la matriz aprobada, sin
pasos manuales.

**Independent Test**: con la matriz del proyecto aprobada y un lote con
registro de venta completo, validar la venta → el caso existe sin
intervencion, comprador/precio/lote propuestos desde el formulario, el
borrador instanciado desde la matriz del proyecto, y el administrador recibe
la notificacion con acceso directo.

- [x] T011 [US2] Enganche idempotente al validar la venta (transicion de
      `lot_records` a validada — research D3) reusando
      `apps/api/services/escritura_operational_bridge.py` (`stage_operational`):
      crear caso del lote auto + proponer datos + instanciar borrador desde la
      matriz aprobada; corrige el orden invertido del panel de readiness
      (FR-004/FR-006); Verify: `pnpm test:api`
- [x] T012 [US2] Sin matriz aprobada: la venta se valida igual y la escritura
      queda en preparacion con el pendiente "Falta aprobar la matriz del
      proyecto" accionable (FR-005, edge case); Verify: `pnpm test:api`
- [x] T013 [P] [US2] Notificacion al administrador (venta por validar /
      borrador listo) con deep link a la mesa y vocabulario del diccionario
      unico (FR-009); Verify: `pnpm test:api`

**Checkpoint**: US1 + US2 funcionan — validar una venta produce el borrador
automaticamente.

---

## Phase 5: User Story 3 — Validar la venta viendo el borrador (P2)

**Goal**: el administrador revisa el borrador con solo los datos de la venta
resaltados "Por revisar" y lo acepta, generando el DOCX con el warning legal.

**Independent Test**: un borrador recien generado se abre desde la
notificacion; la mesa resalta solo los datos de la venta como "Por revisar";
al aceptar se genera el DOCX con marca de borrador y warning ADR-009
registrado.

- [x] T014 [US3] La mesa resalta SOLO los datos provenientes de la venta como
      "Por revisar" y distingue lo aprobado a nivel proyecto como ya revisado
      (FR-007), reusando los componentes de SDD 010; tests web; Verify:
      `pnpm test:web`
- [x] T015 [US3] Aceptar el borrador → DOCX desde el flujo existente (matriz
      aprobada + expediente vigente + warning ADR-009 aceptado y registrado) +
      marca visible de "borrador sujeto a revision legal" (FR-008);
      no-regresion del renderer; Verify: `pnpm test:api`

**Checkpoint**: US1–US3 — la revision por venta toma minutos y produce el DOCX.

---

## Phase 6: User Story 4 — Entrega al vendedor (P2)

**Goal**: al aceptar el borrador, el vendedor lo recibe por Telegram y lo ve
en "mis documentos" en la web, solo los suyos.

**Independent Test**: un borrador aceptado llega al vendedor asignado por
Telegram (enlace seguro con vencimiento; archivo si el canal lo permite) y
aparece en "mis documentos" con descarga/compartir; ningun documento de otros
vendedores es visible.

- [x] T016 [US4] `apps/api/services/escritura_delivery.py` +
      `apps/api/integrations/telegram_client.py` (`send_document` + enlace
      seguro con vencimiento): entrega de dos niveles auditada en
      `escritura_deliveries` (FR-010/FR-012); Verify: `pnpm test:api`
- [x] T017 [US4] Vista web "mis documentos del vendedor" en
      `apps/web/src/app/(dashboard)/mis-documentos/` aislada por vendedor
      asignado (FR-011): lista solo los borradores de SUS ventas, con
      descarga, compartir y renovar enlace vencido; **mas test de aislamiento
      a nivel API (SC-005, estandar de regresion tenant SDD 007/008): la
      consulta de entregas filtra por vendedor asignado y jamas devuelve
      documentos de ventas ajenas**; tests web + api; Verify:
      `pnpm test:web && pnpm test:api`
- [x] T018 [P] [US4] Notificacion al vendedor al aceptar/entregar + fallback a
      "mis documentos" + notificacion interna cuando Telegram no esta
      vinculado (jamas falla en silencio — edge case); Verify: `pnpm test:api`

**Checkpoint**: US1–US4 — el ciclo llega hasta la entrega al vendedor.

---

## Phase 7: User Story 5 — Estado del flujo visible para todos (P3)

**Goal**: administrador y vendedor ven en que paso esta cada escritura, con el
mismo vocabulario en todas las superficies.

**Independent Test**: las cuatro superficies (notificacion, CCL, mesa,
documentos del vendedor) muestran el estado de una escritura con frases
humanas identicas; un vendedor distingue de un vistazo los borradores listos
de los que siguen en preparacion.

- [x] T019 [US5] Estados del flujo unificados (frases humanas identicas) en
      notificaciones, CCL, mesa y documentos del vendedor desde el diccionario
      unico (FR-014, SC-005); tests web; Verify: `pnpm test:web`

**Checkpoint**: las cinco historias funcionan de forma independiente.

---

## Phase 8: Polish & Gates de Cierre

**Purpose**: trazabilidad, historial, tests de las superficies nuevas y gates
de cierre.

- [x] T020 Trazabilidad completa por escritura (FR-012): matriz del proyecto
      (version/aprobador), venta (validador), borrador (generacion e inputs),
      aceptacion (quien/cuando) y entregas — consultable desde la mesa y el
      historial; Verify: `pnpm test:api`
- [x] T021 [P] Historial de documentos filtrado por proyecto (FR-015) en
      `apps/web/src/app/(dashboard)/documentos/historial/page.tsx` (lo ejercido
      por lote, agrupado/filtrable por proyecto); Verify: `pnpm test:web`
- [x] T022 [P] Capa de tests de render para las superficies nuevas (Documentos
      por proyecto, "mis documentos del vendedor") en `apps/web/tests/render/` + ampliar el test de vocabulario prohibido a las pantallas nuevas;
      Verify: `pnpm test:web`
- [x] T023 Verificacion del camino real contra Supabase (no solo el FakeStore):
      script o pasada manual que genere matriz del proyecto, valide una venta y
      abra el borrador en la mesa con datos reales; Verify: pasada documentada
      en `quickstart.md`
- [x] T024 Quickstart E2E completo (proyecto → matriz aprobada → venta →
      borrador → aceptacion → entrega) en `quickstart.md`; Verify: gates
      tecnicos completos (`pnpm test:api && pnpm test:web && pnpm typecheck:web
&& pnpm --filter web lint && pnpm format:check && pnpm build:web &&
pnpm verify:migrations`)
- [x] T025 Memoria y handoff: actualizar `plotify_memori/50 - Implementaciones/`
      con "SDD 011 Venta-Escritura - Handoff" y punteros de memoria; Verify:
      `pnpm format:check`
- [ ] T026 **GATE (usuario)** Sesion de usabilidad observada incluyendo el
      journey administrador (validar → aceptar < 5 min, cero digitacion,
      SC-002) y vendedor→entrega (SC-001); resultados registrados en
      `quickstart.md`; Verify: aprobacion del usuario (no automatizable) —
      **bloquea el cierre del feature**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias; T002 (migracion) habilita todo lo demas.
- **Foundational (Fase 2)**: depende de Setup; **bloquea todas las historias**.
  T006 (wireframes) bloquea las fases de UI.
- **User Stories (Fases 3-7)**: dependen de Foundational. US1 es prerrequisito
  funcional de US2 (la venta instancia desde la matriz del proyecto). US3
  depende de US2 (necesita un borrador). US4 depende de US3 (entrega lo
  aceptado). US5 es transversal una vez existen estados.
- **Polish (Fase 8)**: depende de las historias deseadas completas.

### User Story Dependencies

- **US1 (P1)**: arranca tras Foundational. Sin dependencias de otras historias.
- **US2 (P1)**: requiere US1 (instancia desde la matriz aprobada); testeable de
  forma independiente con una matriz aprobada de fixture.
- **US3 (P2)**: requiere US2 (un borrador que revisar).
- **US4 (P2)**: requiere US3 (un borrador aceptado que entregar).
- **US5 (P3)**: transversal; consume los estados de las demas.

### Parallel Opportunities

- T004 (diccionario) en paralelo con T003 dentro de Foundational.
- T010 (editar matriz en la mesa) en paralelo con T009 dentro de US1.
- T013 (notificacion admin) en paralelo con T011/T012 en US2.
- T018 (notificacion vendedor) en paralelo con T016/T017 en US4.
- T021 (historial) y T022 (tests de render) en paralelo en Polish.

---

## Parallel Example: User Story 1

```bash
# Tras Foundational, US1 puede avanzar el backend y el front en paralelo:
Task: "T007 [US1] Generar la matriz del proyecto en escritura_matrices.py"
Task: "T009 [US1] Seccion Documentos por proyecto en documentos/page.tsx"
# y la edicion en la mesa en paralelo con la seccion:
Task: "T010 [US1] Editar la matriz del proyecto en la mesa"
```

---

## Implementation Strategy

### MVP First (solo US1)

1. Completar Fase 1 (Setup) y Fase 2 (Foundational, CRITICA).
2. Completar Fase 3 (US1): matriz del proyecto + seccion Documentos.
3. **PARAR y VALIDAR**: el abogado genera, edita y aprueba la matriz del
   proyecto contra datos reales (no solo el FakeStore — ver T023).
4. Demo: la escritura del proyecto queda "esperando ventas".

### Entrega incremental

1. Setup + Foundational → base lista.
2. US1 → validar → demo (MVP: matriz del proyecto aprobada).
3. US2 → validar → demo (la venta genera el borrador sola).
4. US3 → validar → demo (revisar y aceptar → DOCX).
5. US4 → validar → demo (entrega al vendedor).
6. US5 → estados unificados en todas las superficies.

---

## Notes

- [P] = distinto archivo, sin dependencias incompletas.
- [Story] mapea cada tarea a su user story para trazabilidad.
- Cada historia debe quedar completable y testeable de forma independiente.
- **Verificar contra Supabase real, no solo `pnpm test:api`**: la suite usa un
  FakeStore que oculta bugs reales de PostgREST (`.maybe_single()` → None,
  columnas faltantes, encadenamiento de queries). Ver T023.
- Commit despues de cada tarea o grupo logico.
- Parar en cualquier checkpoint para validar la historia de forma independiente.
