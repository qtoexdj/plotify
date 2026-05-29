# Tasks: Notification Center Hardening

**Input**: Design documents from `/specs/002-notification-center-hardening/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included because the feature touches approval decisions, tenant security, Telegram, database state, and production web UI.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently after the foundational phase.

## Phase 1: Setup (Shared Context)

**Purpose**: Lock implementation context before code work starts.

- [ ] T001 Review feature scope in specs/002-notification-center-hardening/spec.md; Acceptance: implementer can state admin/vendor notification, Telegram command, and production-hardening boundaries; Verify: `test -f specs/002-notification-center-hardening/spec.md`
- [ ] T002 [P] Review technical approach in specs/002-notification-center-hardening/plan.md; Acceptance: implementation uses existing monorepo boundaries and canonical gates; Verify: `test -f specs/002-notification-center-hardening/plan.md`
- [ ] T003 [P] Review contracts in specs/002-notification-center-hardening/contracts/notification-contracts.md and specs/002-notification-center-hardening/contracts/telegram-command-contracts.md; Acceptance: API and Telegram behavior is understood before editing source; Verify: `test -d specs/002-notification-center-hardening/contracts`
- [ ] T004 [P] Inspect current approval and Telegram flow with CodeGraph for apps/web/src/app/(dashboard)/layout.tsx and apps/api/api/v1/endpoints/webhook.py; Acceptance: impact areas are identified before edits; Verify: `codegraph sync .`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schema, contracts, fixtures, and service boundaries needed before user stories.

**CRITICAL**: No user story work starts until this phase is complete.

- [ ] T005 Add notification event migration tests or assertions for packages/database/supabase/migrations; Acceptance: recipient/read/delivery metadata can be persisted without duplicating approval state; Verify: `pnpm verify:migrations`
- [ ] T006 Create notification events migration in packages/database/supabase/migrations/20260529000100_notification_center_hardening.sql; Acceptance: notification records reference approval requests, organization, recipient user, role, read/dismiss timestamps, delivery channel/status, and failure reason; Verify: `pnpm verify:migrations`
- [ ] T007 Regenerate database types in packages/database/types/database.generated.ts; Acceptance: web code can reference new notification metadata types; Verify: `pnpm typecheck:web`
- [ ] T008 [P] Add API notification schemas in apps/api/schemas/notification.py; Acceptance: notification list, counts, mark-read, and command-summary models are typed from FastAPI source; Verify: `pnpm test:api`
- [ ] T009 Add notification endpoint skeleton in apps/api/api/v1/endpoints/notifications.py; Acceptance: role-scoped notification routes exist behind internal auth and do not return unfiltered data; Verify: `pnpm contracts:generate`
- [ ] T010 Register notification routes in apps/api/api/v1/router.py; Acceptance: generated OpenAPI includes notification operations; Verify: `pnpm contracts:generate`
- [ ] T011 Regenerate API contract and web client outputs in packages/contracts/openapi/plotify-chat.v1.json and apps/web/src/lib/services/plotify-chat.generated.ts; Acceptance: generated contract contains notification operations only from FastAPI source; Verify: `pnpm contracts:generate`
- [ ] T012 [P] Add shared role/tenant fixtures for notification tests in apps/api/tests/conftest.py and apps/web/tests/mvp-fixtures.test.ts; Acceptance: tests can model two organizations, admin, vendor, linked Telegram users, and cross-tenant attempts; Verify: `pnpm test:api && pnpm test:web`

**Checkpoint**: Foundation ready. User story implementation can start after T005-T012.

---

## Phase 3: User Story 1 - Header Notification Center (Priority: P1)

**Goal**: Admins and vendors can open a header notification icon and see role-scoped approval notifications.

**Independent Test**: Create pending reservation/sale approvals, sign in as admin and vendor, and verify header count/list differs correctly by role.

### Tests for User Story 1

- [ ] T013 [P] [US1] Add header notification list tests in apps/web/tests/mvp-notifications.test.ts; Acceptance: admin sees organization pending items, vendor sees own items, empty state renders when none exist; Verify: `pnpm test:web`
- [ ] T014 [P] [US1] Add notification dropdown responsive coverage in apps/web/tests/mvp-responsive.test.ts; Acceptance: icon, count, list, empty, loading, and overflow states remain usable on mobile and desktop; Verify: `pnpm test:web`

### Implementation for User Story 1

- [ ] T015 [US1] Implement role-scoped notification service in apps/web/src/lib/services/notifications.service.ts; Acceptance: service consumes generated notification contract and returns counts/items without client-side role filtering; Verify: `pnpm typecheck:web`
- [ ] T016 [P] [US1] Create notification item component in apps/web/src/components/notifications/notification-item.tsx; Acceptance: item displays request type, status, project, lot, client, vendor, and time with accessible status labels; Verify: `pnpm test:web`
- [ ] T017 [P] [US1] Create notification list component in apps/web/src/components/notifications/notification-list.tsx; Acceptance: list handles loading, empty, error, overflow, and role-specific action slots; Verify: `pnpm test:web`
- [ ] T018 [US1] Create header notification bell in apps/web/src/components/notifications/notification-bell.tsx; Acceptance: icon shows pending/unread count and opens the list without layout shift; Verify: `pnpm test:web`
- [ ] T019 [US1] Integrate notification bell into apps/web/src/app/(dashboard)/layout.tsx; Acceptance: authenticated non-super-admin users see the icon beside existing header controls; Verify: `pnpm build:web`

**Checkpoint**: US1 can be validated independently from the header without admin decisions.

---

## Phase 4: User Story 2 - Admin Decision From Notifications (Priority: P1)

**Goal**: Admins approve/reject pending reservation and sale requests from the header list while preserving first-decision-wins behavior.

**Independent Test**: Decide a pending request from the notification list, then attempt an opposite Telegram/web decision and confirm no duplicate mutation.

### Tests for User Story 2

- [ ] T020 [P] [US2] Add API tests for notification-driven decisions in apps/api/tests/test_mvp_notifications.py; Acceptance: admin decision succeeds, non-admin fails, already-processed result is returned after a competing channel wins; Verify: `pnpm test:api`
- [ ] T021 [P] [US2] Add web tests for admin notification actions in apps/web/tests/mvp-notifications.test.ts; Acceptance: approve/reject controls update count/list and surface already-processed state; Verify: `pnpm test:web`

### Implementation for User Story 2

- [ ] T022 [US2] Add notification decision service wrapper in apps/web/src/lib/services/notifications.service.ts; Acceptance: approve/reject calls reuse the generated approval decision contract and typed errors; Verify: `pnpm typecheck:web`
- [ ] T023 [US2] Add admin action controls to apps/web/src/components/notifications/notification-item.tsx; Acceptance: controls appear only when can_decide is true and show loading/error states; Verify: `pnpm test:web`
- [ ] T024 [US2] Refresh notification counts after decisions in apps/web/src/components/notifications/notification-bell.tsx; Acceptance: successful, failed, and already-processed outcomes update the visible list correctly; Verify: `pnpm test:web`
- [ ] T025 [US2] Keep existing dashboard approvals panel consistent in apps/web/src/components/dashboard/approvals/pending-approvals-panel.tsx; Acceptance: panel and header do not disagree after a decision; Verify: `pnpm build:web`

**Checkpoint**: US2 can be validated with web-first and Telegram-first decision races.

---

## Phase 5: User Story 3 - Vendor Request Status Visibility (Priority: P1)

**Goal**: Vendors can see their own pending, approved, and rejected request statuses from header and dashboard context.

**Independent Test**: Submit requests as a vendor, decide them as admin, and verify the vendor sees only their own statuses.

### Tests for User Story 3

- [ ] T026 [P] [US3] Add vendor notification API tests in apps/api/tests/test_mvp_notifications.py; Acceptance: vendor sees own pending/approved/rejected requests and no other vendor or organization data; Verify: `pnpm test:api`
- [ ] T027 [P] [US3] Add vendor web status tests in apps/web/tests/mvp-notifications.test.ts; Acceptance: vendor header and dashboard status surfaces show pending, approved, and rejected states without admin controls; Verify: `pnpm test:web`

### Implementation for User Story 3

- [ ] T028 [US3] Implement vendor-scoped notification read model in apps/api/api/v1/endpoints/notifications.py; Acceptance: vendor identity is resolved from authenticated profile/vendor membership, not from free-form request data; Verify: `pnpm test:api`
- [ ] T029 [US3] Add vendor status section to apps/web/src/app/(dashboard)/dashboard/page.tsx; Acceptance: vendor dashboard shows recent request statuses while admin dashboard keeps approval-focused view; Verify: `pnpm build:web`
- [ ] T030 [US3] Add vendor-safe status copy in apps/web/src/components/notifications/notification-item.tsx; Acceptance: rejected outcomes do not imply lot reservation/sale success and avoid admin-only wording; Verify: `pnpm test:web`
- [ ] T031 [US3] Mark notification read state from apps/web/src/components/notifications/notification-list.tsx; Acceptance: a vendor opening the list can mark relevant notification events read without mutating approval state; Verify: `pnpm typecheck:web`

**Checkpoint**: US3 can be validated with a vendor-only login and no admin permissions.

---

## Phase 6: User Story 5 - Production Security And Auditability (Priority: P1)

**Goal**: Notification and Telegram approval actions enforce tenant/role security and produce auditable operational events.

**Independent Test**: Attempt cross-tenant reads, non-admin Telegram callbacks, stale buttons, and failed deliveries; verify no unauthorized mutation and audit visibility.

### Tests for User Story 5

- [ ] T032 [P] [US5] Add Telegram callback authorization tests in apps/api/tests/test_notifications_fase7.py; Acceptance: linked non-admin and cross-tenant callback attempts cannot approve/reject requests; Verify: `pnpm test:api`
- [ ] T033 [P] [US5] Add webhook authenticity tests in apps/api/tests/test_mvp_notifications.py; Acceptance: invalid Telegram webhook authenticity checks do not enqueue commands or decisions; Verify: `pnpm test:api`
- [ ] T034 [P] [US5] Add recipient resolution and delivery audit tests in apps/api/tests/test_mvp_external_integrations.py; Acceptance: vendor outcomes resolve by linked identity and delivery failures are auditable; Verify: `pnpm test:api`

### Implementation for User Story 5

- [ ] T035 [US5] Add Telegram actor resolution helper in apps/api/workers/tasks/message_processor.py; Acceptance: Telegram chat id resolves to profile, role, organization, vendor id, and authorization state; Verify: `pnpm test:api`
- [ ] T036 [US5] Validate Telegram webhook authenticity in apps/api/api/v1/endpoints/webhook.py; Acceptance: unauthenticated webhook payloads are rejected or ignored before command/decision enqueue; Verify: `pnpm test:api`
- [ ] T037 [US5] Validate admin role before enqueueing callback decisions in apps/api/api/v1/endpoints/webhook.py; Acceptance: only linked organization admins can enqueue approve/reject callbacks; Verify: `pnpm test:api`
- [ ] T038 [US5] Harden vendor outcome recipient lookup in apps/api/workers/tasks/approval_processor.py; Acceptance: vendor Telegram delivery uses linked profile/vendor identity before fallback contact fields; Verify: `pnpm test:api`
- [ ] T039 [US5] Add audit event names and payload shape for notification security in apps/api/utils/audit.py; Acceptance: unauthorized decision attempts and delivery failures include actor, role, org, approval id, and channel; Verify: `pnpm test:api`

**Checkpoint**: US5 must pass before any production rollout or Telegram command expansion.

---

## Phase 7: User Story 4 - Telegram Operations Shortcuts (Priority: P2)

**Goal**: Linked admins and vendors can use `/pendientes`, `/aprobadas`, `/rechazadas`, and `/docs` safely from Telegram.

**Independent Test**: Send each command as linked admin, linked vendor, unlinked user, and cross-tenant user; verify scoped responses.

### Tests for User Story 4

- [ ] T040 [P] [US4] Add Telegram pending/approved/rejected command tests in apps/api/tests/test_mvp_vendor_telegram.py; Acceptance: admin and vendor responses are role-scoped and bounded; Verify: `pnpm test:api`
- [ ] T041 [P] [US4] Add Telegram docs shortcut tests in apps/api/tests/test_mvp_vendor_telegram.py; Acceptance: `/docs` returns approved vendor-facing links and never internal project memory; Verify: `pnpm test:api`

### Implementation for User Story 4

- [ ] T042 [US4] Implement deterministic Telegram command routing in apps/api/workers/tasks/message_processor.py; Acceptance: supported slash commands are handled before LLM routing and unknown commands fall back safely; Verify: `pnpm test:api`
- [ ] T043 [US4] Implement approval list command responses in apps/api/workers/tasks/message_processor.py; Acceptance: `/pendientes`, `/aprobadas`, and `/rechazadas` return concise admin/vendor-scoped summaries; Verify: `pnpm test:api`
- [ ] T044 [US4] Add safe vendor documentation page in apps/web/src/app/(dashboard)/ayuda/vendedor/page.tsx; Acceptance: content gives vendors operational help without exposing internal memory; Verify: `pnpm build:web`
- [ ] T045 [US4] Wire `/docs` response to approved documentation shortcut in apps/api/workers/tasks/message_processor.py; Acceptance: linked vendors receive the help shortcut and unlinked users receive linking guidance; Verify: `pnpm test:api`

**Checkpoint**: US4 can be validated entirely from Telegram plus the safe docs page.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Validate contracts, security, responsiveness, and production readiness after selected stories are complete.

- [ ] T046 [P] Run OpenAPI/client generation for notification APIs in packages/contracts/openapi/plotify-chat.v1.json and apps/web/src/lib/services/plotify-chat.generated.ts; Acceptance: generated diff contains only intended notification contract changes; Verify: `pnpm contracts:generate`
- [ ] T047 [P] Run canonical migration verification for packages/database/supabase/migrations; Acceptance: notification migration is canonical and repeatable; Verify: `pnpm verify:migrations`
- [ ] T048 [P] Run web typecheck and tests for apps/web/src/components/notifications; Acceptance: notification web code is type-safe and test suite passes; Verify: `pnpm typecheck:web && pnpm test:web`
- [ ] T049 Run production web build for apps/web; Acceptance: dashboard header and help page compile for production; Verify: `pnpm build:web`
- [ ] T050 Run API tests for apps/api notification, webhook, approval, and Telegram paths; Acceptance: tenant, callback, command, delivery, and race tests pass; Verify: `pnpm test:api`
- [ ] T051 Validate specs/002-notification-center-hardening/quickstart.md manually or with fixtures; Acceptance: admin/vendor web, Telegram commands, race, and tenant checks match documented expected outcomes; Verify: `pnpm verify:migrations && pnpm contracts:generate && pnpm typecheck:web && pnpm test:web && pnpm build:web && pnpm test:api`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): no dependencies.
- Foundational (Phase 2): depends on Setup and blocks all user stories.
- US1, US2, US3, and US5: depend on Foundation and are P1 production-critical.
- US2 depends on US1 UI components for the header action surface.
- US3 depends on Foundation and can proceed in parallel with US1 after shared notification read model exists, but dashboard integration should follow US1 patterns.
- US5 can start after Foundation and should be completed before production rollout.
- US4 depends on US5 actor/security hardening and Foundation notification read models.
- Final Phase depends on all selected user stories.

### User Story Dependencies

- **US1 Header Notification Center**: first visible slice after Foundation.
- **US2 Admin Decision From Notifications**: builds on US1 notification items and existing approval decision contracts.
- **US3 Vendor Request Status Visibility**: builds on Foundation read models and US1 visual components.
- **US5 Production Security And Auditability**: blocks production release and Telegram expansion.
- **US4 Telegram Operations Shortcuts**: depends on US5 actor resolution and callback hardening.

### Parallel Opportunities

- T002-T004 can run in parallel after T001.
- T008 and T012 can run in parallel while migration work proceeds.
- US1 test tasks T013-T014 can run in parallel.
- US2 test tasks T020-T021 can run in parallel.
- US3 test tasks T026-T027 can run in parallel.
- US5 test tasks T032-T034 can run in parallel.
- US4 test tasks T040-T041 can run in parallel.
- Final verification tasks T046-T048 can run in parallel before build/API final checks.

## Implementation Strategy

1. Complete Setup and Foundational phases.
2. Deliver US1 header notification center first.
3. Add US2 admin actions from the header.
4. Add US3 vendor status visibility.
5. Complete US5 production hardening before Telegram command expansion.
6. Add US4 Telegram shortcuts.
7. Run the final gates and quickstart before marking the feature ready.

Per repository rule, implementation should execute exactly one unchecked task per pass unless explicitly directed otherwise.
