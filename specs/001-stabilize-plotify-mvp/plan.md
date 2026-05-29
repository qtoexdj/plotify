# Implementation Plan: Stabilize Plotify MVP

**Branch**: `001-stabilize-plotify-mvp` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-stabilize-plotify-mvp/spec.md`

## Summary

Close Plotify's pilot-ready MVP in two increments. P1 completes the customer
pilot path: a validated KMZ/KML parcel project, a vendor reservation request
from web or Telegram that the admin can approve from Telegram or the web, and
traceable reservation documents in PDF/DOCX. P2 extends the same contracts and
audit model to sale approval and escritura generation from project, lot, buyer,
geometry, and legal project documents.

The plan preserves the existing monorepo boundaries: `apps/web` remains the
Next.js product surface, `apps/api` remains the FastAPI/LangGraph/Telegram and
document-generation service, `packages/database` remains the only Supabase
migration/type source, and `packages/contracts` remains the OpenAPI contract
surface. The work is documentation/planning only; no application code is
implemented by this command.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.6 in
`apps/web`; Python 3.13+ runtime expected by memory and Python dependencies in
`apps/api`; FastAPI 0.135.1; LangGraph 1.2.1.

**Primary Dependencies**: Supabase JS/SSR, Supabase Python/PostgREST, FastAPI,
LangGraph, Redis/arq, Telegram bot integration, Jinja2, WeasyPrint,
python-docx, MapLibre/Turf/proj4, Tailwind CSS 4, shadcn/Radix UI.

**Storage**: Supabase PostgreSQL, Supabase Storage buckets `documents` and
`project-files`, canonical migrations under
`packages/database/supabase/migrations`, generated DB types under
`packages/database/types/database.generated.ts`.

**Testing**: `pnpm typecheck:web`, `pnpm test:web`, `pnpm build:web`,
`pnpm test:api`, `pnpm verify:migrations`, `pnpm contracts:generate`.

**Target Platform**: Browser web app for desktop/tablet/mobile plus FastAPI
service, Redis worker, Telegram webhook, and Supabase local/hosted environment.

**Project Type**: Monorepo web application with API service, worker service,
database package, and generated contracts package.

**Performance Goals**: Admin approval visible within 2 minutes of reservation
request; vendor can submit a reservation in under 5 minutes; pilot can operate
20 lots with reservation, sale, documents, and history without technical
intervention.

**Constraints**: Human admin approval is required for reservation, sale, and
final documents; service-role endpoints must validate tenant ownership from
persisted resources; migrations are canonical only in `packages/database`;
OpenAPI-generated contracts must stay in sync; CAD, Prompt Ops, WhatsApp as
primary channel, CRM-complete, visual diff, and autonomous approvals are out of
scope.

**Scale/Scope**: One pilot organization flow first, then repeated across
organizations. P1 covers project validation, reservation approval, and
reservation documents. P2 covers sale/escritura and structured legal data from
uploaded project documents.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Producto Piloto Primero**: PASS. Plan prioritizes real Chilean pilot flow
  and keeps CAD/Prompt Ops/WhatsApp-primary/firma/CRM-complete out of MVP.
- **Geometría Espacial como Origen de Deslindes y Documentos**: PASS. P1 uses
  KMZ/KML geometry, lot verification, official boundaries, and document variable
  mapping from project/lots.
- **Supabase y Migraciones Canónicas**: PASS. All schema deltas are planned for
  `packages/database/supabase/migrations`; generated types must be refreshed.
- **Contratos Tipados Entre Servicios**: PASS. Existing OpenAPI endpoints are
  used where present; any API delta must regenerate `packages/contracts`.
- **Seguridad Multi-Tenant y Auditoría**: PASS with required implementation
  gates. Tenant validation already exists for document generation/reservation
  request; new web approval and P2 sale/escritura flows must derive/verify org
  before mutation and write traceable audit/history.
- **Testing y Gates de Calidad Obligatorios**: PASS. Each phase includes tests
  and verification commands before closure.

## Project Structure

### Documentation (this feature)

```text
specs/001-stabilize-plotify-mvp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-contracts.md
│   └── database-contracts.md
└── tasks.md             # generated later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── src/actions/
│   ├── complete-onboarding.action.ts
│   ├── request-approval.action.ts
│   ├── reserve-lot.action.ts
│   ├── lot-process.action.ts
│   ├── lot-verification.action.ts
│   ├── documents.action.ts
│   └── vendor-actions.action.ts
├── src/app/api/uploads/
│   ├── geometry/route.ts
│   └── project-files/route.ts
├── src/components/projects/
│   ├── GeometryUploadPanel.tsx
│   ├── LotReservationForm.tsx
│   └── detail/documents-tab.tsx
├── src/components/dashboard/documents/
│   ├── generation-wizard.tsx
│   ├── template-builder.tsx
│   └── documents-history-table.tsx
├── src/lib/services/
│   ├── approvals.service.ts
│   ├── document-generation.service.ts
│   ├── documents.service.ts
│   └── plotify-chat.generated.ts
└── tests/

