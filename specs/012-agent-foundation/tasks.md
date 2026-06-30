# Tasks: Fundacion Operativa del Agente Plotify

**Input**: Design documents from `/specs/012-agent-foundation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required by the feature success criteria and constitution for Telegram, tenant isolation, contracts, migrations, and web/admin surfaces.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the feature lane and test targets without changing behavior.

- [x] T001 Confirm `012-agent-foundation` context in `/Users/matiasignacio/Developer/plotify/.specify/feature.json` and `/Users/matiasignacio/Developer/plotify/AGENTS.md`
- [x] T002 [P] Add SDD 012 API test module skeleton in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_agent_foundation.py`
- [x] T003 [P] Add SDD 012 web action test module skeleton in `/Users/matiasignacio/Developer/plotify/apps/web/tests/agent-foundation-skills.action.test.ts`
- [x] T004 [P] Add SDD 012 web component test module skeleton in `/Users/matiasignacio/Developer/plotify/apps/web/tests/agent-foundation-skills.components.test.tsx`

**Verify**: `codegraph sync .`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data, schemas, validation, and trusted runtime plumbing required before any user story.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Create additive Supabase migration for `agent_skills` scope/markdown/version fields and `agent_skill_versions` in `/Users/matiasignacio/Developer/plotify/packages/database/supabase/migrations/20260622000100_agent_foundation.sql`
- [x] T006 [P] Add migration assertions for SDD 012 schema shape in `/Users/matiasignacio/Developer/plotify/apps/web/tests/fase4-seed-migration.test.ts`
- [x] T007 Add Pydantic schemas for skill validation, custom skill save, and skill version responses in `/Users/matiasignacio/Developer/plotify/apps/api/schemas/agent_skills.py`
- [x] T008 Add shared skill definition validation service for markdown, approved tools, role compatibility, and blocked instructions in `/Users/matiasignacio/Developer/plotify/apps/api/services/agent_skill_validation.py`
- [x] T009 Extend skill registry resolution to include scoped custom skills, validation status, approved tool slugs, MCP gating, and cache payload metadata in `/Users/matiasignacio/Developer/plotify/apps/api/agent/skill_registry.py`
- [x] T010 Add trusted runtime context helpers for organization, role, profile, vendor, and allowed tool slugs in `/Users/matiasignacio/Developer/plotify/apps/api/agent/runtime_context.py`
- [x] T011 Refactor LangGraph construction to pass trusted runtime context into tool execution and markdown skill instructions in `/Users/matiasignacio/Developer/plotify/apps/api/agent/graph.py`
- [x] T012 Add skill registry and trusted context tests covering custom skill scope, role filters, and no cross-tenant exposure in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_agent_foundation.py`
- [x] T013 Run migration verification for SDD 012 schema changes in `/Users/matiasignacio/Developer/plotify/packages/database/supabase/migrations/20260622000100_agent_foundation.sql`

**Verify**: `pnpm verify:migrations` and `pnpm test:api`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Vendedor Opera Por Telegram Con Permisos Correctos (Priority: P1) MVP

**Goal**: A linked seller can query assigned lot availability and request a reservation from Telegram without seeing other tenants or auto-approving the operation.

**Independent Test**: With a linked seller assigned to a project, send `/lotes` and `/reserva`; verify assigned lots only, `approval_requests.status='pending'`, admin notification enqueued, and denied cases reveal no commercial data.

### Tests for User Story 1

- [x] T014 [P] [US1] Add Telegram webhook `secret_token` registration and rejection tests in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_agent_foundation.py`
- [x] T015 [P] [US1] Add seller Telegram isolation tests for linked, unlinked, inactive, unassigned, foreign project, and unavailable lot cases in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_mvp_vendor_telegram.py`
- [x] T016 [P] [US1] Add reservation pending-status and no-auto-approval tests for Telegram seller operations in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_mvp_vendor_telegram.py`

### Implementation for User Story 1

- [x] T017 [US1] Extend bot registration to send Telegram `secret_token` when configured in `/Users/matiasignacio/Developer/plotify/apps/api/api/v1/endpoints/bots.py`
- [x] T018 [US1] Harden Telegram webhook unauthorized logging and payload handling for missing/invalid secret token in `/Users/matiasignacio/Developer/plotify/apps/api/api/v1/endpoints/webhook.py`
- [x] T019 [US1] Tighten linked seller resolution to prefer `profiles.telegram_chat_id`, active vendor, membership, and assigned projects before fallback in `/Users/matiasignacio/Developer/plotify/apps/api/workers/tasks/message_processor.py`
- [x] T020 [US1] Validate `/reserva` Telegram payload fields before creating `ReservationPayload` and return operational errors for incomplete or invalid values in `/Users/matiasignacio/Developer/plotify/apps/api/workers/tasks/message_processor.py`
- [x] T021 [US1] Add audit logging for Telegram availability, reservation requested, denied, and failed operations in `/Users/matiasignacio/Developer/plotify/apps/api/workers/tasks/message_processor.py`
- [x] T022 [US1] Ensure Telegram seller reservation path always uses centralized `request_reservation` and leaves `approval_requests.status` pending in `/Users/matiasignacio/Developer/plotify/apps/api/workers/tasks/message_processor.py`
- [x] T023 [US1] Update seller Telegram user-facing copy for success, unassigned, invalid lot, and invalid reservation format in `/Users/matiasignacio/Developer/plotify/apps/api/workers/tasks/message_processor.py`

