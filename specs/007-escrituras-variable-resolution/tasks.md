# Tasks: Escrituras Variable Resolution

**Input**: Design documents from `/specs/007-escrituras-variable-resolution/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [agent-execution.md](./agent-execution.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Tests are required because this feature touches Supabase migrations, document extraction, API contracts, tenant isolation, legal document generation readiness and frontend workflows.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Follow repository rule: implement exactly one unchecked task per implementation pass unless the user explicitly requests a broader scope.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other tasks in the same phase if dependencies are met.
- **[Story]**: Maps to user stories in [spec.md](./spec.md).
- Every task includes exact file paths and a verify command.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the production schema, generated type foundations and shared catalogs needed by all stories.

- [ ] T001 Create Supabase migration for `legal_documents`, `document_ingestion_jobs`, `legal_document_pages`, `variable_resolutions`, `document_evidence`, `lot_legal_data`, `escritura_cases` and `legal_review_decisions` in `packages/database/supabase/migrations/20260603000100_escrituras_variable_resolution.sql`; Verify: `pnpm verify:migrations`
- [ ] T002 Regenerate database types after the migration in `packages/database/types/database.generated.ts` and update web database type mirrors if used in `apps/web/src/types/database.types.ts`; Verify: `pnpm typecheck:web`
- [ ] T003 [P] Add canonical variable catalog constants and states in `apps/api/services/legal_variable_catalog.py`; Verify: `pnpm test:api`
- [ ] T004 [P] Add frontend variable/readiness TypeScript types in `apps/web/src/lib/legal/variable-resolution-types.ts`; Verify: `pnpm typecheck:web`
- [x] T005 [P] Add implementation note linking SDD 007 to Obsidian memory in `plotify_memori/50 - Implementaciones/SDD 007 Escrituras Variable Resolution.md`; Verify: `pnpm format:check`
- [x] T071 [P] Add SDD 007 agent/subagent execution protocol and update active agent rules in `specs/007-escrituras-variable-resolution/agent-execution.md`, `AGENTS.md`, `.agents/rules/sdd-implementation.md`, `.agents/rules/plotify-rules.md`, `.agents/rules/plotify-chat.md` and `plotify_memori/50 - Implementaciones/SDD 007 Escrituras Variable Resolution.md`; Verify: `pnpm format:check`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core API/service/worker boundaries that MUST be complete before user stories.

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T006 Add Pydantic schemas for legal documents, variables, role matching and readiness in `apps/api/schemas/legal_variables.py`; Verify: `pnpm test:api`
- [ ] T007 Add FastAPI router skeleton and register it in `apps/api/api/v1/endpoints/legal_variables.py` and `apps/api/api/v1/router.py`; Verify: `pnpm test:api`
- [ ] T008 [P] Add legal document registration service skeleton in `apps/api/services/legal_document_ingestion.py`; Verify: `pnpm test:api`
- [ ] T009 [P] Add legal text extraction service skeleton in `apps/api/services/legal_text_extraction.py`; Verify: `pnpm test:api`
- [ ] T010 [P] Add legal variable resolution service skeleton in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [ ] T011 [P] Add SII role matching service skeleton in `apps/api/services/legal_role_matching.py`; Verify: `pnpm test:api`
- [ ] T012 [P] Add escritura readiness service skeleton in `apps/api/services/escritura_readiness.py`; Verify: `pnpm test:api`
- [ ] T013 Add arq worker task registration for legal document ingestion in `apps/api/workers/tasks/legal_document_ingestion.py` and `apps/api/workers/main_worker.py`; Verify: `pnpm test:api`
- [ ] T014 Add shared audit event constants for legal document, variable and escritura case mutations in `apps/api/utils/audit.py`; Verify: `pnpm test:api`

**Checkpoint**: Foundation ready. Story implementation can start.

---

## Phase 3: User Story 1 - Registrar documentos legales sin friccion (Priority: P1) MVP

**Goal**: Existing onboarding and project document uploads register legal source documents and queue extraction without adding onboarding review.

**Independent Test**: Create a project with legal documents and verify document rows plus queued extraction jobs exist while onboarding remains upload-only.

### Tests for User Story 1

- [ ] T015 [P] [US1] Add API tests for registering uploaded legal documents and queueing jobs in `apps/api/tests/test_escrituras_ingestion.py`; Verify: `pnpm test:api`
- [ ] T016 [P] [US1] Add web tests for project-file upload legal document registration behavior in `apps/web/tests/escrituras-ingestion.test.ts`; Verify: `pnpm test:web`

### Implementation for User Story 1

- [ ] T017 [US1] Implement `POST /legal-documents/register` and `GET /legal-documents/project/{project_id}` in `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [ ] T018 [US1] Implement legal document registration and superseding logic in `apps/api/services/legal_document_ingestion.py`; Verify: `pnpm test:api`
- [ ] T019 [US1] Extend `apps/web/src/app/api/projects/route.ts` and `apps/web/src/lib/services/projects.service.ts` so onboarding document paths register as legal documents after project creation; Verify: `pnpm test:web`
- [ ] T020 [US1] Extend `apps/web/src/app/api/uploads/project-files/route.ts` so project document replacements register a legal document version and queue extraction; Verify: `pnpm test:web`
- [ ] T021 [US1] Update accepted document metadata in `apps/web/src/components/projects/onboarding/ProjectMediaStep.tsx` without adding variable review UI; Verify: `pnpm test:web`
- [ ] T022 [US1] Add legal document status display to `apps/web/src/components/projects/detail/documents-tab.tsx`; Verify: `pnpm test:web`

