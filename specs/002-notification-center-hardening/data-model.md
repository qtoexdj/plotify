# Data Model: Notification Center Hardening

## ApprovalRequest

Represents the canonical commercial approval request.

**Fields**:

- `id`: unique request identifier.
- `organization_id`: organization that owns the request.
- `lot_id`: lot being reserved or sold.
- `vendor_id`: vendor associated with the request.
- `request_type`: reservation or sale.
- `sale_mode`: direct sale or sale after reservation, when applicable.
- `status`: pending, approved, or rejected.
- `payload`: client and operation details.
- `created_at`: request creation timestamp.
- `decided_at`: final decision timestamp, when decided.
- `decided_by`: actor that made the final decision.
- `decision_channel`: web or Telegram.

**Relationships**:

- Belongs to one organization.
- Belongs to one lot and indirectly one project.
- Belongs to one vendor.
- May have many notification events.

**Validation Rules**:

- Only one pending approval may exist for the same lot.
- Status transitions are pending to approved or pending to rejected.
- Approved/rejected requests cannot be decided again.
- Organization must be derived or validated against persisted resources.

## NotificationEvent

Represents recipient-specific notification metadata for an approval request or
notification-worthy approval outcome.

**Fields**:

- `id`: unique notification event identifier.
- `organization_id`: owning organization.
- `recipient_user_id`: user intended to see the notification.
- `recipient_role`: admin or vendor.
- `entity_type`: approval request for this feature.
- `entity_id`: referenced approval request.
- `notification_type`: pending approval, approved outcome, rejected outcome,
  delivery failure, or security event.
- `priority`: normal or high.
- `created_at`: event creation timestamp.
- `read_at`: when recipient read the item, if applicable.
- `dismissed_at`: when recipient dismissed the item, if applicable.
- `delivery_channel`: web, Telegram, or system.
- `delivery_status`: pending, sent, failed, or not required.
- `delivery_error`: failure reason when delivery fails.

**Relationships**:

- Belongs to one organization.
- Belongs to one recipient user.
- References one approval request when entity type is approval request.

**Validation Rules**:

- Recipient must belong to the organization.
- Vendor recipients must match the approval request vendor user.
- Admin recipients must hold admin role in the organization at event creation or
  read time.
- Notification status never overrides approval request status.

## NotificationItem

Role-scoped read model used by web and Telegram responses.

**Fields**:

- `id`: stable item id.
- `approval_id`: approval request id.
- `organization_id`: owning organization.
- `request_type`: reservation or sale.
- `status`: pending, approved, or rejected.
- `lot_label`: human-readable lot identifier.
- `project_name`: project name.
- `client_name`: client name when visible to the role.
- `vendor_name`: vendor name when visible to the role.
- `created_at`: request creation timestamp.
- `decided_at`: decision timestamp when applicable.
- `can_decide`: true only for authorized admins and pending requests.
- `read_at`: recipient read timestamp when persisted.

**Validation Rules**:

- Admin read model includes organization pending approvals and relevant recent
  outcomes.
- Vendor read model includes only approval requests linked to that vendor.
- Decision controls are never present for vendor items.

## TelegramActor

Resolved identity for a Telegram sender.

**Fields**:

- `telegram_chat_id`: Telegram chat id from incoming message or callback.
- `profile_id`: linked application profile.
- `organization_id`: organization routed by the bot/webhook.
- `role`: admin, vendor, lead, or unknown.
- `vendor_id`: vendor id when role is vendor.
- `is_authorized`: whether actor can perform the requested operation.

**Validation Rules**:

- Admin decision callbacks require role admin for the routed organization.
- Vendor command responses require a linked active vendor in the routed
  organization.
- Unknown or unlinked actors receive safe guidance and no protected data.

## DocumentationShortcut

Approved help target returned to vendors from Telegram.

**Fields**:

- `id`: shortcut identifier.
- `audience`: vendor or admin.
- `title`: display title.
- `url`: safe help/documentation link.
- `description`: short description shown in Telegram or web.
- `active`: whether shortcut can be shown.

**Validation Rules**:

- Vendor shortcuts must not expose internal product memory.
- Inactive shortcuts are not returned.
- If no shortcut is configured, Telegram returns a short safe help message.
