# Tasks: Remediación del pipeline venta→escritura y reducción de fricción

**Input**: Documentos de diseño en `specs/016-pipeline-remediacion-ux/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [checklists/requirements.md](./checklists/requirements.md)

**Tests**: Requeridos (constitución VI). Cada tarea de implementación incluye su comando `Verify`. Los tests de contrato del camino venta→escritura son obligatorios (cubren el gap del FakeStore).

**Organización**: Tareas agrupadas por user story para implementar y probar cada una de forma independiente.

## Cómo leer una tarea (para el agente implementador)

- **`[ID]`**: identificador (T001…). Impleméntalas en orden salvo que estén marcadas `[P]`.
- **`[P]`**: paralelizable — distinto archivo, sin dependencias incompletas.
- **`[US1]`…**: a qué user story pertenece. Setup/Foundational/Polish no llevan label.
- **Ruta exacta** y **símbolo exacto** en cada tarea. Las líneas citadas (`:NNN`) son del código al 2026-07-06; si no coinciden, busca el símbolo por nombre (no confíes ciegamente en el número).
- **`Verify:`** comando que debe pasar antes de marcar la tarea. No marques `[x]` si no pasa.
- **Regla del repo**: implementa **una tarea por pasada** salvo que el usuario pida más alcance. No avances a la siguiente en la misma pasada.
- **Gates humanos (HG-\*)**: los marca el usuario, nunca el agente.

## Gates de calidad (repetir al cierre de cada tarea según aplique)

- Web/frontend: `pnpm --filter web lint` → `pnpm format:check` → `pnpm build:web`
- Contratos/tipos TS: además `pnpm typecheck:web`
- API: `pnpm test:api`
- Migración: `pnpm verify:migrations` + regenerar tipos DB

---

## Phase 1: Setup (infraestructura compartida)

- [x] **T001** Actualizar punteros SDD activos a 016: `.specify/feature.json` (`feature_directory` → `specs/016-pipeline-remediacion-ux`) y, si aplica, el puntero de feature activo en `AGENTS.md`. Verify: `pnpm format:check`

- [x] **T002** Crear la migración aditiva `packages/database/supabase/migrations/20260706000100_pipeline_remediacion.sql` con SOLO la parte segura primero (data-model §1 y §3): columnas `cliente_nacionalidad`/`cliente_region`/`cliente_comuna` en `lot_records` + reescritura de RPC `approve_sale`/`approve_reservation` copiando esos campos con `COALESCE` (patrón de `20260701000100`). Para la firma, NO crear columnas `notaria`/`fecha_firma`: persistir `payload.notaria` en `lot_records.firma_lugar` y `payload.fecha_firma` en `lot_records.firma_fecha`, que son las columnas canónicas existentes para "dónde/cuándo podría firmar". NO incluir aún los REVOKE ni el bucket privado (van tras HG-2, T060). Verify: `pnpm verify:migrations`
  - **Antes de escribir**: `select column_name from information_schema.columns where table_schema='public' and table_name='lot_records';` para no duplicar columnas.
  - **Aplicación**: el usuario aplica con `cd packages/database && supabase db push` (el agente no puede). Tras aplicar: regenerar `packages/database/types/database.generated.ts`.

- [x] **T003** Regenerar tipos DB tras T002 aplicada: `packages/database/types/database.generated.ts`. Verify: `pnpm typecheck:web`

---

## Phase 2: Foundational (prerrequisitos bloqueantes)

**⚠️ CRITICAL**: ninguna user story puede empezar hasta completar esta fase.

- [x] **T004** Agregar `cliente_nacionalidad`/`cliente_region`/`cliente_comuna` como `Optional[str] = None` a `SalePayload` (`apps/api/schemas/approval.py:33`) y `ReservationPayload` (`:6`). Contrato: [contracts/payloads-comprador.md](./contracts/payloads-comprador.md). Verify: `pnpm test:api`

- [x] **T005** Regenerar contrato tras T004: `pnpm contracts:generate` (actualiza `packages/contracts/openapi/plotify-chat.v1.json` + `apps/web/src/lib/services/plotify-chat.generated.ts`). Verify: `pnpm typecheck:web`

- [x] **T006** Crear el helper defensivo `_safe_data(result)` y aplicarlo en `apps/api/services/escritura_operational_bridge.py`: `_fetch_operational_rows` (`:572-576`, los 3 `.data`) y `_assert_lot_scope` (`:532`). Definición en research R1. Verify: `pnpm test:api`
  - Test nuevo: llamar `_fetch_operational_rows` para una org SIN fila en `organization_payment_info` → no lanza `AttributeError`, `payment_info` = None.

- [x] **T007** [P] Crear test de contrato base del camino venta→escritura en `apps/api/tests/test_pipeline_venta_escritura_contract.py`: enviar payload de venta con los 3 campos nuevos → verificar que llegan a `approval_requests.payload` (no se descartan por Pydantic). Verify: `pnpm test:api`

- [x] **T008** Auditar todos los usos de `maybe_single().execute()` en `apps/api`: clasificar cada llamada como "fila obligatoria" o "fila opcional"; donde 0 filas sea válido, aplicar el helper defensivo (`_safe_data`/equivalente local ya existente) para evitar `AttributeError` por resultado `None`; añadir al menos un test de regresión fuera del puente operacional para un caso opcional. Verify: `pnpm test:api`

**Checkpoint**: contratos regenerados, puente ya no revienta con org sin datos bancarios.

---

## Phase 3: User Story 1 — Pipeline de punta a punta (Priority: P1) 🎯 MVP

**Goal**: una venta aprobada genera y entrega la escritura sin SQL manual, con la revisión jurídica como paso visible.

**Independent Test**: quickstart US1.

### Puente y datos del comprador

- [x] **T010** [US1] Mapear `comprador.nacionalidad` desde `lot_records.cliente_nacionalidad` en `map_lot_record_variables` (`apps/api/services/escritura_operational_bridge.py:240`, lista `variables`). Decidir región/comuna (concatenar a `comprador.domicilio` o metadato — ver contracts/payloads-comprador.md). Verify: `pnpm test:api`

- [x] **T011** [US1] Cambiar el `except Exception` silencioso de `create_escritura_case_snapshot` (`apps/api/services/escritura_readiness.py:1096`) para contar variables pobladas y loguear a nivel `error` cuando pobló 0 debiendo poblar N (FR-002). No cambiar el flujo (sigue best-effort). Verify: `pnpm test:api`

- [x] **T012** [US1] Test de contrato: aprobar una venta (mock del RPC o contra Supabase real de test) → `lot_records` con los 3 campos → correr `stage_operational_variables` → fila `comprador.nacionalidad` con valor en `variable_resolutions`. Añadir a `apps/api/tests/test_pipeline_venta_escritura_contract.py`. Verify: `pnpm test:api`

### Recompute de gates

- [x] **T013** [US1] Al aprobar la matriz del proyecto (`approve_matriz`, `apps/api/api/v1/endpoints/escritura_matrices.py:1923`), encolar/ejecutar recompute de `create_escritura_case_snapshot(stage_operational=True)` para todos los `escritura_cases` `variables_pending` del proyecto (FR-005). Verify: `pnpm test:api`

- [x] **T014** [US1] Cablear el botón "Verificar" de la mesa (`apps/web/src/components/documents/mesa/mesa-encabezado.tsx:164`) al re-stage del caso `POST /escritura-matrices/case/{caseId}/stage-operational` (endpoint existente `escritura_matrices.py:2222`) + refrescar (FR-006). Verify: `pnpm --filter web lint && pnpm build:web`

### Revisión jurídica (FR-007, FR-008)

- [x] **T015** [US1] Materializar `documento.abogado_redactor.*` como variables project-scoped antes de la revisión jurídica del caso. Implementar el mínimo backend necesario para upsert de `documento.abogado_redactor.nombre/rut/email` desde un default de organización o input explícito admin/abogado, con `state='approved'` o `resolved`, `source_type='legal_review'`/`manual`, auditoría en `legal_review_decisions`, y sin depender todavía de la pantalla completa de Configuración (T052). Verify: `pnpm test:api`

- [x] **T016** [US1] Endpoint `POST /escritura-matrices/case/{caseId}/legal-review` en `apps/api/api/v1/endpoints/escritura_matrices.py`: body `{decision, comentario?}`, valida `is_org_admin`, exige que `documento.abogado_redactor.nombre/rut` existan como variables project-scoped, escribe `revision_juridica.estado/aprobada_por/aprobada_at` (reusa `_insert_legal_review_decision`, `legal_variable_resolution.py:1788`), refresca snapshot. Contrato: [contracts/revision-juridica.md](./contracts/revision-juridica.md). Verify: `pnpm test:api`

- [x] **T017** [US1] Ruta proxy web `apps/web/src/app/api/escritura-matrices/case/[caseId]/legal-review/route.ts` (inyecta `reviewed_by`, valida rol). Verify: `pnpm typecheck:web`

- [x] **T018** [US1] UI en la mesa: paso visible "Esperando revisión jurídica" + botón "Aprobar revisión jurídica" (admin/abogado) + acción "Rechazar" con comentario. Si falta `documento.abogado_redactor.nombre/rut`, mostrar un formulario mínimo inline o enlace/acción a completar el dato antes de aprobar. Archivos: `apps/web/src/components/documents/mesa/workflow-acciones.tsx` / `panel-datos.tsx`. Verify: `pnpm --filter web lint && pnpm build:web`

### Entrega al admin (FR-009, FR-010)

- [x] **T019** [US1] Helper `_resolve_org_admin_user_ids(org)` en `apps/api/api/v1/endpoints/escritura_matrices.py` (admins con `telegram_chat_id`). Verify: `pnpm test:api`

- [x] **T020** [US1] En el trigger de entrega (`_generate_minuta_row`/`deliver_draft`, `escritura_matrices.py:1680`): entregar a admin(s) siempre + vendedor si tiene Telegram; una fila por destinatario; nunca `sent` con `recipient_user_id` nulo (usar estado `unavailable`). Contrato: [contracts/entrega-telegram.md](./contracts/entrega-telegram.md). Verify: `pnpm test:api`

- [x] **T021** [US1] Test: generar minuta con admin con `telegram_chat_id` → fila `sent` con recipient=admin; sin destinatario → `unavailable`, nunca `sent` nulo. Verify: `pnpm test:api`

**Checkpoint US1**: quickstart US1 pasa de punta a punta. **← MVP funcional.**

---

## Phase 4: User Story 2 — Molde en un clic (Priority: P2)

**Goal**: aprobar el molde en una acción que absorbe las variables de alta confianza; caso muestra ≤2 pendientes.

**Independent Test**: quickstart US2.

- [x] **T030** [US2] Pasar `onApproveMolde` a `MoldeProgressHeader` desde `VariableMatrix` (`apps/web/src/components/projects/legal/variable-matrix/variable-matrix.tsx:223`). Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T031** [US2] Implementar el flujo de 3 pasos de "Aprobar molde" (bulk-approve confidence≥0.9 con evidencia → submit → approve). Contrato: [contracts/aprobar-molde.md](./contracts/aprobar-molde.md). Diálogo de confirmación lista las variables. Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T032** [US2] Estado post-aprobación: header "Molde aprobado · esperando ventas" + botón deshabilitado; mensaje claro si faltan huecos. Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T033** [US2] Gates heredados (FR-014): al construir la vista del caso, marcar los gates de proyecto (title/sag/sii-matriz) como heredados y NO contarlos en pendientes del caso. Solo se muestran datos de venta + geometry + legal_review. Archivos: readiness/mesa. **No** relajar la evaluación interna. Verify: `pnpm test:api && pnpm build:web`

- [x] **T034** [US2] Test web: caso muestra ≤2 pendientes tras heredar gates; variable confidence 0.5 NO se auto-aprueba. Verify: `pnpm --filter web test`

**Checkpoint US2**: SC-002 (≤2 pendientes) y SC-003 (menos acciones de config).

---

## Phase 5: User Story 3 — Reserva/venta con prefill + delta + estado de lote (Priority: P2)

**Goal**: formularios distintos, prefill desde reserva, aprobación delta, estado de lote consistente.

**Independent Test**: quickstart US3.

- [x] **T040** [US3] Separar schemas: `reservationSchema` (liviano) y `saleSchema` (estricto) en `apps/web/src/lib/validations/lot-reservation.schema.ts`. Contrato: research R7. Verify: `pnpm typecheck:web`

- [x] **T041** [US3] Descomponer `LotReservationForm.tsx` (478 líneas) en secciones compartidas (`ClienteIdentificacion`, `ClienteDomicilio`, `ClienteContacto`) + `FirmaYMonto` solo venta; reserva usa `reservationSchema`, venta `saleSchema`. Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T042** [US3] Prefill al vender lote `reservado`: cargar `initialClientData` desde `lot_records` (fallback: última reserva aprobada) en `apps/web/src/components/projects/viewer/LotInfoView.tsx:262` (abre "Solicitar Venta"). Campos editables, aviso "Datos cargados desde la reserva", foco en primer vacío. Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T043** [US3] Aprobación delta (FR-017): cuando `sale_mode='reserved'` y RUT coincide con la reserva, la notificación al admin muestra el delta (valor final) en vez del formulario completo. Auto-aprobación queda **OFF por default** (HG-1). Archivos: notificación de aprobación + `apps/api/api/v1/endpoints/approvals.py:249`. Verify: `pnpm test:api`

- [x] **T044** [US3] Máquina de estados de `lots.estado` server-side (data-model §2, research R9): validar transiciones en la capa de servicio de reserva/venta/liberación. Verify: `pnpm test:api`

- [x] **T045** [US3] Bulk-update de lotes: `handleBulkUpdate` (`apps/web/src/components/projects/geometry-viewer/index.tsx:317`) valida `response.ok` y muestra error. **Default (research R9): eliminar la UI de estado masivo** del `BulkActionsPanel` (acción muerta); si el usuario la quiere, agregar `estado` (enum) a `lotUpdateSchema` con guard. Verify: `pnpm --filter web lint && pnpm build:web`

**Checkpoint US3**: SC-004 (venta desde reserva en 2 actos).

---

## Phase 6: User Story 4 — Camino guiado + config org/Telegram + roles (Priority: P2)

**Goal**: un usuario nuevo sabe qué paso sigue, conecta Telegram y carga los datos de su organización desde la UI.

**Independent Test**: quickstart US4.

- [x] **T050** [US4] Checklist del proyecto en la vista general (`apps/web/src/components/projects/detail/overview-tab.tsx`): pasos Documentos/Título/Variables/Molde/Lotes/Ventas con estado real + CTA (FR-020). Reusar `PreparacionMatriz` como base. Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T051** [US4] Derivar el estado de preparación del proyecto del estado real (geometría/matriz/ventas), no del flag fijo "Borrador" (FR-021). Quitar CTA "Habilitar Ventas" si ya hay ventas. Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T052** [US4] Pantalla "Datos de la organización para escrituras" en Configuración (razón social, RUT, banco/cuenta, mandatario, abogado redactor). Contrato: [contracts/organizacion-config.md](./contracts/organizacion-config.md). Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T053** [US4] Pantalla "Conectar Telegram" en Configuración (deep link al bot + vinculación de `profiles.telegram_chat_id`; para admin, registrar bot de org si falta). Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T054** [US4] Scoping del sidebar por rol (`apps/web/src/components/app-sidebar.tsx:31`, `navItems`): ocultar Mesa/Plantillas/Vendedores al rol `user` + guard server-side en las rutas. Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T055** [US4] Aviso pre-venta de lote no verificado en el panel del lote (`LotInfoView.tsx`): "Este lote aún no tiene cabida/deslindes verificados; la escritura quedará en espera" (FR-025). Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T056** [P] [US4] Polish: skeleton en el tab Legal mientras carga; nombre real del actor en Historial de minutas (`profiles.first_name/last_name`). Verify: `pnpm --filter web lint && pnpm build:web`

**Checkpoint US4**: SC-005 (usuario nuevo autosuficiente).

---

## Phase 7: User Story 5 — Verificación masiva de lotes (Priority: P2)

**Goal**: verificar todos los lotes dentro de tolerancia en una acción.

**Independent Test**: quickstart US5.

- [x] **T057** [US5] Endpoint `POST /projects/{projectId}/lots/bulk-verify` (body `{tolerance_pct}`), auto-verifica dentro de tolerancia, audita, devuelve `{verified, deviated, skipped_no_geometry}`. Contrato: [contracts/verificacion-masiva-lotes.md](./contracts/verificacion-masiva-lotes.md). Reusa la lógica de `saveAndVerifyLot`. Verify: `pnpm test:api`

- [x] **T058** [US5] Ruta proxy web + botón "Verificar los lotes que coinciden con el plano" (tolerancia default 0,5%) en la pestaña Lotes / checklist, con resumen del resultado y enlace a revisión manual de los desviados. Verify: `pnpm --filter web lint && pnpm build:web`

- [x] **T059** [US5] Test: lotes diff 0,0% → verificados; diff 5% → deviated; sin geometría → skipped. Verify: `pnpm test:api`

**Checkpoint US5**: SC-006 (53 lotes en 1 acción).

---

## Phase 8: User Story 6 — Seguridad (gate de piloto) — requiere HG-2

- [x] **T060** [US6] Ampliar la migración (o una nueva `20260706000200_seguridad.sql`) con los `REVOKE EXECUTE` de `get_decrypted_bot_token`/`decrypt_credential`/`get_mcp_credentials` a `anon`/`authenticated` (data-model §4). **Verificar firmas exactas** antes. Verify: `pnpm verify:migrations` (aplicar solo tras **HG-2**)

- [x] **T061** [US6] Pasar `project-files` a privado (`UPDATE storage.buckets SET public=false`) y migrar todo acceso a URLs firmadas en backend/web (data-model §5). Verificar que ver/descargar documentos legales sigue funcionando (US6-AS3). Verify: `pnpm build:web` + prueba manual de descarga (aplicar tras **HG-2**)

- [x] **T062** [P] [US6] Higiene menor (P3.3, opcional): habilitar RLS en `checkpoint_*`/`dead_letter_queue`, fijar `search_path` en las 3 funciones. Verify: `pnpm verify:migrations`

**Checkpoint US6**: SC-007. **HG-2 obligatorio antes de aplicar T060/T061.**

---

## Phase 9: User Story 7 — Salud de código + limpieza pre-piloto (Priority: P3)

- [x] **T070** [P] [US7] Borrar código muerto: `apps/web/src/components/dashboard/documents/generation-wizard.tsx` y `apps/web/src/actions/reserve-lot.action.ts` (0 refs verificado). Verify: `pnpm build:web && pnpm typecheck:web`

- [x] **T071** [US7] Extraer helper común `buildApprovalRequest(mode, ...)` de `requestReservationApproval`/`requestSaleApproval` (`apps/web/src/actions/request-approval.action.ts`, ~110 líneas duplicadas). Comportamiento idéntico. Verify: `pnpm --filter web test && pnpm build:web`

- [x] **T072** [P] [US7] Limpiar `console.log` de `apps/web/src` (52 ocurrencias) y arreglar los 2 tests web frágiles de la rama 015 (raw-colors-guard en `documents-tab`, test que grepa `max-h-[80vh]`). Verify: `pnpm --filter web test`

- [x] **T073** [US7] (con OK del usuario, HG-2) Limpiar datos de prueba de Teno: lotes 26/37 inconsistentes, venta de auditoría del lote 14, minuta demo del lote 1. Verify: consulta de estado consistente en DB.

---

## Phase 10: Polish y cierre

- [x] **T080** Actualizar `plotify_memori/` y memoria del proyecto con el estado final del pipeline (qué quedó resuelto). Verify: N/A

- [ ] **T081** Correr todos los gates: `pnpm test:api && pnpm --filter web test && pnpm typecheck:web && pnpm build:web && pnpm verify:migrations`. Verify: todos verdes.

- [ ] **T082** **HG-3 (usuario)**: sesión de usabilidad con un usuario nuevo real que valide SC-003/SC-004/SC-005. Lo marca el usuario.

---

## Dependencias entre fases

- **Setup (T001-T003)** → antes de todo.
- **Foundational (T004-T008)** → bloquea todas las US.
- **US1 (T010-T021)** → MVP; T013/T014 dependen de T006. T012 depende de T002+T004+T010.
- **US2 (T030-T034)** → independiente de US1 salvo T033 (gates) que se apoya en el snapshot de US1.
- **US3 (T040-T045)** → T042 (prefill) depende de T002 (columnas) para región/comuna completas.
- **US4 (T050-T056)** → T052 (config org) refuerza T018 (abogado redactor).
- **US5 (T057-T059)** → independiente.
- **US6 (T060-T062)** → requiere **HG-2**; puede ir en paralelo pero se aplica al final.
- **US7 (T070-T073)** → al final; T073 requiere HG-2.

## Estrategia MVP

Implementar **Setup → Foundational → US1** entrega el pipeline funcional (SC-001/SC-002). El resto son incrementos de fricción/seguridad independientes. Cada US es demostrable por sí sola con su sección del quickstart.