**Checkpoint**: User Story 1 is functional and testable independently.

---

## Phase 4: User Story 2 - Resolver variables con evidencia documental (Priority: P1)

**Goal**: Extraction proposes canonical variables from source documents and stores evidence, missing values and conflicts.

**Independent Test**: Process test documents and verify variables include state, source, confidence and document/page evidence.

### Tests for User Story 2

- [ ] T023 [P] [US2] Add extraction and evidence tests for dominio vigente, SII roles and low-confidence plano samples in `apps/api/tests/test_escrituras_variable_resolution.py`; Verify: `pnpm test:api`
- [ ] T024 [P] [US2] Add contract tests for variable inventory response shape in `apps/api/tests/test_escrituras_variable_contracts.py`; Verify: `pnpm test:api`

### Implementation for User Story 2

- [ ] T025 [US2] Implement text/page extraction persistence in `apps/api/services/legal_text_extraction.py`; Verify: `pnpm test:api`
- [ ] T026 [US2] Implement dominio vigente extraction rules and schema-normalized outputs in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [ ] T027 [US2] Implement certificado roles SII extraction rules for certificate metadata, unit names, matriz role and pre-role/role-in-process values in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [ ] T028 [US2] Implement SAG/plano extraction with low-confidence manual-review fallback in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [ ] T029 [US2] Persist variable proposals and `document_evidence` rows from extraction jobs in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [ ] T030 [US2] Implement missing/conflict/manual-review classification for critical variables in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [ ] T031 [US2] Implement `GET /legal-variables/project/{project_id}` inventory endpoint in `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [ ] T032 [US2] Add web proxy for project legal variables in `apps/web/src/app/api/projects/[id]/legal-variables/route.ts`; Verify: `pnpm test:web`

**Checkpoint**: User Story 2 is functional and testable independently.

---

## Phase 5: User Story 3 - Revisar y corregir variables en Centro de Control Legal (Priority: P2)

**Goal**: Users can inspect variables, evidence, conflicts and missing values; correct and approve variables with audit before any matriz builder consumes them.

**Independent Test**: Edit a variable in the Centro de Control Legal and verify audit history plus approved state; then verify a refreshed escritura case snapshot exposes the corrected value for future SDD 008 consumption.

### Tests for User Story 3

- [ ] T033 [P] [US3] Add API tests for variable edit, approve, mark-not-applicable and audit decisions in `apps/api/tests/test_escrituras_variable_review.py`; Verify: `pnpm test:api`
- [ ] T034 [P] [US3] Add frontend tests for variable table filters, edit drawer and evidence viewer in `apps/web/tests/legal-control-center.test.ts`; Verify: `pnpm test:web`

### Implementation for User Story 3

- [ ] T035 [US3] Implement `PATCH /legal-variables/{variable_resolution_id}` with state transition validation in `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [ ] T036 [US3] Implement review/audit persistence in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [ ] T037 [US3] Add web proxy for variable edits in `apps/web/src/app/api/projects/[id]/legal-variables/[variableId]/route.ts`; Verify: `pnpm test:web`
- [ ] T038 [P] [US3] Build `LegalDocumentStatusPanel` in `apps/web/src/components/projects/legal/legal-document-status-panel.tsx`; Verify: `pnpm test:web`
- [ ] T039 [P] [US3] Build `LegalVariableTable` in `apps/web/src/components/projects/legal/legal-variable-table.tsx`; Verify: `pnpm test:web`
- [ ] T040 [P] [US3] Build `LegalVariableEditor` in `apps/web/src/components/projects/legal/legal-variable-editor.tsx`; Verify: `pnpm test:web`
- [ ] T041 [P] [US3] Build `LegalEvidenceViewer` in `apps/web/src/components/projects/legal/legal-evidence-viewer.tsx`; Verify: `pnpm test:web`
- [ ] T042 [US3] Compose Centro de Control Legal in `apps/web/src/components/projects/detail/legal-control-center.tsx` and mount it from `apps/web/src/components/projects/detail/legal-tab.tsx`; Verify: `pnpm test:web`

