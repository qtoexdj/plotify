# Feature Specification: Notification Center Hardening

**Feature Branch**: `002-notification-center-hardening`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Centro de notificaciones productivo para Plotify: icono en header con contador y listado de pendientes; admin ve aprobaciones pendientes de reserva y venta de su organización con acciones; vendedor ve sus solicitudes pendientes, aprobadas y rechazadas; comandos Telegram /pendientes /aprobadas /rechazadas /docs; hardening producción con validación real de admin en callbacks Telegram, webhook secret, auditoría y resolución segura de destinatarios por rol."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Header Notification Center (Priority: P1)

An organization admin or vendor can see a notification icon in the authenticated header, open it, and immediately understand which reservation or sale approval items need attention.

**Why this priority**: The header is the fastest operational entry point. Admins must not rely only on a dashboard panel or Telegram message to notice pending approvals.

**Independent Test**: Can be tested by signing in as an admin and as a vendor, creating reservation and sale approval requests, then verifying the header counter and list match the user's role and organization.

**Acceptance Scenarios**:

1. **Given** an admin has pending reservation and sale approvals in their organization, **When** they open the header notification icon, **Then** they see a counter and a list of those pending approvals with lot, project, client, request type, vendor, age, and decision status.
2. **Given** a vendor has submitted approval requests, **When** they open the header notification icon, **Then** they see only their own requests and can distinguish pending, approved, and rejected outcomes.
3. **Given** a user has no relevant approval notifications, **When** they open the header notification icon, **Then** they see a clear empty state without broken loading or misleading counts.

---

### User Story 2 - Admin Decision From Notifications (Priority: P1)

An organization admin can approve or reject pending reservation and sale requests from the notification list without leaving the current page, while the system prevents duplicate decisions from web and Telegram.

**Why this priority**: Approval speed is a pilot-critical operation, and production behavior must be deterministic when several channels can act on the same request.

**Independent Test**: Can be tested by creating a pending approval, deciding it from the notification list, then attempting to decide the same request from Telegram or another browser session.

**Acceptance Scenarios**:

1. **Given** an admin opens a pending approval notification, **When** they approve it, **Then** the request moves to approved, the lot state changes according to the request type, the notification count updates, and the decision is recorded.
2. **Given** an admin opens a pending approval notification, **When** they reject it, **Then** the request moves to rejected, the lot state remains valid for the request type, the notification count updates, and the decision is recorded.
3. **Given** a request was already decided from Telegram, **When** an admin tries to decide it from the header notification list, **Then** the system reports that it was already processed and does not mutate the lot again.

---

### User Story 3 - Vendor Request Status Visibility (Priority: P1)

A vendor can see whether each reservation or sale request they submitted is pending, approved, or rejected from the header notification list and dashboard context.

**Why this priority**: Vendors need operational feedback without asking admins or searching individual lots.

**Independent Test**: Can be tested by signing in as a vendor, submitting reservation and sale requests, deciding them as admin, then verifying the vendor sees only their own request outcomes.

**Acceptance Scenarios**:

1. **Given** a vendor has a pending reservation request, **When** they open notifications, **Then** the request appears as pending and does not expose admin-only actions.
2. **Given** a vendor request is approved, **When** the vendor opens notifications, **Then** the approved result is visible with enough lot and client context to identify the request.
3. **Given** a vendor request is rejected, **When** the vendor opens notifications, **Then** the rejected result is visible with neutral copy and without implying the lot was reserved or sold.

---

### User Story 4 - Telegram Operations Shortcuts (Priority: P2)

Admins and vendors can use Telegram shortcuts to list relevant approval requests and access vendor-facing documentation.

**Why this priority**: Telegram is already an operational channel. Deterministic shortcuts reduce friction and avoid routing critical operational commands through open-ended chat behavior.

**Independent Test**: Can be tested by linking Telegram accounts for an admin and a vendor, sending the supported commands, and verifying role-scoped responses.

**Acceptance Scenarios**:

1. **Given** a linked admin sends `/pendientes`, **When** the bot responds, **Then** the admin receives pending approvals for their organization with enough context to decide.
2. **Given** a linked vendor sends `/pendientes`, **When** the bot responds, **Then** the vendor receives only their own pending requests and no admin-only actions.
3. **Given** a linked user sends `/aprobadas` or `/rechazadas`, **When** the bot responds, **Then** the user receives a recent role-scoped list of matching requests.
4. **Given** a linked vendor sends `/docs`, **When** the bot responds, **Then** the vendor receives a simple shortcut to the approved vendor documentation or help page.

---

### User Story 5 - Production Security And Auditability (Priority: P1)

Every notification and Telegram approval action respects organization boundaries, validates the actor's role, resolves recipients safely, and leaves an auditable trail.

**Why this priority**: This feature exposes high-impact operational decisions. Production readiness requires reliable authorization, observability, and failure behavior.

**Independent Test**: Can be tested with two organizations, two vendors, an admin, and linked Telegram users by attempting cross-organization reads, unauthorized decisions, stale callbacks, and delivery failures.

**Acceptance Scenarios**:

1. **Given** a Telegram callback is received from a user who is not an admin of the organization, **When** it attempts to approve or reject a request, **Then** the system rejects the action and records the attempt without changing the request or lot.
2. **Given** a notification recipient is resolved for a vendor, **When** the system delivers a Telegram outcome, **Then** it uses the vendor's linked account identity rather than guessing from mutable phone text.
3. **Given** a channel delivery fails, **When** the failure is detected, **Then** the request state remains correct and the failure is visible in logs or audit history for follow-up.

