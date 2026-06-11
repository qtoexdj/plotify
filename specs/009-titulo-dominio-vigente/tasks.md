# Tasks: Resolucion de Titulo de Dominio Vigente con Agente

**Input**: Design documents from `/specs/009-titulo-dominio-vigente/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [agent-execution.md](./agent-execution.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. This feature touches Supabase migrations, LLM-backed
extraction with legal risk, API contracts, tenant isolation, readiness gating
and frontend review workflows.

**Organization**: Tasks grouped by user story. Follow repository rule:
implement exactly one unchecked task per implementation pass unless the user
explicitly requests broader scope.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel within its phase if dependencies are met.
- **[Story]**: Maps to user stories in [spec.md](./spec.md).
- Every task includes exact file paths and a verify command.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema, types, fixtures and rule pointers needed by all stories.

- [x] T001 Update active SDD pointers to 009 in `.agents/rules/sdd-implementation.md`, `.agents/rules/plotify-rules.md`, `.agents/rules/plotify-chat.md` and `AGENTS.md`; Verify: `pnpm format:check`
- [x] T002 Create Supabase migration for `title_analyses` (columns, indexes, RLS per data-model.md) plus catalog-superseded variable cleanup statement in `packages/database/supabase/migrations/20260609000100_titulo_dominio_vigente.sql`; Verify: `pnpm verify:migrations`
- [x] T003 Regenerate database types in `packages/database/types/database.generated.ts`; Verify: `pnpm typecheck:web`
- [x] T004 [P] Add `titulo.*` group, remove `matriz.inscripcion_*`/`matriz.adquisicion_*`, and update `READINESS_REQUIRED_VARIABLES_BY_GATE["title_verified"]` in `apps/api/services/legal_variable_catalog.py`; Verify: `pnpm test:api`
- [x] T005 [P] Add settings `LEGAL_TITLE_AGENT_ENABLED`, `LEGAL_TITLE_AGENT_PROVIDER` (default `openai`), `LEGAL_TITLE_AGENT_MODEL` (default `gpt-4o`), `LEGAL_TITLE_AGENT_TIMEOUT_SECONDS`, `LEGAL_TITLE_AGENT_MAX_INPUT_CHARS` in `apps/api/core/config.py`; Verify: `pnpm test:api`
- [x] T006 [P] Build Teno fixture set: extracted page texts for both dominios, golden chain JSON, golden narrative blocks (deed dates 2022, surname as written), and a hallucinated LLM response fixture (dates 2023, altered surname) in `apps/api/tests/fixtures/titulo/`; Verify: `pnpm test:api`
- [x] T007 [P] Add frontend title types in `apps/web/src/lib/legal/title-types.ts`; Verify: `pnpm typecheck:web`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schemas, router, service and worker skeletons.

**CRITICAL**: No user story work until this phase completes.

- [x] T008 Add Pydantic schemas (`TitleAnalysis`, `EvidencedValue`, `TitleInscription`, `TitleAlert`, request/response models) in `apps/api/schemas/legal_titles.py`; Verify: `pnpm test:api`
- [x] T009 Add FastAPI router skeleton and register it in `apps/api/api/v1/endpoints/legal_titles.py` and `apps/api/api/v1/router.py`; Verify: `pnpm test:api`
- [x] T010 [P] Add orchestrator service skeleton (gather sources, run states, idempotency hash) in `apps/api/services/legal_title_analysis.py`; Verify: `pnpm test:api`
- [x] T011 [P] Add LLM client skeleton with `titulo_agent_v1` prompt scaffold and structured-output wiring in `apps/api/services/legal_title_llm.py`; Verify: `pnpm test:api`
- [x] T012 [P] Add deterministic verifier skeleton (normalization + snippet matching API) in `apps/api/services/legal_title_verification.py`; Verify: `pnpm test:api`
- [x] T013 [P] Add narrative renderer skeleton with numbers-to-words utilities in `apps/api/services/legal_title_blocks.py`; Verify: `pnpm test:api`
- [x] T014 Add arq worker task `analyze_project_title` in `apps/api/workers/tasks/legal_title_analysis.py` and register in `apps/api/workers/main_worker.py`; Verify: `pnpm test:api`

**Checkpoint**: Foundation ready. Story implementation can start.

---

## Phase 3: User Story 1 - Analisis de titulo a nivel proyecto (Priority: P1) MVP

**Goal**: A project's title documents produce a persisted, schema-valid,
idempotent title analysis with chain, owners and structure.

**Independent Test**: Teno fixtures produce structure `compra_derechos`, two
inscriptions with correct registral data and evidence refs.

### Tests for User Story 1

- [x] T015 [P] [US1] Add analysis pipeline tests (gathering, segmentation, idempotency, failure states, llm_disabled) with mocked LLM in `apps/api/tests/test_titulo_analysis.py`; Verify: `pnpm test:api`

### Implementation for User Story 1

- [x] T016 [US1] Implement source gathering of active `dominio_vigente`/`personeria`/`hipoteca_gravamen` documents and pages, plus `source_content_hash`, in `apps/api/services/legal_title_analysis.py`; Verify: `pnpm test:api`
- [x] T017 [US1] Implement structured-output extraction steps (classify structure, extract chain, extract owners/representation, extract identity) with per-document segmentation and max-chars guard in `apps/api/services/legal_title_llm.py`; Verify: `pnpm test:api`
- [x] T018 [US1] Implement run lifecycle: persist `title_analyses` row, statuses (`processing`/`proposed`/`needs_review`/`failed`/`llm_disabled`), retries, timeout, `failure_code`, token usage and duration in `apps/api/services/legal_title_analysis.py`; Verify: `pnpm test:api`
- [x] T019 [US1] Trigger integration: queue title analysis after title-document ingestion and supersede+requeue on document replacement in `apps/api/services/legal_document_ingestion.py` and `apps/api/workers/tasks/legal_title_analysis.py`; Verify: `pnpm test:api`
- [x] T020 [US1] Remove `dominio_vigente_rules_v1` regex path and `DOMINIO_VIGENTE_REQUIRED_VARIABLES` from `apps/api/services/legal_variable_resolution.py`, updating `resolve_document_variables` dispatch, and delete the transitional shims it required: `LEGACY_DEPRECATED_KEYS` in `apps/api/services/legal_variable_catalog.py` and the legacy `matriz.inscripcion_*` block in `CRITICAL_VARIABLE_KEYS`; Verify: `pnpm test:api`
- [x] T021 [US1] Update or remove obsolete dominio regex tests in `apps/api/tests/test_escrituras_variable_resolution.py` and `apps/api/tests/test_escrituras_variable_inventory.py`, and clean stale `matriz.inscripcion_*`/`matriz.adquisicion_*` references in `apps/web/src/types/documents.ts`; Verify: `pnpm test:api && pnpm typecheck:web`

**Checkpoint**: Title analysis runs end-to-end with mocked LLM.

---

## Phase 4: User Story 2 - Bloques narrativos verificados (Priority: P1)

**Goal**: Every fact verified against page text; narrative rendered from
verified data only; hallucinations degrade to manual_review.

**Independent Test**: Hallucinated fixture (2023 dates, altered surname) ends
`manual_review`; clean fixture renders golden blocks.

### Tests for User Story 2

- [x] T022 [P] [US2] Add verifier tests: normalization rules, snippet matching, degradation, hallucination regression (SC-002) in `apps/api/tests/test_titulo_verification.py`; Verify: `pnpm test:api`
- [x] T023 [P] [US2] Add narrative golden tests (comparecencia + PRIMERO vs lawyer-corrected golden, numbers-to-words) in `apps/api/tests/test_titulo_blocks.py`; Verify: `pnpm test:api`

### Implementation for User Story 2

- [x] T024 [US2] Implement deterministic evidence verifier: whitespace/case/accent normalization, literal substring match against `legal_document_pages`, per-field verdicts and `verification_stats` in `apps/api/services/legal_title_verification.py`; Verify: `pnpm test:api`
- [x] T025 [US2] Implement cross-checks (`matriz.rol_avaluo` vs active SII data; superficie vs SAG/plano informational check) in `apps/api/services/legal_title_verification.py`; Verify: `pnpm test:api`
- [x] T026 [US2] Implement narrative rendering from verified chain only, deterministic numbers-to-words, and block invalidation when underlying facts are unverified in `apps/api/services/legal_title_blocks.py`; Verify: `pnpm test:api`
- [x] T027 [US2] Implement staging of `titulo.*`, matriz identity and `vendedor.*` proposals with evidence into `variable_resolutions`/`document_evidence` via `LegalVariableResolutionService`, using `source_ref.inscription_index` for repeatables, in `apps/api/services/legal_title_analysis.py`; Verify: `pnpm test:api`

**Checkpoint**: Verified analysis + narrative blocks staged with evidence.

---

## Phase 5: User Story 3 - Revision y aprobacion en Centro de Control Legal (Priority: P2)

**Goal**: Lawyers review, edit, resolve and approve the title case with audit.

**Independent Test**: Edit PRIMERO with reason, approve case, verify audit and
`title_verified` satisfied.

### Tests for User Story 3

- [x] T028 [P] [US3] Add endpoint tests (get, reanalyze idempotency, narrative edit audit, approve preconditions/blocking list, tenant isolation) in `apps/api/tests/test_titulo_endpoints.py`; Verify: `pnpm test:api`
- [x] T029 [P] [US3] Add web tests for panel states, narrative editor reason flow and approve checklist in `apps/web/tests/title-case-panel.test.ts`; Verify: `pnpm test:web`

### Implementation for User Story 3

- [x] T030 [US3] Implement `GET /legal-titles/project/{project_id}` and `POST /legal-titles/project/{project_id}/reanalyze` in `apps/api/api/v1/endpoints/legal_titles.py`; Verify: `pnpm test:api`
- [x] T031 [US3] Implement `PATCH /legal-titles/{analysis_id}/narrative` and `POST /legal-titles/{analysis_id}/approve` with `legal_review_decisions` audit (`title_block_edited`, `title_case_approved`) in `apps/api/api/v1/endpoints/legal_titles.py` and `apps/api/services/legal_title_analysis.py`; Verify: `pnpm test:api`
- [x] T032 [US3] Add Next.js proxy routes in `apps/web/src/app/api/projects/[id]/legal-title/route.ts` and `apps/web/src/app/api/projects/[id]/legal-title/[analysisId]/route.ts`, plus client in `apps/web/src/lib/legal/title-client.ts`; Verify: `pnpm test:web`
- [x] T033 [US3] Implement `title-case-panel.tsx` and `title-chain-timeline.tsx` (states, summary, timeline with evidence popovers) in `apps/web/src/components/projects/legal/`; Verify: `pnpm test:web`
- [x] T034 [US3] Implement `title-narrative-editor.tsx` (generated vs edited, diff toggle, reason dialog) in `apps/web/src/components/projects/legal/title-narrative-editor.tsx`; Verify: `pnpm test:web`
- [x] T035 [US3] Mount the title panel in `apps/web/src/components/projects/detail/legal-control-center.tsx` and add manual-entry mode banner for `llm_disabled`; Verify: `pnpm test:web`

**Checkpoint**: Full review/approve loop usable from the UI.

---

## Phase 6: User Story 4 - Alertas legales y cruces (Priority: P2)

**Goal**: Typed alerts with evidence, resolution flow and approval blocking.

**Independent Test**: Teno corpus yields `dl_3516`, `derechos_aguas`,
`vigente_en_el_resto`, `multi_inmueble`; pending alerts block approval.

### Tests for User Story 4

- [x] T036 [P] [US4] Add alert extraction/resolution tests (taxonomy, evidence, approval blocking, SII rol cross-check ok/conflict) in `apps/api/tests/test_titulo_analysis.py` and `apps/api/tests/test_titulo_endpoints.py`; Verify: `pnpm test:api`

### Implementation for User Story 4

- [x] T037 [US4] Implement alert extraction in the LLM steps and alert persistence with resolution states in `apps/api/services/legal_title_llm.py` and `apps/api/services/legal_title_analysis.py`; Verify: `pnpm test:api`
- [x] T038 [US4] Implement `POST /legal-titles/{analysis_id}/alerts/{alert_index}/resolve` with audit (`title_alert_resolved`) in `apps/api/api/v1/endpoints/legal_titles.py`; Verify: `pnpm test:api`
- [x] T039 [US4] Implement `title-alerts-list.tsx` with resolve actions and approval-blocking display in `apps/web/src/components/projects/legal/title-alerts-list.tsx`; Verify: `pnpm test:web`

**Checkpoint**: Alerts actionable end to end.

---

## Phase 7: User Story 5 - Readiness y snapshot (Priority: P3)

**Goal**: Approved title feeds `title_verified`, seller variables and
escritura case snapshots for SDD 008.

**Independent Test**: Approved case -> sold-lot snapshot contains `titulo`
domain values; unapproved -> gate blocked with specific cause.

### Tests for User Story 5

- [x] T040 [P] [US5] Add readiness/snapshot tests (gate causes matrix, snapshot domain-values-only contract, supersede re-blocks) in `apps/api/tests/test_titulo_readiness.py`; Verify: `pnpm test:api`

### Implementation for User Story 5

- [x] T041 [US5] Rework `title_verified` gate evaluation (approved analysis + approved variables + blocking causes) in `apps/api/services/escritura_readiness.py`; Verify: `pnpm test:api`
- [x] T042 [US5] Include approved `titulo` domain values in `escritura_cases.variable_snapshot`/`evidence_snapshot` builders in `apps/api/services/escritura_readiness.py`; Verify: `pnpm test:api`
- [x] T043 [US5] Surface new `title_verified` blocking causes with deep links in `apps/web/src/components/projects/legal/escritura-readiness-panel.tsx`; Verify: `pnpm test:web`

**Checkpoint**: SDD 008 consumable contract complete.

---

## Phase 8: Polish, Production and Handoff

- [x] T044 [P] Add env-gated live evaluation script for the Teno corpus with field-level accuracy report in `apps/api/scripts/titulo_live_eval.py`; Verify: `pnpm test:api`
- [x] T045 [P] Regenerate API contracts and web client types in `packages/contracts/openapi/plotify-chat.v1.json` and `apps/web/src/lib/services/plotify-chat.generated.ts`; Verify: `pnpm contracts:generate && pnpm typecheck:web`
- [x] T046 Add tenant regression and feature-flag rollout tests (flag off => llm_disabled, no cross-org reads) in `apps/api/tests/test_titulo_endpoints.py`; Verify: `pnpm test:api`
- [x] T047 [P] Write operational runbook section (enable flag, retry failed runs, supersede behavior, cost observability) in `specs/009-titulo-dominio-vigente/quickstart.md`; Verify: `pnpm format:check`
- [x] T048 [P] Add Obsidian implementation note in `plotify_memori/50 - Implementaciones/SDD 009 Titulo Dominio Vigente.md` linking corpus, decisions and status; Verify: `pnpm format:check`
- [x] T049 [P] Write SDD 008 handoff addendum (titulo tokens, block tokens, alert-driven clause rules) in `specs/009-titulo-dominio-vigente/handoff-sdd-008-addendum.md`; Verify: `pnpm format:check`
- [x] T050 Run full quality gates and fix fallout: `pnpm verify:migrations && pnpm test:api && pnpm test:web && pnpm typecheck:web && pnpm format:check && pnpm build:web`; Verify: command sequence passes

## Phase 9: Correccion producto - Cardinalidad multi-documento

**Purpose**: Manual testing (2026-06-10) found that SDD 007 ingestion
supersedes by `document_type` and the project documents tab models one slot
per type, so a second dominio vigente can never coexist with the first —
breaking FR-001 (analyze **all active** title documents). See spec.md
"Correccion producto 2026-06-10" (FR-031..FR-034) and the data-model addendum.

- [x] T051 Document the correction: FR-031..FR-034 in `specs/009-titulo-dominio-vigente/spec.md`, cardinality/`replaces_legal_document_id` rules in `specs/009-titulo-dominio-vigente/data-model.md`; Verify: `pnpm format:check`
- [x] T052 Add `MULTI_ACTIVE_LEGAL_DOCUMENT_TYPES` cardinality to `apps/api/services/legal_variable_catalog.py` and mirror it in `apps/web/src/lib/legal/variable-resolution-types.ts`; Verify: `pnpm test:api && pnpm typecheck:web`
- [x] T053 Add optional `replaces_legal_document_id` to `LegalDocumentRegisterRequest`/registration input in `apps/api/schemas/legal_variables.py` and implement cardinality-aware supersede (multi: add or replace-target-only with scope validation; single: supersede-all, param rejected) in `apps/api/services/legal_document_ingestion.py`; Verify: `pnpm test:api`
- [x] T054 Add ingestion cardinality tests (multi add keeps both active, replace supersedes only target, cross-scope target rejected, single keeps supersede-all, title analysis superseded on add and replace) in `apps/api/tests/test_escrituras_ingestion.py`; Verify: `pnpm test:api`
- [x] T055 Regenerate API contracts and web client types; Verify: `pnpm contracts:generate && pnpm typecheck:web`
- [x] T056 Pass `replaces_legal_document_id` through the web upload pipeline: `apps/web/src/lib/legal/variable-resolution-types.ts`, `apps/web/src/lib/services/projects.service.ts`, `apps/web/src/app/api/uploads/project-files/route.ts` (formData `replacesLegalDocumentId`, allow `doc_personeria` without a projects column); Verify: `pnpm test:web && pnpm typecheck:web`
- [x] T057 Rework `apps/web/src/components/projects/detail/documents-tab.tsx`: multi-active types render the active `legal_documents` list with per-document view/download/replace and an always-visible add button, plus a Personeria row; single-active types keep the current slot UX; Verify: `pnpm test:web`
- [x] T058 Run full quality gates and fix fallout: `pnpm verify:migrations && pnpm test:api && pnpm test:web && pnpm typecheck:web && pnpm format:check && pnpm build:web`; Verify: command sequence passes
- [x] T063 Harden `TitleAnalysis.structure_type` against model noise: invalid values (e.g. leaked step names like `identity_alerts`) coerce to None so the DB check constraint never aborts a completed run and the merge keeps the classify-step value, in `apps/api/schemas/legal_titles.py`; regression tests in `apps/api/tests/test_titulo_analysis.py`; Verify: `pnpm test:api`
- [x] T062 Harden the LLM contract against model noise: `TitleAlert.resolution` coerces invalid values to `pending` instead of failing the whole run (lawyer transitions still validate via `TitleAlertResolveRequest`) in `apps/api/schemas/legal_titles.py`, and `_get_llm_client` omits `temperature` for the GPT-5 family (which rejects it) in `apps/api/services/legal_title_llm.py`; live smoke-tested with `gpt-5.5`; Verify: `pnpm test:api`
- [x] T061 Align `check_idempotency` with the partial unique index: `superseded` rows (which can share the next run's hash after rollout/archive/interrupted reanalyze) no longer satisfy idempotency, so reanalyze queues a real run, in `apps/api/services/legal_title_analysis.py`; regression test in `apps/api/tests/test_titulo_endpoints.py`; plus source-document breakdown in the `not_started` panel message; Verify: `pnpm test:api && pnpm test:web`
- [x] T060 Model the `not_started` title-case state: `get_project_title_case` returns it when active title documents exist without a current analysis (instead of 404), panel renders it with an "Analizar título" CTA in `apps/api/services/legal_title_analysis.py`, `apps/web/src/lib/legal/title-types.ts`, `apps/web/src/components/projects/legal/title-case-panel.tsx`; includes partial-unique idempotency index migration `20260610000200_title_idempotency_partial_idx.sql`; Verify: `pnpm test:api && pnpm test:web && pnpm typecheck:web`
- [x] T059 Allow deleting any legal document: archive service + `POST /legal-documents/{id}/archive` (marks `superseded`, supersedes title analyses and recommends reanalysis for title types) in `apps/api/services/legal_document_ingestion.py` + `apps/api/api/v1/endpoints/legal_variables.py`, web `DELETE` proxy in `apps/web/src/app/api/projects/[id]/legal-documents/route.ts`, and delete buttons on every document row in `apps/web/src/components/projects/detail/documents-tab.tsx`; Verify: `pnpm test:api && pnpm test:web && pnpm typecheck:web`

## Dependencies

- Phase 1 -> Phase 2 -> (Phases 3-4 sequential: US2 depends on US1 outputs).
- Phase 5 depends on Phase 4 (staged data to review).
- Phase 6 depends on Phase 3 (analysis persistence) and touches Phase 5 UI.
- Phase 7 depends on Phases 4-5 (approved variables exist).
- Phase 8 after Phases 1-7; Phase 9 (product correction) last.
