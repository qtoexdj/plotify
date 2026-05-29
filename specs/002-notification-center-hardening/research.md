# Research: Notification Center Hardening

## Decision: Approval requests remain the commercial source of truth

**Rationale**: Reservation and sale state already flow through approval
requests, RPC-backed decisions, lot mutations, and audit events. Duplicating
approval status in a separate notification table would create drift risk.

**Alternatives considered**:

- Store full approval state in notifications: rejected because it duplicates
  reservation/sale state and weakens first-decision-wins semantics.
- Query only approval requests forever: rejected for production because header
  read/dismiss state, per-recipient delivery failures, and notification-specific
  audit are hard to model cleanly.

## Decision: Add notification records only for recipient/read/delivery metadata

**Rationale**: A production notification center needs user-specific read state,
delivery status, and failure metadata. Those concerns are not the same as
approval state. A lightweight event/recipient layer can reference approval
requests without becoming the business source of truth.

**Alternatives considered**:

- No notification persistence: simpler, but insufficient for production
  unread/read behavior and delivery observability.
- Full notification aggregate with duplicated payload snapshots: useful later,
  but too broad for this feature unless compliance requirements demand immutable
  notification snapshots.

## Decision: Header list and dashboard status must be role-scoped

**Rationale**: Admins need organization-wide pending approvals; vendors need
their own request statuses. Mixing those views risks exposing client, lot, or
vendor information across roles.

**Alternatives considered**:

- One generic list filtered client-side: rejected because production role
  boundaries must be enforced before data reaches the browser.
- Separate admin and vendor pages only: rejected because the user specifically
  wants a header icon and list.

## Decision: Telegram commands are deterministic handlers before conversational AI

**Rationale**: Commands such as `/pendientes`, `/aprobadas`, `/rechazadas`, and
`/docs` represent operational queries and must be reliable, auditable, and
role-scoped. They should not depend on LLM interpretation.

**Alternatives considered**:

- Let the existing agent answer commands: rejected because it is less
  deterministic and harder to audit for authorization-sensitive workflows.
- Create a separate Telegram bot: rejected because the project already supports
  organization-scoped Telegram bots.

## Decision: Telegram callbacks must validate linked user admin membership

**Rationale**: Telegram chat ids are not authorization by themselves. A callback
must resolve the linked profile and organization membership before approving or
rejecting a commercial request.

**Alternatives considered**:

- Trust the original admin notification recipient: rejected because buttons can
  be forwarded, stale, or pressed from unexpected clients.
- Validate only organization id in the webhook path: rejected because the
  actor's role is what authorizes the decision.

## Decision: Vendor documentation shortcut must point to approved help content

**Rationale**: Internal project memory contains architecture and product notes
that are not appropriate as vendor-facing documentation. The `/docs` command
should link to a curated help page or safe document.

**Alternatives considered**:

- Link directly to internal memory files: rejected because they contain
  implementation and operational context.
- Return a long help text in Telegram only: useful as fallback, but less
  maintainable than a versioned help surface.
