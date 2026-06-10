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

- [x] T001 Create Supabase migration for `legal_documents`, `document_ingestion_jobs`, `legal_document_pages`, `variable_resolutions`, `document_evidence`, `lot_legal_data`, `escritura_cases` and `legal_review_decisions` in `packages/database/supabase/migrations/20260603000100_escrituras_variable_resolution.sql`; Verify: `pnpm verify:migrations`
- [x] T002 Regenerate database types after the migration in `packages/database/types/database.generated.ts` and update web database type mirrors if used in `apps/web/src/types/database.types.ts`; Verify: `pnpm typecheck:web`
- [x] T003 [P] Add canonical variable catalog constants and states in `apps/api/services/legal_variable_catalog.py`; Verify: `pnpm test:api`
- [x] T004 [P] Add frontend variable/readiness TypeScript types in `apps/web/src/lib/legal/variable-resolution-types.ts`; Verify: `pnpm typecheck:web`
- [x] T005 [P] Add implementation note linking SDD 007 to Obsidian memory in `plotify_memori/50 - Implementaciones/SDD 007 Escrituras Variable Resolution.md`; Verify: `pnpm format:check`
- [x] T071 [P] Add SDD 007 agent/subagent execution protocol and update active agent rules in `specs/007-escrituras-variable-resolution/agent-execution.md`, `AGENTS.md`, `.agents/rules/sdd-implementation.md`, `.agents/rules/plotify-rules.md`, `.agents/rules/plotify-chat.md` and `plotify_memori/50 - Implementaciones/SDD 007 Escrituras Variable Resolution.md`; Verify: `pnpm format:check`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core API/service/worker boundaries that MUST be complete before user stories.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T006 Add Pydantic schemas for legal documents, variables, role matching and readiness in `apps/api/schemas/legal_variables.py`; Verify: `pnpm test:api`
- [x] T007 Add FastAPI router skeleton and register it in `apps/api/api/v1/endpoints/legal_variables.py` and `apps/api/api/v1/router.py`; Verify: `pnpm test:api`
- [x] T008 [P] Add legal document registration service skeleton in `apps/api/services/legal_document_ingestion.py`; Verify: `pnpm test:api`
- [x] T009 [P] Add legal text extraction service skeleton in `apps/api/services/legal_text_extraction.py`; Verify: `pnpm test:api`
- [x] T010 [P] Add legal variable resolution service skeleton in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [x] T011 [P] Add SII role matching service skeleton in `apps/api/services/legal_role_matching.py`; Verify: `pnpm test:api`
- [x] T012 [P] Add escritura readiness service skeleton in `apps/api/services/escritura_readiness.py`; Verify: `pnpm test:api`
- [x] T013 Add arq worker task registration for legal document ingestion in `apps/api/workers/tasks/legal_document_ingestion.py` and `apps/api/workers/main_worker.py`; Verify: `pnpm test:api`
- [x] T014 Add shared audit event constants for legal document, variable and escritura case mutations in `apps/api/utils/audit.py`; Verify: `pnpm test:api`

**Checkpoint**: Foundation ready. Story implementation can start.

---

## Phase 3: User Story 1 - Registrar documentos legales sin friccion (Priority: P1) MVP

**Goal**: Existing onboarding and project document uploads register legal source documents and queue extraction without adding onboarding review.

**Independent Test**: Create a project with legal documents and verify document rows plus queued extraction jobs exist while onboarding remains upload-only.

### Tests for User Story 1

- [x] T015 [P] [US1] Add API tests for registering uploaded legal documents and queueing jobs in `apps/api/tests/test_escrituras_ingestion.py`; Verify: `pnpm test:api`
- [x] T016 [P] [US1] Add web tests for project-file upload legal document registration behavior in `apps/web/tests/escrituras-ingestion.test.ts`; Verify: `pnpm test:web`

### Implementation for User Story 1