### Edge Cases

- A request is approved from Telegram while the web notification dropdown is open.
- A request is rejected from web while an admin presses an old Telegram approve button.
- A vendor belongs to one organization but sends a command to another organization's bot.
- A user has multiple organization memberships and must only see notifications for the active or routed organization context.
- A vendor is inactive or no longer assigned to the project after submitting an earlier request.
- Telegram is not configured for an organization, but web notifications must still work.
- A request payload is partially missing optional client, notary, or signature-date fields.
- There are more pending notifications than comfortably fit in the header dropdown.
- A user opens the notification list on mobile.
- A documentation shortcut is requested by an unlinked or unauthorized Telegram user.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The authenticated application MUST show a notification icon in the main header for non-super-admin users.
- **FR-002**: The notification icon MUST show a count of actionable pending approval requests relevant to the current user and organization context.
- **FR-003**: The notification list MUST show reservation and sale approval requests with request type, status, project, lot, client, vendor, creation time, and latest decision outcome when applicable.
- **FR-004**: Organization admins MUST see pending reservation and sale approvals for their organization.
- **FR-005**: Organization admins MUST be able to approve or reject pending approvals from the notification list.
- **FR-006**: Vendors MUST see only their own approval requests and MUST NOT see admin-only decision controls.
- **FR-007**: Vendors MUST be able to distinguish pending, approved, and rejected requests from both the header notification list and the dashboard context.
- **FR-008**: The system MUST prevent duplicate decision effects when the same request is decided from more than one channel or session.
- **FR-009**: The notification list MUST update after request creation, approval, rejection, or already-processed outcomes without requiring a full logout/login cycle.
- **FR-010**: Telegram command `/pendientes` MUST return role-scoped pending approvals for linked admins and linked vendors.
- **FR-011**: Telegram commands `/aprobadas` and `/rechazadas` MUST return recent role-scoped decided requests.
- **FR-012**: Telegram command `/docs` MUST return approved vendor-facing documentation or help shortcuts, and MUST avoid exposing internal project memory.
- **FR-013**: Telegram approval callbacks MUST verify that the sender is an authorized admin for the routed organization before a decision is accepted.
- **FR-014**: Telegram webhooks MUST reject or ignore requests that do not satisfy the configured authenticity checks for production operation.
- **FR-015**: Recipient resolution for vendor outcome messages MUST use linked user identity and organization membership before falling back to less reliable contact fields.
- **FR-016**: Every request creation, decision, rejected unauthorized decision, and delivery failure relevant to this feature MUST be auditable with actor, role, organization, channel, request, and outcome context.
- **FR-017**: The notification experience MUST have empty, loading, error, and overflow states that remain usable on desktop and mobile widths.
- **FR-018**: The feature MUST preserve the existing reservation and sale approval business rules: admins approve or reject, vendors request, and no request may bypass human approval.

### Key Entities _(include if feature involves data)_

- **Approval Request**: A reservation or sale approval intent with organization, lot, project, vendor, client payload, request type, status, timestamps, and decision metadata.
- **Notification Item**: A role-scoped view of an approval request or outcome suitable for header and dashboard display.
- **Actor**: The authenticated or linked user performing an action, including their role, organization context, and communication channel.
- **Telegram Command Response**: A role-scoped response to a supported Telegram shortcut, containing either approval summaries, available actions, or documentation links.
- **Audit Event**: A durable record of request creation, decision, unauthorized attempt, delivery failure, or notification-relevant operational event.
- **Documentation Shortcut**: A safe link or message that points a vendor to approved product documentation, onboarding guidance, or help content.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An admin with at least one pending approval can identify and open the pending approval list from the header in under 10 seconds.
- **SC-002**: Header pending counts match the user's role-scoped pending approval list in 100% of tested admin and vendor scenarios.
- **SC-003**: A web decision and a Telegram decision racing on the same request produce exactly one final request outcome and no duplicate lot mutation.
- **SC-004**: A vendor can confirm whether a submitted request is pending, approved, or rejected without navigating to an individual lot.
- **SC-005**: Linked Telegram admins and vendors receive correct `/pendientes`, `/aprobadas`, `/rechazadas`, and `/docs` responses in role-scoped tests.
- **SC-006**: Cross-organization notification reads and Telegram decisions are rejected in all tenant isolation tests.
- **SC-007**: Unauthorized Telegram approval attempts leave no request or lot mutation and produce an auditable security event.
- **SC-008**: The header notification dropdown remains readable and operable at mobile and desktop viewport sizes for the documented pilot workflows.

## Assumptions

- The feature will build on the existing human approval model for reservation and sale requests.
- The active organization context determines what an admin can see in the web application.
- Vendors have or can be linked to a user profile for reliable web and Telegram identity resolution.
- Vendor-facing documentation will be exposed through an approved help route or public-safe document, not through internal repository memory.
- Recent decided request lists in Telegram may be bounded to a practical window or count to keep messages readable.
- Super-admin notification behavior is out of scope for this feature unless added explicitly later.
- WhatsApp command parity is out of scope for this feature; the production hardening focuses on web and Telegram.
