# Database Contracts: Stabilize Plotify MVP

All database changes must be implemented as migrations under
`packages/database/supabase/migrations` and followed by type regeneration.

## Existing Tables and RPCs Verified

- `approval_requests`
- `audit_logs`
- `document_blocks`
- `document_templates`
- `template_block_items`
- `generated_documents`
- `geometries`
- `lots`
- `lot_records`
- `projects`
- `vendors`
- `vendor_projects`
- `organization_members`
- RPC `approve_reservation`
- RPC `reject_reservation`
- RPC `seed_default_document_blocks`
- RPC `seed_escritura_blocks`

## P1 Migration Contract

### Active Project Template

Problem:

- `document_templates` is organization-scoped.
- The spec requires an active reservation template per project.

Allowed approaches:

1. Add nullable `project_id` to `document_templates` and enforce one active
   template per `project_id + document_type`.
2. Add a mapping table such as project/document type -> template id.

Required invariants:

- A project can have at most one active reservation template.
- P2 extends the same invariant to escritura.
- Existing organization defaults can still seed or copy project templates.

### Generated Document Versioning

Problem:

- `generated_documents` lacks explicit version metadata.

Required fields/invariants:

- Persist a monotonically increasing version per lot/document type/template
  scope.
- Preserve all prior rows.
- Preserve `variables_snapshot` exactly as used.
- Store whether missing variables were accepted by the admin.

### Document Delivery Recipients and Status

Problem:

- The spec requires the admin to choose recipients for approved documents, but
  generated document rows alone do not define recipient choice, delivery status,
  failure reason, or retry metadata.

Required fields/invariants:

- Persist selected recipients for each generated document, at minimum seller and
  buyer recipient roles when applicable.
- Persist delivery status per recipient or delivery attempt.
- A delivery failure must not delete or regenerate the legal document.
- Retry must reference the existing generated document version.

### Audit/History Standardization

Problem:

- `audit_logs` exists but event names/payloads are not standardized for the MVP.

Required event families:

- `reservation.requested`
- `reservation.approved`
- `reservation.rejected`
- `reservation.released`
- `document.generated`
- `document.regenerated`
- `document.sent`
- `document.send_failed`
- `document.send_retried`
- `lot.verified`
- `template.modified`

Required payload fields:

- `lot_id` when event is lot-related
- `project_id` when event is project-related
- `approval_id` when event comes from approval flow
- `document_id` when event comes from generation/send
- `channel` for Telegram/web decisions
- `actor_user_id` or system actor identifier

## P2 Migration Contract

### Sale Approval

Problem:

- `approval_requests` is reservation-oriented.

Required invariant:

- Sale approval must not allow a pending reservation approval and pending sale
  approval to mutate the same lot into inconsistent states.
- A lot can have at most one pending approval request total, regardless of
  whether the request is `reservation` or `sale`.
- A sale request can originate from `disponible` (`sale_mode = direct`) or
  `reservado` (`sale_mode = reserved`) and must capture the prior lot state used
  for rejection semantics and audit.

Allowed approaches:

1. Extend `approval_requests` with a request type and sale-specific payload.
2. Add a sale-specific approval table if overloading creates unclear constraints.

Required RPC behavior:

- Lock approval row.
- Lock lot row.
- Validate current lot state is still compatible with the captured sale origin:
  `disponible` for direct sale or `reservado` for reserved sale.
- Write `lot_records`.
- Update lot state and timestamps.
- Write audit/history.
- Reject sale without mutating the lot, preserving the prior commercial state.
- Run only through trusted service-role execution or validate admin membership
  for the approval's organization inside the RPC before mutation.
- Return already-processed or invalid-state errors without partial mutation.

### Project Legal Data

Problem:

- Project PDF fields exist, but structured legal values for escritura do not.

Required model:

- Store reviewed legal variables by project and source document.
- Track review status, reviewer, and review timestamp.
- Keep links to source project document fields or storage paths.
- Support dominio vigente, roles, SAG/subdivision, plano oficial, matriz, and
  personeria values needed by `DocumentVariables v1`.

## Verification Commands

```bash
pnpm verify:migrations
pnpm contracts:generate
pnpm typecheck:web
pnpm test:web
pnpm test:api
```