- [x] T017 [US1] Implement `POST /legal-documents/register` and `GET /legal-documents/project/{project_id}` in `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [x] T018 [US1] Implement legal document registration and superseding logic in `apps/api/services/legal_document_ingestion.py`; Verify: `pnpm test:api`
- [x] T019 [US1] Extend `apps/web/src/app/api/projects/route.ts` and `apps/web/src/lib/services/projects.service.ts` so onboarding document paths register as legal documents after project creation; Verify: `pnpm test:web`
- [x] T020 [US1] Extend `apps/web/src/app/api/uploads/project-files/route.ts` so project document replacements register a legal document version and queue extraction; Verify: `pnpm test:web`
- [x] T021 [US1] Update accepted document metadata in `apps/web/src/components/projects/onboarding/ProjectMediaStep.tsx` without adding variable review UI; Verify: `pnpm test:web`
- [x] T022 [US1] Add legal document status display to `apps/web/src/components/projects/detail/documents-tab.tsx`; Verify: `pnpm test:web`

**Checkpoint**: User Story 1 is functional and testable independently.

---

## Phase 4: User Story 2 - Resolver variables con evidencia documental (Priority: P1)

**Goal**: Extraction proposes canonical variables from source documents and stores evidence, missing values and conflicts.

**Independent Test**: Process test documents and verify variables include state, source, confidence and document/page evidence.

### Tests for User Story 2

- [x] T023 [P] [US2] Add extraction and evidence tests for dominio vigente, SII roles and low-confidence plano samples in `apps/api/tests/test_escrituras_variable_resolution.py`; Verify: `pnpm test:api`
- [x] T024 [P] [US2] Add contract tests for variable inventory response shape in `apps/api/tests/test_escrituras_variable_contracts.py`; Verify: `pnpm test:api`

### Implementation for User Story 2

- [x] T025 [US2] Implement text/page extraction persistence in `apps/api/services/legal_text_extraction.py`; Verify: `pnpm test:api`
- [x] T026 [US2] Implement dominio vigente extraction rules and schema-normalized outputs in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [x] T027 [US2] Implement certificado roles SII extraction rules for certificate metadata, unit names, matriz role and pre-role/role-in-process values in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [x] T028 [US2] Implement SAG/plano extraction with low-confidence manual-review fallback in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [x] T029 [US2] Persist variable proposals and `document_evidence` rows from extraction jobs in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [x] T030 [US2] Implement missing/conflict/manual-review classification for critical variables in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [x] T031 [US2] Implement `GET /legal-variables/project/{project_id}` inventory endpoint in `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [x] T032 [US2] Add web proxy for project legal variables in `apps/web/src/app/api/projects/[id]/legal-variables/route.ts`; Verify: `pnpm test:web`

**Checkpoint**: User Story 2 is functional and testable independently.

---

## Phase 5: User Story 3 - Revisar y corregir variables en Centro de Control Legal (Priority: P2)

**Goal**: Users can inspect variables, evidence, conflicts and missing values; correct and approve variables with audit before any matriz builder consumes them.

**Independent Test**: Edit a variable in the Centro de Control Legal and verify audit history plus approved state; then verify a refreshed escritura case snapshot exposes the corrected value for future SDD 008 consumption.

### Tests for User Story 3

- [x] T033 [P] [US3] Add API tests for variable edit, approve, mark-not-applicable and audit decisions in `apps/api/tests/test_escrituras_variable_review.py`; Verify: `pnpm test:api`
- [x] T034 [P] [US3] Add frontend tests for variable table filters, edit drawer and evidence viewer in `apps/web/tests/legal-control-center.test.ts`; Verify: `pnpm test:web`

### Implementation for User Story 3

- [x] T035 [US3] Implement `PATCH /legal-variables/{variable_resolution_id}` with state transition validation in `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [x] T036 [US3] Implement review/audit persistence in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api`
- [x] T037 [US3] Add web proxy for variable edits in `apps/web/src/app/api/projects/[id]/legal-variables/[variableId]/route.ts`; Verify: `pnpm test:web`
- [x] T038 [P] [US3] Build `LegalDocumentStatusPanel` in `apps/web/src/components/projects/legal/legal-document-status-panel.tsx`; Verify: `pnpm test:web`
- [x] T039 [P] [US3] Build `LegalVariableTable` in `apps/web/src/components/projects/legal/legal-variable-table.tsx`; Verify: `pnpm test:web`
- [x] T040 [P] [US3] Build `LegalVariableEditor` in `apps/web/src/components/projects/legal/legal-variable-editor.tsx`; Verify: `pnpm test:web`
- [x] T041 [P] [US3] Build `LegalEvidenceViewer` in `apps/web/src/components/projects/legal/legal-evidence-viewer.tsx`; Verify: `pnpm test:web`
- [x] T042 [US3] Compose Centro de Control Legal in `apps/web/src/components/projects/detail/legal-control-center.tsx` and mount it from `apps/web/src/components/projects/detail/legal-tab.tsx`; Verify: `pnpm test:web`