**Checkpoint**: User Story 3 is functional and testable independently.

---

## Phase 6: User Story 4 - Asignar roles SII a lotes (Priority: P2)

**Goal**: SII roles/pre-roles are associated to lots with explicit matching state and legal handling of `Rol de avaluo en tramite`.

**Independent Test**: Process an SII certificate with multiple units and verify each lot has matched, ambiguous, missing or manual override state.

### Tests for User Story 4

- [ ] T043 [P] [US4] Add SII role matching tests for exact match, ambiguous match, missing match and manual override in `apps/api/tests/test_escrituras_role_matching.py`; Verify: `pnpm test:api`
- [ ] T044 [P] [US4] Add frontend tests for lot role matching status and manual override reason in `apps/web/tests/legal-role-matching.test.ts`; Verify: `pnpm test:web`

### Implementation for User Story 4

- [ ] T045 [US4] Implement lot/unit normalization and matching score logic in `apps/api/services/legal_role_matching.py`; Verify: `pnpm test:api`
- [ ] T046 [US4] Persist `lot_legal_data` matches and role-in-process state from SII extraction in `apps/api/services/legal_role_matching.py`; Verify: `pnpm test:api`
- [ ] T047 [US4] Implement role matching endpoints in `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [ ] T048 [US4] Add web proxy routes for role matching in `apps/web/src/app/api/projects/[id]/legal-roles/route.ts` and `apps/web/src/app/api/projects/[id]/legal-roles/[lotId]/route.ts`; Verify: `pnpm test:web`
- [ ] T049 [US4] Add role matching UI section to `apps/web/src/components/projects/detail/legal-control-center.tsx`; Verify: `pnpm test:web`
- [ ] T050 [US4] Extend `apps/api/services/document_engine.py` so approved lot legal role variables can feed `sii.*` and `lote.rol_tramite`; Verify: `pnpm test:api`

**Checkpoint**: User Story 4 is functional and testable independently.

---

## Phase 7: User Story 5 - Crear readiness de caso de escritura por lote vendido (Priority: P3)

**Goal**: Sold lots expose escritura readiness gates and can create an escritura case snapshot before future minuta generation.

**Independent Test**: Query readiness for a sold lot and verify all gates, warnings, blocking variables and snapshots.

### Tests for User Story 5

- [ ] T051 [P] [US5] Add API tests for escritura readiness gates and case snapshot creation in `apps/api/tests/test_escrituras_readiness.py`; Verify: `pnpm test:api`
- [ ] T052 [P] [US5] Add frontend tests for readiness panel, legal warning and blocked generation actions in `apps/web/tests/escritura-readiness.test.ts`; Verify: `pnpm test:web`

### Implementation for User Story 5

- [ ] T053 [US5] Implement escritura readiness gate calculation in `apps/api/services/escritura_readiness.py`; Verify: `pnpm test:api`
- [ ] T054 [US5] Implement escritura case creation and variable/evidence snapshot persistence in `apps/api/services/escritura_readiness.py`; Verify: `pnpm test:api`
- [ ] T055 [US5] Implement readiness and case endpoints in `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [ ] T056 [US5] Add web proxy routes for readiness and case creation in `apps/web/src/app/api/projects/[id]/escritura-readiness/route.ts` and `apps/web/src/app/api/projects/[id]/escritura-cases/route.ts`; Verify: `pnpm test:web`
- [ ] T057 [US5] Build `EscrituraReadinessPanel` with mandatory lawyer-review warning in `apps/web/src/components/projects/legal/escritura-readiness-panel.tsx`; Verify: `pnpm test:web`
- [ ] T058 [US5] Integrate readiness gating into escritura generation entry points in `apps/web/src/components/projects/detail/documents-tab.tsx` and `apps/web/src/components/dashboard/documents/generation-wizard.tsx`; Verify: `pnpm test:web`

**Checkpoint**: User Story 5 is functional and testable independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Contracts, documentation, SDD 008 handoff, quality gates and production guardrails.