**Verify**: `pnpm test:api`

**Checkpoint**: US1 is independently functional and demoable through Telegram.

---

## Phase 4: User Story 2 - Administrador Controla Skills Por Organizacion (Priority: P1)

**Goal**: An admin can enable/disable organization skills and the next agent message uses the updated runtime skill set without opaque cache delay.

**Independent Test**: Enable a seller skill, send a seller message and verify availability; disable it, send another message and verify it is no longer available, with no effect on another organization.

### Tests for User Story 2

- [x] T024 [P] [US2] Add web action tests asserting `toggleOrgSkill` calls `/api/v1/skills/invalidate-cache` and handles invalidation failure in `/Users/matiasignacio/Developer/plotify/apps/web/tests/agent-foundation-skills.action.test.ts`
- [x] T025 [P] [US2] Add API cache invalidation tests for all agent roles in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_agent_foundation.py`
- [x] T026 [P] [US2] Add web component tests for system skill disabled toggle, custom/MCP badges, and optimistic rollback in `/Users/matiasignacio/Developer/plotify/apps/web/tests/agent-foundation-skills.components.test.tsx`

### Implementation for User Story 2

- [x] T027 [US2] Add microservice invalidation call after successful skill toggle in `/Users/matiasignacio/Developer/plotify/apps/web/src/actions/agent-skills.action.ts`
- [x] T028 [US2] Return invalidation errors from skill toggle without reporting success in `/Users/matiasignacio/Developer/plotify/apps/web/src/actions/agent-skills.action.ts`
- [x] T029 [US2] Extend skill listing to include scoped custom skills, current version, validation status, approved tools, and MCP requirement state in `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/services/agent-skills.service.ts`
- [x] T030 [US2] Update skill grid data-testids, badges, disabled states, and invalidation error handling in `/Users/matiasignacio/Developer/plotify/apps/web/src/components/dashboard/skills/skills-grid.tsx`
- [x] T031 [US2] Update skill detail modal to show version, validation status, approved tools, and MCP requirement state in `/Users/matiasignacio/Developer/plotify/apps/web/src/components/dashboard/skills/skill-detail-modal.tsx`
- [x] T032 [US2] Add or extend route wiring so `/agente/skills` can render scoped custom skill metadata in `/Users/matiasignacio/Developer/plotify/apps/web/src/app/(dashboard)/agente/skills/page.tsx`

**Verify**: `pnpm test:api`, `pnpm test:web`, and `pnpm typecheck:web`

**Checkpoint**: US2 is independently functional from the admin skills page.

---

## Phase 5: User Story 3 - Skills Personalizadas En Markdown Usan Tools Aprobadas (Priority: P2)

**Goal**: An admin can create and version a custom markdown skill scoped to their organization, using only approved tools and role-compatible permissions.

**Independent Test**: Create a custom seller skill with an approved lot tool, publish it, activate it, verify runtime scope; edit markdown and verify previous version remains traceable.

### Tests for User Story 3

- [x] T033 [P] [US3] Add API validation tests for valid markdown, empty markdown, unapproved tool, incompatible role, permission bypass, and MCP without connection in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_agent_foundation.py`
- [x] T034 [P] [US3] Add web action tests for creating, validating, publishing, and versioning custom skills in `/Users/matiasignacio/Developer/plotify/apps/web/tests/agent-foundation-skills.action.test.ts`
- [x] T035 [P] [US3] Add component tests for markdown editor, approved tools picker, and validation panel in `/Users/matiasignacio/Developer/plotify/apps/web/tests/agent-foundation-skills.components.test.tsx`

### Implementation for User Story 3

