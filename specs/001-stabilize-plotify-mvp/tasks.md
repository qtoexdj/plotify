# Tasks: Stabilize Plotify MVP

**Input**: Design documents from `specs/001-stabilize-plotify-mvp/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Tests**: Included because the constitution and plan require quality gates and tenant/race/document traceability tests.

**MVP scope**: Complete US1, US2, and US3 first. US4 and US5 are P2. US6 is P3 hardening that must not block P1 but must be closed before pilot rollout. Before implementation, close the Phase 2 remediation tasks that align this task list with the constitution analysis.

## Phase 1: Setup (Shared Context)

**Purpose**: Lock the implementation context before code work starts.

- [x] T001 Review MVP scope and out-of-scope rules in specs/001-stabilize-plotify-mvp/spec.md; Acceptance: implementer can state P1/P2/P3 boundaries without adding CAD, WhatsApp-primary, Prompt Ops, e-signature, or autonomous approvals; Verify: `test -f specs/001-stabilize-plotify-mvp/spec.md`
- [x] T002 [P] Review technical constraints and verification gates in specs/001-stabilize-plotify-mvp/plan.md; Acceptance: every later task uses existing monorepo boundaries and canonical commands; Verify: `test -f specs/001-stabilize-plotify-mvp/plan.md`
- [x] T003 [P] Review API deltas in specs/001-stabilize-plotify-mvp/contracts/api-contracts.md; Acceptance: implementation choices preserve existing endpoints and list required OpenAPI changes; Verify: `test -f specs/001-stabilize-plotify-mvp/contracts/api-contracts.md`
- [x] T004 [P] Review DB deltas in specs/001-stabilize-plotify-mvp/contracts/database-contracts.md; Acceptance: all schema work is planned only under packages/database/supabase/migrations; Verify: `pnpm verify:migrations`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared contracts, schema, and traceability needed before user stories can be safely implemented.

- [x] T005 Create active project template migration in packages/database/supabase/migrations/20260525000100_mvp_project_templates_documents.sql; Acceptance: one active template per project and document type can be enforced while preserving organization defaults; Verify: `pnpm verify:migrations`
- [x] T006 Create generated document versioning migration in packages/database/supabase/migrations/20260525000100_mvp_project_templates_documents.sql; Acceptance: generated_documents can store immutable version number and missing-variable acceptance metadata; Verify: `pnpm verify:migrations`
- [x] T007 [P] Standardize audit event names in apps/api/utils/audit.py; Acceptance: reservation, sale, document, lot verification, and template events have stable action strings and payload keys; Verify: `pnpm test:api`
- [x] T008 [P] Add web audit event mapping in apps/web/src/lib/services/audit.service.ts; Acceptance: frontend timeline queries can rely on the same event names as the backend; Verify: `pnpm typecheck:web`
- [x] T009 Define canonical DocumentVariables v1 and variable status schemas in FastAPI source schemas or response models, not by hand-editing packages/contracts/openapi/plotify-chat.v1.json; Acceptance: nested groups and available/missing/source arrays are represented in generated OpenAPI after generation; Verify: `pnpm contracts:generate`
- [x] T010 Regenerate Supabase generated types in packages/database/types/database.generated.ts; Acceptance: new template/version fields are available to TypeScript consumers without manual generated-type edits; Verify: `pnpm typecheck:web`
- [x] T011 Regenerate API client types in apps/web/src/lib/services/plotify-chat.generated.ts; Acceptance: web code can consume document metadata, variable status, and approval response types from generated contracts; Verify: `pnpm contracts:generate`
- [x] T012 [P] Add tenant validation fixtures in apps/api/tests/conftest.py; Acceptance: API tests can model two organizations, projects, lots, templates, vendors, and users; Verify: `pnpm test:api`
- [x] T013 [P] Add web auth and organization fixtures in apps/web/tests/mvp-fixtures.test.ts; Acceptance: web tests can exercise admin, vendor, assigned project, and foreign organization states; Verify: `pnpm test:web`
- [x] T014 Add approval race fixture coverage in apps/api/tests/test_mvp_approval.py; Acceptance: tests can simulate Telegram and web deciding the same approval request; Verify: `pnpm test:api`
- [x] T015 Add document generation fixture coverage in apps/api/tests/test_mvp_documents.py; Acceptance: tests can generate reservation templates with required and optional variables; Verify: `pnpm test:api`
- [x] T096 Add geometry-derived boundary contract tests in apps/web/tests/mvp-project-readiness.test.ts; Acceptance: KMZ/KML lot geometry produces north/south/east/west boundary groups, perimeter, square meters, hectares, and legal deslinde text inputs before document readiness; Verify: `pnpm test:web`
- [x] T097 Add seller Telegram operation tests in apps/api/tests/test_mvp_vendor_telegram.py; Acceptance: assigned vendor can query assigned lot availability and create a reservation request from Telegram, while unassigned or foreign vendors are rejected; Verify: `pnpm test:api`
- [x] T098 Add external messaging hardening tests in apps/api/tests/test_mvp_external_integrations.py; Acceptance: Telegram send/callback paths enforce api.telegram.org allowlist behavior, timeout <=10s, safe host construction, and auditable failure results; Verify: `pnpm test:api`
- [x] T099 Add document delivery recipient/status migration in packages/database/supabase/migrations/20260525000100_mvp_project_templates_documents.sql; Acceptance: generated documents can record selected recipients, send status, failed attempts, and retry metadata without overwriting document versions; Verify: `pnpm verify:migrations`
- [x] T100 Add pilot measurement fixtures in specs/001-stabilize-plotify-mvp/quickstart.md; Acceptance: quickstart includes a 20-lot fixture path and manual timing checks for reservation submission under 5 minutes and admin decision visibility under 2 minutes; Verify: `test -f specs/001-stabilize-plotify-mvp/quickstart.md`

**Checkpoint**: Foundation ready. User story work can start after T005-T015.

---

## Phase 3: User Story 1 - Create and Validate Parcel Project (Priority: P1)

**Goal**: An admin creates or opens a project, uploads KMZ/KML, reviews lots on the map, confirms minimum geometry/legal data, assigns vendors, and marks the project operational for reservations and documents.

**Independent Test**: Use a valid KMZ/KML sample to create/import lots, verify map rendering and lot data, assign a vendor, and confirm an invalid file does not leave an operational project.

### Tests for User Story 1

- [x] T016 [P] [US1] Add KMZ/KML invalid-file and no-lot tests in apps/web/tests/mvp-project-readiness.test.ts; Acceptance: corrupt, oversized, unsupported, and no-lot inputs fail with clear errors and no operational project state; Verify: `pnpm test:web`
- [x] T017 [P] [US1] Add lot verification tests in apps/web/tests/mvp-project-readiness.test.ts; Acceptance: verified_status, official area, perimeter, and boundaries are required before document readiness; Verify: `pnpm test:web`
- [x] T018 [P] [US1] Add vendor project scoping tests in apps/web/tests/mvp-vendor-scope.test.ts; Acceptance: vendor can see assigned project/lots and cannot operate foreign or unassigned lots; Verify: `pnpm test:web`

### Implementation for User Story 1

- [x] T019 [US1] Harden geometry upload validation in apps/web/src/app/api/uploads/geometry/route.ts; Acceptance: only valid KMZ/KML produces persisted geometries and partial failures are returned as non-operational; Verify: `pnpm test:web`
- [x] T020 [US1] Normalize KMZ/KML parsing errors in apps/web/src/lib/services/kmz-parser.service.ts; Acceptance: parser errors are user-actionable and do not expose internal stack traces; Verify: `pnpm test:web`
- [x] T021 [US1] Ensure KML-to-GeoJSON lot extraction preserves source properties in apps/web/src/lib/services/kml-to-geojson.service.ts; Acceptance: lot number, geometry, area inputs, and boundary metadata are available for review; Verify: `pnpm test:web`
- [x] T022 [US1] Make project readiness explicit in apps/web/src/actions/lot-verification.action.ts; Acceptance: a project can become operational only after required lot verification and minimum data checks pass; Verify: `pnpm typecheck:web`
- [x] T023 [US1] Surface readiness state in apps/web/src/components/projects/LotVerificationPanel.tsx; Acceptance: admin sees which lots block operation and what data must be corrected; Verify: `pnpm test:web`
- [x] T024 [US1] Keep geometry map review stable in apps/web/src/components/projects/geometry-viewer/index.tsx; Acceptance: imported lots render with selection, area, boundaries, and empty/error states; Verify: `pnpm build:web`
- [x] T025 [US1] Enforce vendor assignment before reservation access in apps/web/src/actions/vendor-actions.action.ts; Acceptance: vendors can operate only projects explicitly assigned through vendor_projects; Verify: `pnpm test:web`
- [x] T026 [US1] Update project detail readiness messaging in apps/web/src/components/projects/detail/overview-tab.tsx; Acceptance: project status clearly distinguishes draft/imported/validated/operational states; Verify: `pnpm typecheck:web`
- [x] T101 [US1] Persist or expose calculated legal geometry metrics from apps/web/src/lib/geometry/utm.ts and apps/web/src/lib/geometry/utils.ts during project readiness; Acceptance: lot readiness can use calculated area, perimeter, boundary directions, and distances without manual re-entry when geometry is valid; Verify: `pnpm test:web`
- [x] T102 [US1] Connect geometry-derived boundary text from apps/web/src/lib/legal/deslinde-generator.ts into lot verification review; Acceptance: admin can accept or correct generated legal deslindes before a lot becomes document-ready; Verify: `pnpm test:web`

**Checkpoint**: US1 can be tested independently with the quickstart project readiness flow.

---

## Phase 4: User Story 2 - Request and Approve Reservation (Priority: P1)

**Goal**: A vendor requests reservation for an available lot, admin receives Telegram and web notification, and the first valid admin decision wins without duplicate reservation.

**Independent Test**: From an operational project and assigned vendor, submit a reservation, approve from Telegram or web, verify lot state/history, then attempt the other channel and receive already-processed behavior.

### Tests for User Story 2

- [x] T027 [P] [US2] Add reservation request contract tests in apps/api/tests/test_mvp_approval.py; Acceptance: available lot succeeds, unavailable lot fails, duplicate pending request fails; Verify: `pnpm test:api`
- [x] T028 [P] [US2] Add cross-tenant approval tests in apps/api/tests/test_tenant_validation.py; Acceptance: foreign admin cannot view, approve, reject, or mutate another organization approval; Verify: `pnpm test:api`
- [x] T029 [P] [US2] Add web approval action tests in apps/web/tests/mvp-approval-web.test.ts; Acceptance: web admin approve/reject resolves pending reservation and reports already processed after Telegram wins; Verify: `pnpm test:web`
- [x] T030 [P] [US2] Add Telegram callback idempotency tests in apps/api/tests/test_notifications_fase7.py; Acceptance: repeated approve/reject callbacks do not duplicate lot state changes; Verify: `pnpm test:api`

### Implementation for User Story 2

- [x] T031 [US2] Strengthen reservation request tenant checks in apps/api/api/v1/endpoints/approvals.py; Acceptance: organization is derived from persisted lot/project and mismatches are rejected before approval_requests insert; Verify: `pnpm test:api`
- [x] T032 [US2] Preserve duplicate-pending protection in apps/api/api/v1/endpoints/approvals.py; Acceptance: one lot cannot have multiple pending reservation requests; Verify: `pnpm test:api`
- [x] T033 [US2] Add web admin decision contract in apps/api/api/v1/endpoints/approvals.py; Acceptance: authenticated admin can approve or reject pending reservation through web with first-decision-wins semantics; Verify: `pnpm contracts:generate`
- [x] T034 [US2] Use shared decision processing in apps/api/workers/tasks/approval_processor.py; Acceptance: Telegram and web decisions both lock request/lot, return already processed when appropriate, and emit audit events; Verify: `pnpm test:api`
- [x] T035 [US2] Keep Telegram notification payload complete in apps/api/workers/tasks/approval_notifier.py; Acceptance: admin notification includes vendor, buyer, project, lot, price/reserve value, and approve/reject actions; Verify: `pnpm test:api`
- [x] T036 [US2] Update Telegram webhook handling in apps/api/api/v1/endpoints/webhook.py; Acceptance: callback responses are idempotent and stale buttons are removed or made harmless after resolution; Verify: `pnpm test:api`
- [x] T037 [US2] Update web approval client service in apps/web/src/lib/services/approvals.service.ts; Acceptance: frontend can list pending requests and call approve/reject using generated or verified API shape; Verify: `pnpm typecheck:web`
- [x] T038 [US2] Add admin pending approvals UI in apps/web/src/components/dashboard/approvals/pending-approvals-panel.tsx; Acceptance: admin sees pending reservation data and can decide without Telegram; Verify: `pnpm test:web`
- [x] T039 [US2] Integrate pending approvals into dashboard in apps/web/src/app/dashboard/page.tsx; Acceptance: reservation approval is visible in web notifications or dashboard without navigating to raw lot records; Verify: `pnpm build:web`
- [x] T040 [US2] Write reservation request history from apps/web/src/actions/request-approval.action.ts and reservation resolution history from the shared API/worker decision processor; Acceptance: request created, approved, rejected, and channel fields appear in audit/history regardless of whether Telegram or web resolves the request; Verify: `pnpm test:api && pnpm test:web`
- [x] T103 [US2] Implement seller Telegram lot query and reservation intent handling in apps/api/workers/tasks/message_processor.py; Acceptance: linked assigned vendor can ask for assigned lot availability and submit buyer/reservation data through Telegram using the same request contract as web; Verify: `pnpm test:api`
- [x] T104 [US2] Harden Telegram client construction in apps/api/integrations/telegram_client.py; Acceptance: Bot API calls use a fixed Telegram host, no user-controlled URL, explicit timeouts <=10s, and structured failure logs for retry/audit; Verify: `pnpm test:api`

**Checkpoint**: US2 can be tested independently with Telegram-first and web-first decision flows.

---

## Phase 5: User Story 3 - Generate Traceable Reservation Document (Priority: P1)

**Goal**: Admin generates reservation PDF and DOCX from the active project template, sees missing variables before generation, may explicitly accept blanks, and gets versioned immutable document history.

**Independent Test**: From an approved reservation, open document generation, inspect available/missing variables, generate PDF and DOCX, regenerate after data change, and verify version/snapshot/history.

### Tests for User Story 3

- [x] T041 [P] [US3] Add variable status API tests in apps/api/tests/test_mvp_documents.py; Acceptance: response includes nested variables, available keys, missing keys, and source map for reservation variables; Verify: `pnpm test:api`
- [x] T042 [P] [US3] Add document generation metadata tests in apps/api/tests/test_mvp_documents.py; Acceptance: generate returns document_id, version_number, template_id, lot_id, format, file_url, and missing_variables_accepted; Verify: `pnpm test:api`
- [x] T043 [P] [US3] Add reservation wizard tests in apps/web/tests/mvp-document-generation.test.ts; Acceptance: wizard blocks generation on missing required variables unless admin explicitly accepts blanks; Verify: `pnpm test:web`
- [x] T044 [P] [US3] Add generated document history tests in apps/web/tests/mvp-document-history.test.ts; Acceptance: history shows PDF/DOCX rows, version, template, generated_by, and snapshot status; Verify: `pnpm test:web`

### Implementation for User Story 3

- [x] T045 [US3] Implement nested variable resolution adapter in apps/api/services/document_engine.py; Acceptance: current flat fields map into DocumentVariables v1 groups without breaking existing templates; Verify: `pnpm test:api`
- [x] T046 [US3] Compute available and missing variables in apps/api/services/document_engine.py; Acceptance: required variables are derived from included template blocks and sources before final render; Verify: `pnpm test:api`
- [x] T047 [US3] Update variables endpoint in apps/api/api/v1/endpoints/documents.py; Acceptance: GET variables returns nested variables, availability, missing list, and source map; Verify: `pnpm contracts:generate`
- [x] T048 [US3] Update document preview endpoint in apps/api/api/v1/endpoints/documents.py; Acceptance: preview uses backend-rendered variables and never relies on frontend-only substitution; Verify: `pnpm test:api`
- [x] T049 [US3] Persist generated document metadata in apps/api/services/document_generator.py; Acceptance: each PDF/DOCX write creates one generated_documents row with immutable snapshot and version; Verify: `pnpm test:api`
- [x] T050 [US3] Return persisted generation metadata in apps/api/api/v1/endpoints/documents.py; Acceptance: generate response matches OpenAPI contract and includes document identity/version; Verify: `pnpm contracts:generate`
- [x] T051 [US3] Add project active template lookup in apps/api/services/document_engine.py; Acceptance: reservation generation uses project-specific active template or a documented organization default fallback; Verify: `pnpm test:api`
- [x] T052 [US3] Update document service client in apps/web/src/lib/services/document-generation.service.ts; Acceptance: web consumes generated variable status and metadata types without local contract drift; Verify: `pnpm typecheck:web`
- [x] T053 [US3] Update generation wizard variable review in apps/web/src/components/dashboard/documents/generation-wizard.tsx; Acceptance: admin sees available/missing variables and explicit accept-blanks control before generation; Verify: `pnpm test:web`
- [x] T054 [US3] Update template builder project selection in apps/web/src/components/dashboard/documents/template-builder.tsx; Acceptance: admin can assign or mark the active reservation template for a project; Verify: `pnpm test:web`
- [x] T055 [US3] Update project documents tab generation entry in apps/web/src/components/projects/detail/documents-tab.tsx; Acceptance: reserved lots can launch reservation PDF/DOCX generation from project context; Verify: `pnpm build:web`
- [x] T056 [US3] Update document history table in apps/web/src/components/dashboard/documents/documents-history-table.tsx; Acceptance: table shows version, format, template, lot, generated_by, missing acceptance, and generated date; Verify: `pnpm test:web`
- [x] T057 [US3] Add document.generated and document.regenerated audit writes in apps/api/api/v1/endpoints/documents.py; Acceptance: generated document events include document_id, lot_id, template_id, version, format, and actor; Verify: `pnpm test:api`
- [x] T058 [US3] Validate reservation document flow against specs/001-stabilize-plotify-mvp/quickstart.md; Acceptance: quickstart P1 document scenario passes for both PDF and DOCX; Verify: `pnpm test:api && pnpm test:web`
- [x] T105 [US3] Add document recipient selection contract in FastAPI document generation/send models; Acceptance: admin can choose vendedor, comprador, or both, and selected recipients are persisted with generated document metadata; Verify: `pnpm contracts:generate`
- [x] T106 [US3] Add document recipient UI in apps/web/src/components/dashboard/documents/generation-wizard.tsx; Acceptance: admin chooses recipients before send and the choice is visible in document history; Verify: `pnpm test:web`
- [x] T107 [US3] Add document send/retry handling in apps/api/workers/tasks/notification_worker.py or a document delivery worker; Acceptance: send failures keep the generated document intact, record failed status/reason, and allow retry without regenerating the document; Verify: `pnpm test:api`
- [x] T108 [US3] Include geometry-derived legal variables in reservation document snapshot in apps/api/services/document_engine.py; Acceptance: `lote.superficie_total`, `lote.deslindes`, and servidumbre-derived fields come from verified geometry/legal review data and are stored in variables_snapshot; Verify: `pnpm test:api`

**Checkpoint**: P1 MVP is complete when US1, US2, and US3 pass their independent tests and global gates.

---

## Phase 6: User Story 4 - Prepare Escritura From Project Data and Documents (Priority: P2)

**Goal**: Admin or legal operator reviews escritura variables from project, lot, buyer, geometry, and uploaded legal documents, completes missing values manually, and generates versioned PDF/DOCX for legal review.

**Independent Test**: Upload legal project documents, review source-classified variables, complete missing values, generate escritura PDF/DOCX, and verify versions and snapshots.

### Tests for User Story 4

- [x] T059 [P] [US4] Add project legal data migration tests in apps/api/tests/test_mvp_escritura.py; Acceptance: reviewed legal values store source document, status, reviewer, and project organization; Verify: `pnpm test:api`
- [x] T060 [P] [US4] Add escritura variable status tests in apps/api/tests/test_mvp_escritura.py; Acceptance: variables are classified as project, lot, buyer, geometry, legal document, or missing; Verify: `pnpm test:api`
- [x] T061 [P] [US4] Add legal review UI tests in apps/web/tests/mvp-escritura.test.ts; Acceptance: admin can review source, edit manual values, and see pending variables; Verify: `pnpm test:web`

### Implementation for User Story 4

- [x] T062 [US4] Add project legal data migration in packages/database/supabase/migrations/20260525000200_mvp_project_legal_data.sql; Acceptance: structured legal variables support dominio, roles, SAG/subdivision, plano, matriz, and personeria values, with source document, review status, reviewer, and reviewed_at fields; Verify: `pnpm verify:migrations`
- [x] T063 [US4] Regenerate DB types for legal data in packages/database/types/database.generated.ts; Acceptance: web and API consumers have typed legal data rows; Verify: `pnpm typecheck:web`
- [x] T064 [US4] Validate project legal file uploads in apps/web/src/app/api/uploads/project-files/route.ts; Acceptance: allowed document types and sizes are enforced before storage; Verify: `pnpm test:web`
- [x] T065 [US4] Add legal data review actions in apps/web/src/actions/documents.action.ts; Acceptance: admin can save reviewed legal variables and their source document references; Verify: `pnpm test:web`
- [x] T066 [US4] Add legal review UI in apps/web/src/components/projects/detail/legal-tab.tsx; Acceptance: admin sees uploaded documents, extracted/reviewed values, missing values, and review status; Verify: `pnpm build:web`
- [x] T067 [US4] Extend resolver with project legal data in apps/api/services/document_engine.py; Acceptance: escritura variables include reviewed legal values with source map and missing classification; Verify: `pnpm test:api`
- [x] T068 [US4] Support escritura template generation in apps/api/api/v1/endpoints/documents.py; Acceptance: escritura PDF/DOCX uses same missing-variable policy, snapshot, and versioning as reservation; Verify: `pnpm contracts:generate`
- [x] T069 [US4] Show escritura generation path in apps/web/src/components/projects/detail/documents-tab.tsx; Acceptance: admin can generate escritura for eligible lot with variable review first; Verify: `pnpm test:web`

**Checkpoint**: US4 extends document generation without weakening P1 reservation behavior.

---

## Phase 7: User Story 5 - Complete Sale With Admin Approval (Priority: P2)

**Goal**: Vendor or admin requests sale either as direct sale from a `disponible` lot or as sale after reservation from a `reservado` lot, admin approves or rejects through Telegram or web, approved sale moves lot to sold atomically, rejected sale preserves the captured prior state, and history is traceable.

**Independent Test**: Start from a `disponible` lot, request direct sale, approve from one channel, verify sold state and direct-sale history, then repeat from a `reservado` lot and confirm rejection preserves `reservado`; in both paths the second channel reports already processed.

### Tests for User Story 5

- [x] T070 [P] [US5] Add sale approval DB/RPC tests in apps/api/tests/test_mvp_sale.py; Acceptance: approve locks approval and lot, updates `disponible` direct sale and `reservado` reserved sale to `vendido`, rejects invalid prior state, and enforces RPC authorization; Verify: `pnpm test:api`
- [x] T071 [P] [US5] Add sale rejection tests in apps/api/tests/test_mvp_sale.py; Acceptance: rejection preserves `disponible` for direct sale and `reservado` for reserved sale, and writes audit/history with sale mode and prior state; Verify: `pnpm test:api`
- [x] T072 [P] [US5] Add web sale request tests in apps/web/tests/mvp-sale.test.ts; Acceptance: seller/admin can request sale for eligible assigned `disponible` or `reservado` lots, admin-originated sale uses a valid `vendors.id`, and unassigned/foreign users are rejected; Verify: `pnpm test:web`
- [x] T073 [P] [US5] Add Telegram sale callback tests in apps/api/tests/test_notifications_fase7.py; Acceptance: direct and reserved sale callbacks use first-decision-wins semantics like reservation and surface already-processed responses; Verify: `pnpm test:api`

### Implementation for User Story 5

- [x] T074 [US5] Add sale approval migration in packages/database/supabase/migrations/20260525000300_mvp_sale_approval.sql; Acceptance: approval_requests or compatible schema distinguishes reservation and sale, stores/derives sale mode and prior lot state, and enforces one pending approval per lot regardless of request type; Verify: `pnpm verify:migrations`
- [x] T075 [US5] Add sale resolution RPC in packages/database/supabase/migrations/20260525000300_mvp_sale_approval.sql; Acceptance: approve/reject sale locks approval and lot, validates direct/reserved prior state, mutates approval/lot/lot_record/audit atomically on approval, preserves prior state on rejection, and is restricted to service role or validates admin membership; Verify: `pnpm verify:migrations`
- [x] T076 [US5] Regenerate DB types for sale approval in packages/database/types/database.generated.ts; Acceptance: generated TypeScript can access request type, sale mode/prior-state fields if persisted, and sale RPC shapes without manual type edits; Verify: `pnpm typecheck:web`
- [x] T077 [US5] Extend approval request endpoint for sale in apps/api/api/v1/endpoints/approvals.py; Acceptance: sale request validates tenant, vendor assignment, `disponible` or `reservado` state, sale mode/prior state, and absence of any pending approval for the lot before insert; Verify: `pnpm contracts:generate`
- [x] T078 [US5] Extend approval processor for sale in apps/api/workers/tasks/approval_processor.py; Acceptance: sale decisions share idempotency, channel tracking, sale-mode-aware audit, and already-processed behavior with reservation; Verify: `pnpm test:api`
- [x] T079 [US5] Extend Telegram approval notification for sale in apps/api/workers/tasks/approval_notifier.py; Acceptance: sale message includes direct/reserved sale mode plus buyer, lot, project, price, vendor, and enough context for admin decision; Verify: `pnpm test:api`
- [x] T080 [US5] Replace direct sale mutation path with approval-backed flow in apps/web/src/actions/lot-process.action.ts and apps/web/src/actions/request-approval.action.ts; Acceptance: "Venta Directa" creates a sale approval using a valid `vendors.id`, lot cannot become `vendido` without explicit admin approval, and admin-originated sale selects or derives a project-assigned vendor; Verify: `pnpm test:web`
- [x] T081 [US5] Add sale action UI in apps/web/src/components/projects/viewer/LotInfoView.tsx, apps/web/src/components/projects/LotReservationForm.tsx, and apps/web/src/components/dashboard/approvals/pending-approvals-panel.tsx; Acceptance: `disponible` lots show direct-sale request, `reservado` lots show sale-after-reservation request, pending/approved/rejected state is visible, and labels never imply the sale succeeded before approval; Verify: `pnpm build:web`

**Checkpoint**: US5 completes both direct sale and reservation-to-sale lifecycle while preserving approval traceability.

---

## Phase 8: User Story 6 - Operate Pilot Across Devices (Priority: P3)

**Goal**: Admins and vendors can complete critical P1 and P2 flows from desktop, tablet, and mobile without losing primary actions or readability.

**Independent Test**: Run project readiness, reservation request, admin approval, and document generation review at mobile and desktop widths.

### Tests for User Story 6

- [ ] T082 [P] [US6] Add responsive smoke tests for reservation UI in apps/web/tests/mvp-responsive.test.ts; Acceptance: vendor can complete reservation request at mobile and desktop widths; Verify: `pnpm test:web`
- [ ] T083 [P] [US6] Add responsive smoke tests for admin approval UI in apps/web/tests/mvp-responsive.test.ts; Acceptance: admin approve/reject controls are visible and usable at mobile and desktop widths; Verify: `pnpm test:web`
- [ ] T084 [P] [US6] Add responsive smoke tests for document generation UI in apps/web/tests/mvp-responsive.test.ts; Acceptance: variable review and generation controls remain accessible on mobile and usable on desktop; Verify: `pnpm test:web`

### Implementation for User Story 6

- [ ] T085 [US6] Make lot reservation form responsive in apps/web/src/components/projects/LotReservationForm.tsx; Acceptance: buyer fields, validation errors, and submit action fit mobile without overlap; Verify: `pnpm build:web`
- [ ] T086 [US6] Make admin approval panel responsive in apps/web/src/components/dashboard/approvals/pending-approvals-panel.tsx; Acceptance: decision controls stay visible and primary context remains readable on mobile; Verify: `pnpm build:web`
- [ ] T087 [US6] Make document generation wizard responsive in apps/web/src/components/dashboard/documents/generation-wizard.tsx; Acceptance: variables, preview, missing-data controls, and generate actions remain usable across widths; Verify: `pnpm build:web`
- [ ] T088 [US6] Document responsive manual QA in specs/001-stabilize-plotify-mvp/quickstart.md; Acceptance: quickstart lists desktop and mobile checks for P1 flows; Verify: `pnpm build:web`

**Checkpoint**: US6 confirms pilot usability across target devices.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Validate contracts, security, history, and pilot readiness after selected stories are complete.

- [ ] T089 [P] Run migration verification for all MVP migrations in packages/database/supabase/migrations; Acceptance: canonical migration assertion passes with no duplicate or out-of-root migrations; Verify: `pnpm verify:migrations`
- [ ] T090 [P] Run OpenAPI regeneration and inspect contract diff in packages/contracts/openapi/plotify-chat.v1.json; Acceptance: generated contract contains only intentional approval/document deltas; Verify: `pnpm contracts:generate`
- [ ] T091 [P] Run web typecheck and fix typed contract usage in apps/web/src; Acceptance: no TypeScript errors after DB/API generated type changes; Verify: `pnpm typecheck:web`
- [ ] T092 [P] Run web test suite and fix regressions in apps/web/tests; Acceptance: web tests pass for geometry, approval, documents, sale, and responsive coverage; Verify: `pnpm test:web`
- [ ] T093 [P] Run API test suite and fix regressions in apps/api/tests; Acceptance: API tests pass for tenant validation, approvals, documents, notifications, and sale/escritura coverage; Verify: `pnpm test:api`
- [ ] T094 Run production web build in apps/web; Acceptance: Next.js build succeeds after all route/action/component changes; Verify: `pnpm build:web`
- [ ] T095 Validate full quickstart in specs/001-stabilize-plotify-mvp/quickstart.md; Acceptance: P1 passes end-to-end and P2 passes for implemented scope with documented residual gaps; Verify: `pnpm verify:migrations && pnpm contracts:generate && pnpm typecheck:web && pnpm test:web && pnpm build:web && pnpm test:api`
- [ ] T109 Run timed pilot smoke check from specs/001-stabilize-plotify-mvp/quickstart.md; Acceptance: reservation request can be completed under 5 minutes and admin approval is visible under 2 minutes in the documented smoke path; Verify: `pnpm test:web && pnpm test:api`
- [ ] T110 Run 20-lot pilot fixture check from specs/001-stabilize-plotify-mvp/quickstart.md; Acceptance: at least 20 lots can be reviewed with reservation, sale/document readiness, generated document history, and no cross-tenant leakage; Verify: `pnpm test:web && pnpm test:api`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): no dependencies.
- Foundational (Phase 2): depends on Setup and blocks user stories.
- US1, US2, US3: all depend on Foundation. US2 needs a US1 operational project for manual end-to-end validation, but automated tests can use fixtures.
- US4 and US5: depend on P1 contracts and traceability from US2/US3.
- US6: can start after the target UI for each flow exists; complete before pilot rollout.
- Final Phase: runs after the selected MVP scope is complete.

### User Story Dependencies

- US1: first P1 story; creates operational project and assigned vendor base.
- US2: depends on operational project and vendor scoping from US1 for real flow.
- US3: depends on approved reservation from US2 for real flow.
- US4: depends on US3 document variable/status/version model.
- US5: depends on US2 approval pipeline and US1 lot state rules.
- US6: depends on UI surfaces introduced by US1-US5.

### Parallel Opportunities

- T002-T004 can run in parallel after T001.
- T007-T009 and T012-T015 can run in parallel after migration approach is decided.
- Within each user story, tests marked [P] can be written in parallel before implementation.
- US4 and US5 can run in parallel after P1 because they touch different primary migrations, endpoints, and UI paths.
- Final verification tasks T089-T093 can run in parallel before T094-T095.

---

## Parallel Example: P1 Implementation

```bash
# US1 tests in parallel by separate implementers:
Task: "T016 Add KMZ/KML invalid-file and no-lot tests in apps/web/tests/mvp-project-readiness.test.ts"
Task: "T017 Add lot verification tests in apps/web/tests/mvp-project-readiness.test.ts"
Task: "T018 Add vendor project scoping tests in apps/web/tests/mvp-vendor-scope.test.ts"