- [ ] T059 Regenerate OpenAPI and client contracts after API changes using `pnpm contracts:generate`; Verify: `pnpm contracts:generate`
- [ ] T060 [P] Add end-to-end quickstart coverage notes and update product memory in `plotify_memori/20 - Producto & Proyectos/Generador de Escrituras de Compraventa.md`; Verify: `pnpm format:check`
- [ ] T061 [P] Add security/tenant regression coverage for legal variable endpoints in `apps/api/tests/test_tenant_validation.py`; Verify: `pnpm test:api`
- [x] T062 [P] Add SDD 008 handoff contract in `specs/007-escrituras-variable-resolution/handoff-sdd-008.md`; Verify: `pnpm format:check`
- [ ] T063 [P] Add feature flag and rollout controls for legal extraction/readiness in `apps/web/src/lib/features/legal-documents.ts` and `apps/api/core/config.py`; Verify: `pnpm test:web && pnpm test:api`
- [ ] T064 [P] Add extraction retry/idempotency tests for duplicate job dispatch and superseded document versions in `apps/api/tests/test_escrituras_ingestion.py`; Verify: `pnpm test:api`
- [ ] T065 [P] Add structured observability for extraction jobs, variable proposals, review decisions and readiness gates in `apps/api/services/legal_document_ingestion.py`, `apps/api/services/legal_variable_resolution.py` and `apps/api/services/escritura_readiness.py`; Verify: `pnpm test:api`
- [ ] T066 [P] Add storage access and signed/public URL regression coverage for legal evidence documents in `apps/web/tests/legal-control-center.test.ts`; Verify: `pnpm test:web`
- [ ] T067 [P] Document production operations for failed extraction retry, document superseding, rollback and evidence inspection in `plotify_memori/40 - Guias & Convenciones/Operacion Escrituras Variables.md`; Verify: `pnpm format:check`
- [ ] T068 Run full web quality gates after UI work: `pnpm --filter web lint`, `pnpm format:check`, `pnpm typecheck:web`, `pnpm build:web`; Verify: commands listed
- [ ] T069 Run full backend/database quality gates after API and migration work: `pnpm verify:migrations`, `pnpm test:api`, `pnpm contracts:generate`; Verify: commands listed
- [ ] T070 Run SDD analyze for `specs/007-escrituras-variable-resolution` and resolve any critical finding before implementation continues; Verify: `$speckit-analyze`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1.
- **US1 (Phase 3)**: Depends on Phase 2.
- **US2 (Phase 4)**: Depends on Phase 2 and benefits from US1 registered docs; can be tested with fixtures.
- **US3 (Phase 5)**: Depends on US2 variable inventory.
- **US4 (Phase 6)**: Depends on US2 SII extraction; can run in parallel with late US3 UI once API foundations are present.
- **US5 (Phase 7)**: Depends on US2, US4 and existing geometry readiness.
- **Polish (Phase 8)**: Depends on implemented stories and produces the explicit SDD 008 handoff.

### Parallel Opportunities

- T003 and T004 can run in parallel after T001 is understood.
- T008 through T012 can run in parallel after T006/T007 contracts are clear.
- Test tasks in each user story can be written in parallel with service implementation planning.
- UI components T038 through T041 can be built in parallel after T037 and shared types exist.
- US3 UI and US4 API matching can proceed in parallel after US2 inventory contracts stabilize.
- Production guardrail tasks T063 through T067 can run in parallel after the core stories are implemented.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1) so legal documents are registered and extraction jobs start.
3. Complete Phase 4 (US2) enough to produce variable inventory with evidence.
4. Stop and validate quickstart scenarios 1 and 2 before building broader UI.

### Incremental Delivery

1. Ingestion MVP: documents register and jobs queue.
2. Extraction MVP: variables/evidence exist and status is queryable.
3. Review MVP: Centro de Control Legal edits and approves variables.
4. Role MVP: SII role matching fills lot legal data.
5. Readiness MVP: sold-lot escritura case snapshots become available.
6. Handoff MVP: SDD 008 can consume snapshots without touching extraction internals.

## Notes

- Do not implement the visual minuta builder in this SDD.
- Do implement variable visualization/correction in this SDD; SDD 008 will only consume approved snapshots and may display variables inside the new matriz interface.
- Do not treat `Rol de avaluo en tramite` as missing when backed by SII evidence or approved legal review.
- Do not use lab schema, lab bucket or MCP server as production runtime.
- Do not hand-edit generated OpenAPI files as source of truth.
- SDD 008 starts from `handoff-sdd-008.md` after SDD 007 exposes stable case snapshots.