apps/api/
├── api/v1/endpoints/
│   ├── approvals.py
│   ├── documents.py
│   └── webhook.py
├── services/
│   ├── document_engine.py
│   └── document_generator.py
├── workers/tasks/
│   ├── approval_notifier.py
│   ├── approval_processor.py
│   └── notification_worker.py
├── integrations/telegram_client.py
├── utils/audit.py
└── tests/

packages/database/
├── supabase/migrations/
├── scripts/assert-canonical-migrations.mjs
└── types/database.generated.ts

packages/contracts/
└── openapi/plotify-chat.v1.json
```

**Structure Decision**: Keep the current monorepo and service split. Do not add
new apps or new migration roots. Shared product/API contracts live in
`packages/contracts`; database schema deltas live in `packages/database`.

## Incremental Plan

### P1-A: Project KMZ/KML Readiness

Current code already has geometry upload at `apps/web/src/app/api/uploads/geometry/route.ts`,
project document upload at `apps/web/src/app/api/uploads/project-files/route.ts`,
lot verification actions, and document fields on `projects`.

Plan:

- Make project readiness explicit using existing `projects.estado` and
  `lots.verified_status`, avoiding new tables unless implementation proves a
  missing invariant.
- Ensure KMZ/KML upload rejects invalid files, persists geometries, and lets
  the admin verify official lot area/boundaries before document use.
- Ensure geometry-derived measurements produce reviewable north/south/east/west
  boundary groups, perimeter, square meters/hectares, and legal deslinde text
  before document variables can rely on them.
- Ensure vendor assignment is complete before a vendor can request reservation.
- Add or update tests around geometry upload validation, lot verification, and
  vendor project scoping.

### P1-B: Reservation Approval From Telegram or Web

Current code already has:

- `requestReservationApproval` in `apps/web/src/actions/request-approval.action.ts`
- `createApprovalRequest` posting to `/api/v1/approvals/request-reservation`
- `approval_requests` table
- ARQ job `notify_admin_approval`
- Telegram callback handling in `receive_telegram_webhook`
- RPCs `approve_reservation` and `reject_reservation`
- worker `process_admin_decision`

Plan:

- Keep `approval_requests` as the source for pending admin notifications in
  web UI; avoid a new notification table for P1.
- Add a web admin decision path that verifies admin membership before invoking
  the same reservation resolution behavior used by Telegram.
- Add a seller Telegram operation path for assigned vendors to query assigned
  lot availability and submit reservation data through the same reservation
  request contract used by the web flow.
- Ensure Telegram and web race safely: the first valid approval/rejection wins;
  the second receives "already processed".
- Standardize audit/history for request created, approved, rejected, and
  resolved-by-channel events using `audit_logs` and/or a customer-facing lot
  timeline derived from existing records.
- Harden Telegram calls around fixed Bot API host construction, explicit
  timeouts not exceeding 10 seconds, safe payload handling, and auditable
  failure/retry status.
- Add tests for double approval, cross-tenant approval attempt, pending exists,
  and web/Telegram parity.

### P1-C: Reservation Document PDF/DOCX

Current code already has:

- `document_blocks`, `document_templates`, `template_block_items`
- backend preview/generate endpoints
- `resolve_variables`, `render_template`, `generate_pdf`, `generate_docx`
- `generated_documents` with `variables_snapshot`
- frontend `GenerationWizard`, `TemplateBuilder`, and document history

Gaps verified in code:

- Backend variables are currently flat (`cliente_nombre`, `numero_lote`, etc.)
  while frontend `EscrituraVariables` is nested.
- `generated_documents` has no explicit document version column.
- `document_templates` is organization-scoped, not project-scoped, so "active
  template per project" needs a schema/model decision.
- Missing-variable detection is not a final backend contract yet.
- Generated document response currently returns `{ file_url, format }`, not a
  persisted document id/version.

Plan:

- Define `DocumentVariables v1` as a shared contract with nested canonical keys
  and a backend adapter from current flat fields.
- Use `document_blocks.variables` plus resolved variable data to compute
  missing/available variables before generation.
- Add project-scoped active template support for reservation templates.
- Add generated document versioning and return persisted metadata from generate.
- Generate PDF and DOCX for reservation separately but with the same
  `variables_snapshot` contract.
- Let the admin choose document recipients and persist send status/failures so
  delivery can be retried without regenerating legal documents.
- Add tests for variable resolution, missing variable behavior, snapshot,
  version increment, PDF, DOCX, and tenant mismatch.

### P2-A: Sale Approval

Current code has `directSale`, `requestSaleApproval`, and `updateLotStage`.
Direct sale is a valid business path for a `disponible` lot, but it must mean
"request a sale approval directly" rather than "mutate the lot to sold from the
frontend/server action". Sale approval must also support the reserved-lot path,
where a `reservado` lot advances to sold after admin approval.

Plan:

- Extend the approval model to support sale requests without duplicating the
  reservation pipeline.
- Support two sale origins: `direct` from `disponible` and `reserved` from
  `reservado`; derive and persist the origin from the lot state at request time.
- Add sale-specific validation and atomic resolution so approved sale changes
  lot state to `vendido` and rejected sale leaves the captured prior state
  intact (`disponible` or `reservado`).
- Ensure all "Venta Directa" UI/actions create a `sale` approval request and
  never mark a lot `vendido` before explicit admin approval.
- Ensure admin-originated sale requests either use the lot's assigned vendor or
  require the admin to choose a project-assigned vendor; do not send `user.id`
  where `vendors.id` is required.
- Block any second pending approval for the same lot, regardless of
  `request_type`, before inserting a sale request.
- Restrict sale resolution RPCs to trusted execution (`service_role`) or
  validate admin organization membership inside the RPC before mutation.
- Keep Telegram/web first-decision-wins semantics.
- Add tests for direct sale from `disponible`, reservation-to-sale transition,
  sale rejection preserving both prior states, duplicate pending requests across
  request types, vendor/admin sale initiation, RPC authorization, and
  cross-tenant sale approval.

### P2-B: Escritura and Legal Project Documents

Current code stores project PDF documents in `projects.doc_dominio_vigente`,
`doc_hipoteca_gravamen`, `doc_roles`, `doc_subdivision`, `doc_plano_oficial`,
and `doc_otros`. It does not yet extract or normalize those documents into
structured escritura variables.

Plan:

- Inventory escritura variables from current `EscrituraVariables`, legal blocks,
  and Chilean project documents.
- Add structured legal-data storage for values reviewed/accepted by an admin or
  lawyer-functional role.
- Use uploaded PDFs as sources with human review; do not require full automatic
  extraction for pilot closure.
- Generate escritura PDF/DOCX using the same variable status, snapshot,
  versioning, and tenant validation model as reservation documents.

## Contracts Affected

- Existing OpenAPI:
  - `POST /api/v1/approvals/request-reservation`
  - `POST /api/v1/documents/preview`
  - `POST /api/v1/documents/generate`
  - `GET /api/v1/documents/generated`
  - `GET /api/v1/documents/variables/{lot_id}`
  - `POST /api/v1/webhook/telegram/{org_id}`
- Existing DB/RPC:
  - `approval_requests`
  - `approve_reservation`
  - `reject_reservation`
  - `audit_logs`
  - `document_templates`
  - `document_blocks`
  - `template_block_items`
  - `generated_documents`
  - `projects`
  - `lots`
  - `lot_records`
- Required contract work:
  - Extend document generation response to include persisted document metadata.
  - Add/standardize variable-status contract for available/missing variables.
  - Add a web admin approval contract using verified admin membership.
  - Add sale approval contract in P2.
  - Regenerate OpenAPI and TS types after API changes.

Details are captured in [api-contracts.md](./contracts/api-contracts.md) and
[database-contracts.md](./contracts/database-contracts.md).

## Migrations Needed

All migrations must be created under `packages/database/supabase/migrations`.

P1 likely requires:

- Project-scoped active document template support, either by adding
  `project_id` to `document_templates` or by a join table that maps a project
  and document type to the active template.
- Generated document versioning, for example a per-lot/template/document-type
  version number and metadata needed to return document id/version to the UI.
- Optional audit/history indexes if `audit_logs` becomes the lot timeline
  source.

P2 likely requires:

- Sale approval classification on `approval_requests` or a compatible approval
  type field.
- Sale-resolution RPC or generalized approval-resolution RPC.
- Structured legal data for escritura variables sourced from uploaded project
  documents and reviewed by admin/lawyer-functional users.

Migration tasks must also regenerate Supabase types and re-run migration
verification.

## Risks

| Risk                                                        | Impact                                      | Mitigation                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Flat backend variables drift from nested frontend variables | Generated PDF/DOCX may not match preview    | Define one `DocumentVariables v1` contract and backend adapter; test snapshot equality          |
| Web and Telegram approvals race                             | Double reservation or confusing admin state | Use existing pending-state lock/RPC pattern; test already-processed outcome                     |
| Service role bypasses RLS                                   | Cross-tenant exposure                       | Require backend/resource-derived tenant validation for every service-role endpoint              |
| Uploaded legal PDFs are stored but not structured           | Escritura cannot be automated reliably      | Treat extraction as assisted/manual review in MVP; store reviewed structured values             |
| Versioning missing in `generated_documents`                 | Regeneration loses legal traceability       | Add explicit version metadata before relying on regenerated documents                           |
| Project-scoped active templates are unclear                 | Wrong template used for a project           | Add explicit project-template mapping/constraint                                                |
| Mobile document UX becomes unusable                         | Pilot users cannot approve/review in field  | Prioritize mobile for approval/reservation and desktop-first with functional mobile for builder |
| Existing dirty/uncommitted repo state                       | Planning artifacts mix with bootstrap work  | Keep plan docs scoped; commit separately when requested                                         |

## Verification Strategy

P1 gates:

- `pnpm verify:migrations`
- `pnpm contracts:generate`
- `pnpm typecheck:web`
- `pnpm test:web`
- `pnpm build:web`
- `pnpm test:api`

Focused tests to add during implementation:

- Geometry upload validation and project readiness.
- Vendor project scoping and unauthorized reservation attempts.
- Reservation request success, duplicate pending request, unavailable lot.
- Telegram approval, web approval, and concurrent double decision.
- Cross-tenant rejection for approval and document generation.
- Variable status for required document variables.
- PDF and DOCX generation with persisted snapshot and version.
- Document history query and lot timeline/audit visibility.
- Responsive smoke checks for vendor reservation and admin approval.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| None      | N/A        | N/A                                  |

## Post-Design Constitution Check

- P1/P2 sequencing still honors Product Pilot First.
- All database deltas are confined to canonical Supabase migrations.
- API changes are planned as OpenAPI contract deltas with generated clients.
- Tenant validation and audit/history are explicit requirements, not optional
  polish.
- Verification commands match root `package.json` and the constitution.
