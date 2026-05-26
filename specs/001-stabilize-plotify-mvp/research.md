# Research: Stabilize Plotify MVP

## Decision: Use Existing Monorepo Boundaries

**Decision**: Keep `apps/web`, `apps/api`, `packages/database`, and
`packages/contracts` as the implementation boundaries.

**Rationale**: The repo and memory agree this migration is already complete.
`package.json` exposes canonical commands and CodeGraph confirms the app/API
split. Changing structure would add risk without helping the MVP.

**Alternatives considered**:

- Split feature work into separate repos: rejected because contracts, database,
  and document generation cross boundaries.
- Move FastAPI/LangGraph to TypeScript: rejected by ADR-008 and current tests.

## Decision: P1 Uses Existing Reservation Approval Pipeline

**Decision**: Use `approval_requests`, `/api/v1/approvals/request-reservation`,
`notify_admin_approval`, Telegram callbacks, and `approve_reservation` /
`reject_reservation` as the P1 reservation pipeline.

**Rationale**: The code already creates approval requests, enqueues Telegram
notifications, handles inline callback decisions, and resolves reservation with
a locked database RPC. This matches the spec's first-decision-wins behavior.

**Alternatives considered**:

- Build a new notification system first: rejected for P1; pending
  `approval_requests` can power admin web notifications.
- Keep direct reserve-only flow: rejected because the spec requires admin
  approval from Telegram or web.

## Decision: Add Web Approval Over the Same Reservation Resolution Model

**Decision**: Add a web admin approval path that verifies admin membership and
uses the same reservation resolution semantics as Telegram.

**Rationale**: The spec requires admin can approve from Telegram or frontend.
The current Telegram path is present, but there is no verified web admin
decision path in the surfaced code. Reusing the same resolution model reduces
race risk.

**Alternatives considered**:

- Let frontend call RPC directly without an admin verification layer: rejected
  because the constitution requires tenant and permission validation.
- Duplicate web-only mutation logic: rejected because it risks divergent states.

## Decision: Use `audit_logs` as the P1 Traceability Base

**Decision**: Standardize audit/history events on existing `audit_logs` for P1,
with lot/document entity references and structured payloads. Add a dedicated
lot timeline table only if implementation proves the query/model is insufficient.

**Rationale**: `audit_logs` already exists and is part of the constitution. It
can answer the user's audit question: who did what, when, to which lot/document,
with what outcome.

**Alternatives considered**:

- Create `lot_events` immediately: deferred to avoid adding schema before the
  existing audit model is exhausted.
- Use only implicit records (`approval_requests`, `generated_documents`): rejected
  because commercial/legal changes need a unified trace.

## Decision: Define One Canonical `DocumentVariables v1`

**Decision**: Create a shared canonical document variable contract and adapt the
backend resolver to it. Keep compatibility adapters for current flat variables
while moving reserve/escritura templates to nested keys.

**Rationale**: CodeGraph and file reads show frontend `EscrituraVariables` is
nested, while backend `resolve_variables` returns flat keys such as
`cliente_nombre` and `numero_lote`. The spec requires variables from project,
lot, buyer, geometry, and uploaded documents. Without one contract, preview and
generated PDF/DOCX can diverge.

**Alternatives considered**:

- Keep local frontend preview as source of truth: rejected because final
  documents are generated in the backend.
- Keep backend flat keys only: rejected because product memory accepts nested
  canonical variables and current frontend already models them.

## Decision: Backend Determines Missing Variables Before Final Generation

**Decision**: Missing-variable detection must run against the backend-rendered
template/block set and canonical variables before generating PDF/DOCX.

**Rationale**: The spec lets admins block generation or explicitly generate with
spaces in blanks. Since final rendering is backend-owned, backend variable status
is the authoritative source.

**Alternatives considered**:

- Frontend-only missing-variable checks: rejected because they can disagree with
  backend Jinja2 rendering.
- Generate always with placeholders: rejected by UX/legal traceability.

## Decision: Add Project-Scoped Active Templates

**Decision**: Model an active reservation/escritura template per project.

**Rationale**: Current `document_templates` is organization-scoped with
`is_default`; spec and memory require a unique active project template for
reservation and escritura. This needs schema support or a mapping table.

**Alternatives considered**:

- Use only one organization default template: rejected because projects can need
  different legal wording and variables.
- Infer active template from latest created template: rejected because it is not
  auditable or explicit.

## Decision: Version Generated Documents Explicitly

**Decision**: Add explicit generated-document version metadata before accepting
regeneration as MVP-complete.

**Rationale**: Current `generated_documents` stores snapshot, template, file URL,
format, and lot, but no explicit version. The spec requires version 1, version 2
style traceability.

**Alternatives considered**:

- Treat `created_at` ordering as version: rejected because it is fragile and not
  user-facing enough for legal traceability.

## Decision: Legal Document Uploads Are Sources, Not Automatic Truth

**Decision**: Uploaded project documents should feed escritura variables through
reviewed structured values. Full automatic extraction is not required for P2
pilot closure.

**Rationale**: Current code stores project PDFs (`doc_dominio_vigente`,
`doc_roles`, `doc_subdivision`, `doc_plano_oficial`, etc.) but does not extract
structured legal data. The spec asks to use these documents, but the safe MVP
path is human review before final escritura generation.

**Alternatives considered**:

- Full automatic PDF extraction: deferred because it is high-risk and not needed
  to validate the pilot.
- Ignore uploaded documents: rejected because escritura variables depend on
  legal source documents.

## Decision: Supabase Generated Types Remain Required After Schema Changes

**Decision**: After every database migration, regenerate database types and keep
TypeScript consumers typed against `packages/database/types/database.generated.ts`.

**Rationale**: Context7 Supabase docs confirm generated TypeScript types expose
Row/Insert/Update contracts from the actual schema and support generation from a
database URL. The repo already uses this pattern and `README.md` defines the
canonical generated type path.

**Alternatives considered**:

- Manually edit generated types: rejected by project conventions.
- Delay generated types until the end: rejected because frontend work depends on
  accurate schema contracts.

## Decision: Do Not Use Context7 for Existing Code Paths Without New API Syntax

**Decision**: Use repository source and CodeGraph for Next.js, React, FastAPI,
LangGraph, Tailwind, and shadcn planning unless implementation later introduces
new library syntax or migration steps requiring current external documentation.

**Rationale**: The user asked not to invent APIs, tables, schemas, or commands.
For this plan, the exact commands, versions, endpoints, and components are
verified locally. Context7 was used where current Supabase type/migration
guidance matters for planned schema changes.

**Alternatives considered**:

- Fetch docs for every listed framework now: rejected because this plan does not
  introduce framework-specific syntax and the project has local versioned code.