**Checkpoint**: User Story 3 is functional and testable independently.

---

## Phase 6: User Story 4 - Asignar roles SII a lotes (Priority: P2)

**Goal**: SII roles/pre-roles are associated to lots with explicit matching state and legal handling of `Rol de avaluo en tramite`.

**Independent Test**: Process an SII certificate with multiple units and verify each lot has matched, ambiguous, missing or manual override state.

### Tests for User Story 4

- [x] T043 [P] [US4] Add SII role matching tests for exact match, ambiguous match, missing match and manual override in `apps/api/tests/test_escrituras_role_matching.py`; Verify: `pnpm test:api`
- [x] T044 [P] [US4] Add frontend tests for lot role matching status and manual override reason in `apps/web/tests/legal-role-matching.test.ts`; Verify: `pnpm test:web`

### Implementation for User Story 4

- [x] T045 [US4] Implement lot/unit normalization and matching score logic in `apps/api/services/legal_role_matching.py`; Verify: `pnpm test:api`
- [x] T046 [US4] Persist `lot_legal_data` matches and role-in-process state from SII extraction in `apps/api/services/legal_role_matching.py`; Verify: `pnpm test:api`
- [x] T047 [US4] Implement role matching endpoints in `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [x] T048 [US4] Add web proxy routes for role matching in `apps/web/src/app/api/projects/[id]/legal-roles/route.ts` and `apps/web/src/app/api/projects/[id]/legal-roles/[lotId]/route.ts`; Verify: `pnpm test:web`
- [x] T049 [US4] Add role matching UI section to `apps/web/src/components/projects/detail/legal-control-center.tsx`; Verify: `pnpm test:web`
- [x] T050 [US4] Extend `apps/api/services/document_engine.py` so approved lot legal role variables can feed `sii.*` and `lote.rol_tramite`; Verify: `pnpm test:api`

**Checkpoint**: User Story 4 is functional and testable independently.

---

## Phase 7: User Story 5 - Crear readiness de caso de escritura por lote vendido (Priority: P3)

**Goal**: Sold lots expose escritura readiness gates and can create an escritura case snapshot before future minuta generation.

**Independent Test**: Query readiness for a sold lot and verify all gates, warnings, blocking variables and snapshots.

### Tests for User Story 5

- [x] T051 [P] [US5] Add API tests for escritura readiness gates and case snapshot creation in `apps/api/tests/test_escrituras_readiness.py`; Verify: `pnpm test:api`
- [x] T052 [P] [US5] Add frontend tests for readiness panel, legal warning and blocked generation actions in `apps/web/tests/escritura-readiness.test.ts`; Verify: `pnpm test:web`

### Implementation for User Story 5

- [x] T053 [US5] Implement escritura readiness gate calculation in `apps/api/services/escritura_readiness.py`; Verify: `pnpm test:api`
- [x] T054 [US5] Implement escritura case creation and variable/evidence snapshot persistence in `apps/api/services/escritura_readiness.py`; Verify: `pnpm test:api`
- [x] T055 [US5] Implement readiness and case endpoints in `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [x] T056 [US5] Add web proxy routes for readiness and case creation in `apps/web/src/app/api/projects/[id]/escritura-readiness/route.ts` and `apps/web/src/app/api/projects/[id]/escritura-cases/route.ts`; Verify: `pnpm test:web`
- [x] T057 [US5] Build `EscrituraReadinessPanel` with mandatory lawyer-review warning in `apps/web/src/components/projects/legal/escritura-readiness-panel.tsx`; Verify: `pnpm test:web`
- [x] T058 [US5] Integrate readiness gating into escritura generation entry points in `apps/web/src/components/projects/detail/documents-tab.tsx` and `apps/web/src/components/dashboard/documents/generation-wizard.tsx`; Verify: `pnpm test:web`

**Checkpoint**: User Story 5 is functional and testable independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Contracts, documentation, SDD 008 handoff, quality gates and production guardrails.