- [x] T036 [US3] Add internal skill definition validation endpoint `/api/v1/skills/validate-definition` in `/Users/matiasignacio/Developer/plotify/apps/api/api/v1/endpoints/skills.py`
- [x] T037 [US3] Add custom skill create/update/publish endpoint handlers using `agent_skill_versions` in `/Users/matiasignacio/Developer/plotify/apps/api/api/v1/endpoints/skills.py`
- [x] T038 [US3] Add DB write helpers for custom skill versioning and audit actions in `/Users/matiasignacio/Developer/plotify/apps/api/services/agent_skill_validation.py`
- [x] T039 [US3] Add Pydantic request/response models for custom skill save, publish, validation errors, and version metadata in `/Users/matiasignacio/Developer/plotify/apps/api/schemas/agent_skills.py`
- [x] T040 [US3] Add `createCustomSkill`, `validateCustomSkill`, and `publishCustomSkill` server actions in `/Users/matiasignacio/Developer/plotify/apps/web/src/actions/agent-skills.action.ts`
- [x] T041 [P] [US3] Create custom skill editor component with markdown, metadata, roles, and save/publish actions in `/Users/matiasignacio/Developer/plotify/apps/web/src/components/dashboard/skills/custom-skill-editor.tsx`
- [x] T042 [P] [US3] Create approved tools picker component filtered by role-compatible tools in `/Users/matiasignacio/Developer/plotify/apps/web/src/components/dashboard/skills/approved-tools-picker.tsx`
- [x] T043 [P] [US3] Create skill validation panel component for blocked reasons and warnings in `/Users/matiasignacio/Developer/plotify/apps/web/src/components/dashboard/skills/skill-validation-panel.tsx`
- [x] T044 [US3] Integrate custom skill creation flow into the skills page in `/Users/matiasignacio/Developer/plotify/apps/web/src/app/(dashboard)/agente/skills/page.tsx`

**Verify**: `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web`, and `pnpm contracts:generate`

**Checkpoint**: US3 is independently functional for custom markdown skills.

---

## Phase 6: User Story 4 - Agente Asistido Con Acciones Sensibles Bajo Reglas (Priority: P2)

**Goal**: The agent may initiate or propose sensitive operations, but reservations, approvals, document delivery, and state changes are deterministic, confirmed, and audited.

**Independent Test**: Ask the agent to perform a sensitive seller action and verify it creates a request or requires confirmation, never invents success, and audit logs actor/rule/decision.

### Tests for User Story 4

- [x] T045 [P] [US4] Add sensitive tool execution tests proving model-provided tenant/vendor arguments are ignored in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_agent_foundation.py`
- [x] T046 [P] [US4] Add audit tests for sensitive agent operations and failed business-rule responses in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_agent_foundation.py`

### Implementation for User Story 4

- [x] T047 [US4] Wrap sensitive agent tools with trusted runtime context and deterministic rule checks in `/Users/matiasignacio/Developer/plotify/apps/api/agent/runtime_context.py`
- [x] T048 [US4] Update lot and reservation tools to consume trusted context instead of LLM-controlled `organization_id` where applicable in `/Users/matiasignacio/Developer/plotify/apps/api/agent/tools/lot_search.py`
- [x] T049 [US4] Update reservation requirement and reservation-intent tool behavior to return pending/blocked outcomes only in `/Users/matiasignacio/Developer/plotify/apps/api/agent/tools/reservations.py`
- [x] T050 [US4] Add structured audit calls for allowed, denied, and failed sensitive tool executions in `/Users/matiasignacio/Developer/plotify/apps/api/agent/runtime_context.py`
- [x] T051 [US4] Update graph prompt assembly to include active markdown skill instructions without exposing secrets or raw DB payloads in `/Users/matiasignacio/Developer/plotify/apps/api/agent/graph.py`

**Verify**: `pnpm test:api`

**Checkpoint**: US4 proves assisted autonomy without model-owned state changes.

---

## Phase 7: User Story 5 - Base Preparada Para MCP Aprobado Futuro (Priority: P3)

**Goal**: Skills can declare future integration dependencies, and the system blocks execution unless the organization has an approved active connection.

**Independent Test**: Register a skill requiring an external provider, verify it is shown as requiring configuration and is not executable without active organization connection.

### Tests for User Story 5