# US2 tests in parallel by separate implementers:
Task: "T027 Add reservation request contract tests in apps/api/tests/test_mvp_approval.py"
Task: "T028 Add cross-tenant approval tests in apps/api/tests/test_tenant_validation.py"
Task: "T029 Add web approval action tests in apps/web/tests/mvp-approval-web.test.ts"
Task: "T030 Add Telegram callback idempotency tests in apps/api/tests/test_notifications_fase7.py"

# US3 tests in parallel by separate implementers:
Task: "T041 Add variable status API tests in apps/api/tests/test_mvp_documents.py"
Task: "T042 Add document generation metadata tests in apps/api/tests/test_mvp_documents.py"
Task: "T043 Add reservation wizard tests in apps/web/tests/mvp-document-generation.test.ts"
Task: "T044 Add generated document history tests in apps/web/tests/mvp-document-history.test.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 project readiness.
3. Complete US2 reservation approval via Telegram and web.
4. Complete US3 reservation PDF/DOCX with variables, snapshots, and versioning.
5. Stop and validate P1 with T089-T095 before starting P2 in production scope.

### P2 Extension

1. Implement US4 escritura variable/legal-data model using the US3 document contract.
2. Implement US5 sale approval using the US2 approval pipeline.
3. Re-run all contract, migration, web, API, and build gates.

### Pilot Readiness

1. Implement US6 responsive hardening for the flows that will be piloted.
2. Run the quickstart manually with one admin, one vendor, one project, and at least one reserved lot.
3. Record any residual non-P1 gaps in specs/001-stabilize-plotify-mvp/quickstart.md before rollout.