- [x] T059 Regenerate OpenAPI and client contracts after API changes using `pnpm contracts:generate`; Verify: `pnpm contracts:generate`
- [x] T060 [P] Add end-to-end quickstart coverage notes and update product memory in `plotify_memori/20 - Producto & Proyectos/Generador de Escrituras de Compraventa.md`; Verify: `pnpm format:check`
- [x] T061 [P] Add security/tenant regression coverage for legal variable endpoints in `apps/api/tests/test_tenant_validation.py`; Verify: `pnpm test:api`
- [x] T062 [P] Add SDD 008 handoff contract in `specs/007-escrituras-variable-resolution/handoff-sdd-008.md`; Verify: `pnpm format:check`
- [x] T063 [P] Add feature flag and rollout controls for legal extraction/readiness in `apps/web/src/lib/features/legal-documents.ts` and `apps/api/core/config.py`; Verify: `pnpm test:web && pnpm test:api`
- [x] T064 [P] Add extraction retry/idempotency tests for duplicate job dispatch and superseded document versions in `apps/api/tests/test_escrituras_ingestion.py`; Verify: `pnpm test:api`
- [x] T065 [P] Add structured observability for extraction jobs, variable proposals, review decisions and readiness gates in `apps/api/services/legal_document_ingestion.py`, `apps/api/services/legal_variable_resolution.py` and `apps/api/services/escritura_readiness.py`; Verify: `pnpm test:api`
- [x] T066 [P] Add storage access and signed/public URL regression coverage for legal evidence documents in `apps/web/tests/legal-control-center.test.ts`; Verify: `pnpm test:web`
- [x] T067 [P] Document production operations for failed extraction retry, document superseding, rollback and evidence inspection in `plotify_memori/40 - Guias & Convenciones/Operacion Escrituras Variables.md`; Verify: `pnpm format:check`
- [x] T068 Run full web quality gates after UI work: `pnpm --filter web lint`, `pnpm format:check`, `pnpm typecheck:web`, `pnpm build:web`; Verify: commands listed
- [x] T069 Run full backend/database quality gates after API and migration work: `pnpm verify:migrations`, `pnpm test:api`, `pnpm contracts:generate`; Verify: commands listed
- [x] T070 Run SDD analyze for `specs/007-escrituras-variable-resolution` and resolve any critical finding before implementation continues; Verify: `$speckit-analyze`

---

## Phase 9: Product Correction - Deterministic SII Role Extraction

**Purpose**: Re-open the role extraction slice after legal/product review found the previous SII extraction approach too generic. Certificado de roles extraction must use the simple certificate pattern `numero de lote + rol/pre-rol + comuna` before any LLM-assisted fallback.

- [x] T072 [P] [US2] Add SII role certificate parser tests for repeated `lote + rol/pre-rol + comuna` rows/blocks, incomplete tuples and multiple comunas in `apps/api/tests/test_escrituras_variable_resolution.py` and `apps/api/tests/test_escrituras_role_matching.py`; Verify: `pnpm test:api`
- [x] T073 [US2] Implement deterministic certificado roles SII tuple extraction in `apps/api/services/legal_variable_resolution.py`, preserving normalized lot number, role/pre-role, comuna, source page/snippet and row/block index before any LLM fallback; Verify: `pnpm test:api`
- [x] T074 [US4] Update `apps/api/services/legal_role_matching.py`, `apps/api/schemas/legal_variables.py` and web legal role types so automatic matches require the same extracted tuple and expose `sii_lot_number_normalized`, `sii_comuna`, `sii_role_record` and derived `sii_role_in_process_text`; Verify: `pnpm test:api && pnpm typecheck:web`
- [x] T075 Run SDD analyze for `specs/007-escrituras-variable-resolution` after this product correction and resolve any critical finding before implementation resumes; Verify: `$speckit-analyze`

---

## Phase 10: Product Correction - Real SII Certificate Corpus and Role UX

**Purpose**: Extend SII extraction from the strict tuple correction into the real pilot certificate formats. Certificados SII must preserve common matrix role, header comuna, OCR/text provenance and row evidence before matching lots or feeding minuta variables.