- [x] T052 [P] [US5] Add MCP dependency gating tests for missing, revoked, and active connections in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_agent_foundation.py`
- [x] T053 [P] [US5] Add web tests for MCP pending badge and integration requirement copy in `/Users/matiasignacio/Developer/plotify/apps/web/tests/agent-foundation-skills.components.test.tsx`

### Implementation for User Story 5

- [x] T054 [US5] Add MCP connection status lookup to skill registry execution gating in `/Users/matiasignacio/Developer/plotify/apps/api/agent/skill_registry.py`
- [x] T055 [US5] Reduce MCP gateway timeout to the constitutional maximum and validate custom server URL host/scheme before execution in `/Users/matiasignacio/Developer/plotify/apps/api/integrations/mcp_gateway.py`
- [x] T056 [US5] Surface MCP blocked/ready state in skill service results in `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/services/agent-skills.service.ts`
- [x] T057 [US5] Add MCP requirement CTA and blocked state rendering in `/Users/matiasignacio/Developer/plotify/apps/web/src/components/dashboard/skills/skill-detail-modal.tsx`

**Verify**: `pnpm test:api`, `pnpm test:web`, and `pnpm typecheck:web`

**Checkpoint**: US5 is independently testable without enabling arbitrary MCP actions.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, contracts, generated types, and documentation consistency.

- [x] T058 [P] Regenerate OpenAPI and generated web client after FastAPI schema changes in `/Users/matiasignacio/Developer/plotify/packages/contracts/openapi/plotify-chat.v1.json`
- [x] T059 [P] Regenerate Supabase database types after migration changes in `/Users/matiasignacio/Developer/plotify/apps/web/src/types/database.types.ts`
- [x] T060 [P] Add SDD 012 quickstart validation notes after manual Telegram/custom skill pass in `/Users/matiasignacio/Developer/plotify/specs/012-agent-foundation/quickstart.md`
- [x] T061 Run full API regression gate for SDD 012 changes in `/Users/matiasignacio/Developer/plotify/apps/api/tests/test_agent_foundation.py`
- [x] T062 Run full web quality gate for SDD 012 UI changes in `/Users/matiasignacio/Developer/plotify/apps/web/tests/agent-foundation-skills.components.test.tsx`
- [x] T063 Run Spec Kit analyze and resolve any critical/high findings in `/Users/matiasignacio/Developer/plotify/specs/012-agent-foundation/tasks.md`

**Verify**: `pnpm verify:migrations`, `pnpm contracts:generate`, `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web`, `pnpm --filter web lint`, `pnpm format:check`, `pnpm build:web`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks all stories.
- **US1 (Phase 3)**: Depends on Foundational. This is the MVP.
- **US2 (Phase 4)**: Depends on Foundational; can run parallel with US1 after Phase 2, but is most useful once runtime tests exist.
- **US3 (Phase 5)**: Depends on Foundational and benefits from US2 UI/action patterns.
- **US4 (Phase 6)**: Depends on Foundational and should be validated after US1 reservation behavior.
- **US5 (Phase 7)**: Depends on Foundational and can run after US2/US3 surfaces exist.
- **Polish (Phase 8)**: Depends on all desired user stories.

### User Story Dependencies

- **US1 (P1)**: No dependency on other user stories after Phase 2.
- **US2 (P1)**: No dependency on other user stories after Phase 2.
- **US3 (P2)**: Depends on US2 patterns for admin skills UI and actions.
- **US4 (P2)**: Depends on US1 for concrete reservation-sensitive operation coverage.
- **US5 (P3)**: Depends on US2/US3 display and validation primitives.

### Within Each User Story

- Tests should be written first and fail before implementation.
- Data/schema before services.
- Services before endpoints/actions.
- Endpoints/actions before UI integration.
- Story complete before moving to the next priority unless explicitly parallelized.

## Parallel Opportunities

- T002, T003, T004 can run in parallel.
- T006, T007, T008 can start in parallel after T005 shape is known, but T009-T011 depend on their contracts.
- T014, T015, T016 can run in parallel for US1 tests.
- T024, T025, T026 can run in parallel for US2 tests.
- T033, T034, T035 can run in parallel for US3 tests.
- T041, T042, T043 can run in parallel after US3 actions/contracts exist.
- T045 and T046 can run in parallel for US4 tests.
- T052 and T053 can run in parallel for US5 tests.
- T058, T059, T060 can run in parallel in Polish.

## Parallel Example: User Story 1

```bash
# API-focused tests can be authored together:
Task: "T014 [US1] Add Telegram webhook secret_token registration and rejection tests"
Task: "T015 [US1] Add seller Telegram isolation tests"
Task: "T016 [US1] Add reservation pending-status and no-auto-approval tests"
```

## Parallel Example: User Story 3

```bash
# UI components can be authored independently after actions/contracts exist:
Task: "T041 [US3] Create custom-skill-editor.tsx"
Task: "T042 [US3] Create approved-tools-picker.tsx"
Task: "T043 [US3] Create skill-validation-panel.tsx"
```

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1).
3. Stop and validate Telegram seller journey from [quickstart.md](./quickstart.md).
4. Run `pnpm test:api`.

### Incremental Delivery

1. Foundation: schema, trusted runtime context, validation primitives.
2. US1: Telegram seller E2E.
3. US2: admin skill runtime control.
4. US3: custom markdown skills with versioning.
5. US4: sensitive action governance.
6. US5: MCP dependency readiness.
7. Polish gates and Spec Kit analyze.

### Quality Gates

- API or worker changes: `pnpm test:api`.
- Web changes: `pnpm test:web`, `pnpm typecheck:web`, `pnpm --filter web lint`, `pnpm build:web`.
- Migration changes: `pnpm verify:migrations`.
- Contract/schema changes: `pnpm contracts:generate` and `pnpm typecheck:web`.
- Before implementation: run `$speckit-analyze` after tasks are generated and resolve critical findings.