- [x] T076 [P] [US2] Add SII parser tests for Teno, Gaona 3, Gaona 7 and Pemuco textual row shapes, including header comuna, `Rol(es) Matriz(ces)`, F2118 request number and emission date in `apps/api/tests/test_escrituras_variable_resolution.py`; Verify: `pnpm test:api`
- [x] T077 [P] [US2] Add OCR fallback tests for image-only certificado roles PDFs with successful OCR and OCR-unavailable paths in `apps/api/tests/test_escrituras_text_extraction.py`; Verify: `pnpm test:api`
- [x] T078 [US2] Implement OCR fallback for image-only SII PDFs in `apps/api/services/legal_text_extraction.py` and `apps/api/core/config.py`, preserving converter/stats metadata and `ocr_required` failure state; Verify: `pnpm test:api`
- [x] T079 [US2] Implement real SII certificate parser support in `apps/api/services/legal_variable_resolution.py` for header comuna, certificate number/date, F2118 request number, matrix role, `LOTE N`, prefixed `LOTE N`, `PARCELA X LT N` and similar row shapes; Verify: `pnpm test:api`
- [x] T080 [US4] Tighten role matching in `apps/api/services/legal_role_matching.py` so automatic `matched` requires normalized lot number, role/pre-role, comuna and parser evidence, and propagates `sii_role_matrix` into `lot_legal_data`; Verify: `pnpm test:api`
- [x] T081 [P] [US4] Update API schemas/contracts and generated web role types so role responses expose certificate summary, OCR/text provenance, matrix role, row evidence and review counts in `apps/api/schemas/legal_variables.py`, `specs/007-escrituras-variable-resolution/contracts/api-contracts.md` and `apps/web/src/lib/legal/variable-resolution-types.ts`; Verify: `pnpm test:api && pnpm typecheck:web`
- [x] T082 [US4] Redesign the SII roles section into a scannable certificate summary, filtered role table and manual override drawer in `apps/web/src/components/projects/detail/legal-control-center.tsx`; Verify: `pnpm test:web`
- [x] T083 Run SDD analyze for `specs/007-escrituras-variable-resolution` after the real SII corpus correction and resolve any critical finding before implementation resumes; Verify: `$speckit-analyze`

---

## Phase 11: Production Hardening - Senior Review Corrections

**Purpose**: Close senior review blockers before SDD 007 is considered production-ready or handed off to SDD 008. These tasks correct unsafe matching, stale certificate scope, cross-page header handling, matrix-role ambiguity, manual override derivation and OCR runtime guardrails.

- [x] T084 [P] [US4] Add role matching regression tests for multi-number SII labels, strict `sii_lot_number_normalized` equality and one-row/one-lot automatic assignment in `apps/api/tests/test_escrituras_role_matching.py`; Verify: `pnpm test:api -- tests/test_escrituras_role_matching.py`
- [x] T085 [US4] Implement strict normalized lot matching and one-to-one SII row consumption in `apps/api/services/legal_role_matching.py`; Verify: `pnpm test:api -- tests/test_escrituras_role_matching.py`
- [x] T086 [P] [US4] Add active-certificate scoping tests for superseded SII variables and explicit latest certificado de roles selection in `apps/api/tests/test_escrituras_role_matching.py` and `apps/api/tests/test_escrituras_ingestion.py`; Verify: `pnpm test:api -- tests/test_escrituras_role_matching.py tests/test_escrituras_ingestion.py`
- [x] T087 [US4] Implement active certificado SII scoping for role units/readiness, excluding superseded document variables while preserving historical evidence, in `apps/api/services/legal_role_matching.py`, `apps/api/services/legal_document_ingestion.py` and `apps/api/api/v1/endpoints/legal_variables.py`; Verify: `pnpm test:api`
- [x] T088 [P] [US2] Add parser tests for multi-page SII header context and multiple matrix roles requiring manual review in `apps/api/tests/test_escrituras_variable_resolution.py`; Verify: `pnpm test:api -- tests/test_escrituras_variable_resolution.py`
- [x] T089 [US2] Implement document-level SII header context propagation and multiple matrix role preservation/manual-review classification in `apps/api/services/legal_variable_resolution.py`; Verify: `pnpm test:api -- tests/test_escrituras_variable_resolution.py`
- [x] T090 [P] [US4] Add manual override derivation tests for changed pre-role/comuna and stale client text rejection in `apps/api/tests/test_escrituras_role_matching.py` and `apps/web/tests/legal-role-matching.test.ts`; Verify: `pnpm test:api -- tests/test_escrituras_role_matching.py && pnpm test:web -- legal-role-matching.test.ts`
- [x] T091 [US4] Implement server-side `sii_role_in_process_text` derivation and normalized role record persistence for manual overrides in `apps/api/services/legal_role_matching.py`, `apps/api/schemas/legal_variables.py` and `apps/web/src/components/projects/detail/legal-control-center.tsx`; Verify: `pnpm test:api -- tests/test_escrituras_role_matching.py && pnpm test:web -- legal-role-matching.test.ts && pnpm typecheck:web`
- [x] T092 [P] [US2] Add OCR runtime guardrail tests for missing `pdf2image`/`pytesseract`, missing Poppler/Tesseract, timeout and converter exceptions in `apps/api/tests/test_escrituras_text_extraction.py`; Verify: `pnpm test:api -- tests/test_escrituras_text_extraction.py`
- [x] T093 [US2] Implement OCR production guardrails, dependency declarations and timeout/error classification in `apps/api/services/legal_text_extraction.py`, `apps/api/core/config.py` and `apps/api/requirements.txt`; Verify: `pnpm test:api`
- [x] T094 [US4] Update schemas/contracts/web types for strict normalized matching, active certificate provenance, matrix role lists/manual-review counts and server-derived override text in `apps/api/schemas/legal_variables.py`, `specs/007-escrituras-variable-resolution/contracts/api-contracts.md` and `apps/web/src/lib/legal/variable-resolution-types.ts`; Verify: `pnpm test:api && pnpm typecheck:web && pnpm contracts:generate`
- [x] T095 Run production hardening gates after Phase 11: `pnpm verify:migrations`, `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web`, `pnpm contracts:generate`, `pnpm format:check`, `pnpm build:web`; Verify: commands listed
- [x] T096 Run SDD analyze after Phase 11 and resolve critical findings before SDD 007 closure; Verify: `$speckit-analyze`

---

## Phase 12: Production Hardening - Matriz/Lote Source Of Truth Alignment

**Purpose**: Align SDD 007 with the production legal data model agreed in senior/product review: project/matriz data is common to all sibling lots, lot data is keyed by `lot_id`, certificado de roles SII implies `rol_en_tramite` for extracted lot roles, no roles are assumed without an active certificate or audited manual override, and minuta generation consumes stable domain data instead of parser internals.

**Independent Test**: For a project with one active certificado de roles SII, every extracted lot receives `rol_en_tramite`, shared comuna and shared rol matriz from project/matriz legal data, and its own unique pre-role by `lot_id`. For a project with no active certificado, readiness blocks SII role generation unless an audited manual override exists. Generated document variables and escritura case snapshots expose only legal domain values and minimal source document attribution.

### Tests for Phase 12

- [x] T097 [P] [US4] Add API regression tests for the matriz/lote source-of-truth contract in `apps/api/tests/test_escrituras_role_matching.py`, covering active certificado roles SII implies `rol_en_tramite`, shared `sii_comuna`/`sii_role_matrix` across sibling lots, unique `sii_pre_role` per `lot_id`, and no role assumptions when no active certificado exists; Verify: `pnpm test:api -- tests/test_escrituras_role_matching.py`
- [x] T098 [P] [US5] Add readiness and document generation tests in `apps/api/tests/test_escrituras_readiness.py` and `apps/api/tests/test_mvp_documents.py`, covering no active certificado blocks SII readiness, audited manual override unblocks it, and generated variables consume `project_legal_data` for matriz/common SII values plus `lot_legal_data` for lot-specific role values; Verify: `pnpm test:api -- tests/test_escrituras_readiness.py tests/test_mvp_documents.py`
- [x] T099 [P] [US2] Add persistence regression tests in `apps/api/tests/test_escrituras_variable_resolution.py` for repeatable `sii.rol_avaluo_en_tramite_texto` scoping by `unit_index`, ensuring each lot role proposal can persist independently without overwriting sibling role text; Verify: `pnpm test:api -- tests/test_escrituras_variable_resolution.py`
- [x] T100 [P] [US3] Add frontend contract tests in `apps/web/tests/legal-role-matching.test.ts` and `apps/web/tests/legal-control-center.test.ts` so Centro de Control Legal shows source as "Certificado de roles SII" or "Ajuste manual" and does not expose parser/header/fila metadata as user-facing legal data; Verify: `pnpm test:web -- legal-role-matching.test.ts legal-control-center.test.ts`

### Implementation for Phase 12

- [x] T101 [US4] Add a Supabase migration for common SII matriz fields in `project_legal_data` in `packages/database/supabase/migrations/20260608000100_align_sii_matriz_lot_source_of_truth.sql`, including nullable `sii_comuna`, `sii_role_matrix`, `sii_roles_source_legal_document_id`, `sii_roles_status` and tenant/scope validation against `projects` and `legal_documents`; Verify: `pnpm verify:migrations`
- [x] T102 [US4] Regenerate database types after the migration in `packages/database/types/database.generated.ts` and update web database mirrors if present in `apps/web/src/types/database.types.ts`; Verify: `pnpm typecheck:web`
- [x] T103 [US4] Update role matching persistence in `apps/api/services/legal_role_matching.py` so active certificado roles SII upserts shared `sii_comuna`, `sii_role_matrix`, source document and common `rol_en_tramite` status into `project_legal_data`, while `lot_legal_data` remains keyed by `lot_id` and stores only lot-specific SII unit/pre-role/definitive role/matching state plus minimal source attribution; Verify: `pnpm test:api -- tests/test_escrituras_role_matching.py`
- [x] T104 [US4] Update active certificate scoping in `apps/api/services/legal_role_matching.py`, `apps/api/services/legal_document_ingestion.py` and `apps/api/api/v1/endpoints/legal_variables.py` so absence of an active certificado de roles returns missing role inventory/readiness inputs instead of falling back to historical variables; Verify: `pnpm test:api -- tests/test_escrituras_role_matching.py tests/test_escrituras_ingestion.py`
- [x] T105 [US2] Fix repeatable SII role text persistence in `apps/api/services/legal_variable_resolution.py` and add `packages/database/supabase/migrations/20260608000200_scope_repeatable_sii_role_text.sql` so `sii.rol_avaluo_en_tramite_texto` is scoped by `unit_index` consistently with `sii.unidad_nombre` and `sii.pre_rol_lote`; Verify: `pnpm verify:migrations && pnpm test:api -- tests/test_escrituras_variable_resolution.py`
- [x] T106 [US4] Simplify public role provenance in `apps/api/schemas/legal_variables.py`, `specs/007-escrituras-variable-resolution/contracts/api-contracts.md` and `apps/web/src/lib/legal/variable-resolution-types.ts` to expose domain attribution (`source_type`, `source_legal_document_id`, `source_document_label`, active/manual status) while keeping parser/page/row metadata internal to `document_evidence` and extraction diagnostics; Verify: `pnpm test:api && pnpm typecheck:web && pnpm contracts:generate`
- [x] T107 [US5] Update `apps/api/services/document_engine.py` and `apps/api/services/escritura_readiness.py` so minuta variables and readiness gates read common SII matriz values from `project_legal_data`, lot-specific role identity from `lot_legal_data`, and never depend on parser metadata or stale variable proposals; Verify: `pnpm test:api -- tests/test_escrituras_readiness.py tests/test_mvp_documents.py`
- [x] T108 [US3] Update Centro de Control Legal in `apps/web/src/components/projects/detail/legal-control-center.tsx` to show common matriz SII values once per certificate/project, lot-specific pre-role values per row, and source labels without parser/header/fila details; Verify: `pnpm test:web -- legal-role-matching.test.ts legal-control-center.test.ts && pnpm typecheck:web`
- [x] T109 [US5] Update escritura case snapshot construction in `apps/api/services/escritura_readiness.py` so `variable_snapshot` contains legal domain values needed by SDD 008 (`sii.rol_matriz`, `sii.comuna`, `lote.rol_tramite`, `sii.rol_avaluo_en_tramite_texto`) and `evidence_snapshot` contains minimal source document references rather than raw OCR/parser metadata; Verify: `pnpm test:api -- tests/test_escrituras_readiness.py`
- [x] T110 [P] Update SDD 007 documentation and Plotify memory in `specs/007-escrituras-variable-resolution/plan.md`, `specs/007-escrituras-variable-resolution/data-model.md`, `specs/007-escrituras-variable-resolution/contracts/api-contracts.md`, `specs/007-escrituras-variable-resolution/contracts/ui-contracts.md`, `specs/007-escrituras-variable-resolution/quickstart.md`, `plotify_memori/50 - Implementaciones/SDD 007 Escrituras Variable Resolution.md` and `plotify_memori/60 - Referencias & Soporte/Variables Escritura Compraventa - Fuentes de Obtencion.md` to state the source-of-truth split: `project_legal_data` for matriz/common data, `lot_legal_data` for per-lot data, `variable_resolutions` for review/audit staging, and `escritura_cases` for stable snapshots; Verify: `pnpm format:check`
- [x] T111 Run production source-of-truth quality gates after Phase 12: `pnpm verify:migrations`, `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web`, `pnpm contracts:generate`, `pnpm format:check`, `pnpm build:web`; Verify: commands listed
- [x] T112 Run SDD analyze after Phase 12 and resolve critical findings before SDD 007 closure or SDD 008 handoff; Verify: `$speckit-analyze`

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
- **SII correction (Phase 9)**: Depends on US2 and US4; reopens only the deterministic certificado roles SII extraction and matching slice.
- **Real SII corpus correction (Phase 10)**: Depends on Phase 9; reopens OCR/text extraction, SII parser, role matching contracts and role matching UI for the observed pilot certificate corpus.
- **Production hardening (Phase 11)**: Depends on Phase 10 and is required before SDD 007 can be production-ready or handed off to SDD 008.
- **Matriz/lote source-of-truth alignment (Phase 12)**: Depends on Phase 11 and is required before SDD 007 can be considered production-ready for minuta generation or handed off to SDD 008.

### Parallel Opportunities

- T003 and T004 can run in parallel after T001 is understood.
- T008 through T012 can run in parallel after T006/T007 contracts are clear.
- Test tasks in each user story can be written in parallel with service implementation planning.
- UI components T038 through T041 can be built in parallel after T037 and shared types exist.
- US3 UI and US4 API matching can proceed in parallel after US2 inventory contracts stabilize.
- Production guardrail tasks T063 through T067 can run in parallel after the core stories are implemented.
- T076 and T077 can run in parallel because they cover different extraction layers.
- T081 can start after T080 defines the final response shape; T082 depends on T081 web types.
- T084, T086, T088, T090 and T092 can be written in parallel after Phase 10 because they cover distinct regression surfaces; implementation tasks T085, T087, T089, T091, T093 and T094 must follow their relevant tests and avoid parallel edits to shared API contracts.
- T097, T098, T099 and T100 can be written in parallel after Phase 11 because they cover backend contract, readiness/generation, persistence and frontend behavior separately.
- T101 and T102 must precede T103, T107 and T109 because they establish the common SII matriz storage contract.
- T103, T104 and T105 all edit shared backend persistence and must run sequentially in separate implementation passes unless the user explicitly expands scope.
- T106 must precede T108 because the UI should consume the simplified public provenance contract.
- T110 can run in parallel with implementation only if no other agent edits the same SDD or Plotify memory files.

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
7. Production hardening MVP: strict SII matching, active certificate provenance, OCR guardrails and server-derived role text are complete before SDD 008 handoff.
8. Source-of-truth MVP: matriz/common legal values live at project level, lot-specific values live by `lot_id`, and minuta/snapshot generation consumes domain values rather than parser metadata.

## Notes

- Do not implement the visual minuta builder in this SDD.
- Do implement variable visualization/correction in this SDD; SDD 008 will only consume approved snapshots and may display variables inside the new matriz interface.
- Do not treat `Rol de avaluo en tramite` as missing when backed by SII evidence or approved legal review.
- Do not extract SII lot roles as generic free-form variables when the certificate exposes the regular `lote + rol/pre-rol + comuna` pattern.
- Do not assume SII roles when no active certificado de roles SII exists; use audited manual override or wait for document upload.
- Do treat roles extracted from an active certificado de roles SII as `rol_en_tramite` until a definitive role certificate or approved post-inscription value exists.
- Do keep `project_legal_data` as the authoritative home for common matriz/project legal values and `lot_legal_data` as the authoritative home for per-lot legal values keyed by `lot_id`.
- Do keep parser/page/row metadata internal to extraction diagnostics or `document_evidence`; the public contract and generated escritura variables should expose legal source attribution, not parser internals.
- Do not use lab schema, lab bucket or MCP server as production runtime.
- Do not hand-edit generated OpenAPI files as source of truth.
- Do not mark SDD 007 production-ready until Phase 12 is complete and T112 has no critical analyze findings.
- SDD 008 starts from `handoff-sdd-008.md` after SDD 007 exposes stable case snapshots.
