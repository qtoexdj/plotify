# Notification Contracts

## Web Notification List

### Request

Authenticated user asks for notification items in the active organization
context.

### Response

```json
{
  "items": [
    {
      "id": "notification-or-approval-id",
      "approval_id": "approval-request-id",
      "request_type": "reservation",
      "status": "pending",
      "project_name": "Proyecto Los Castaños",
      "lot_label": "Lote 12",
      "client_name": "María Pérez",
      "vendor_name": "Juan Vendedor",
      "created_at": "2026-05-29T15:00:00Z",
      "decided_at": null,
      "can_decide": true,
      "read_at": null
    }
  ],
  "counts": {
    "pending": 1,
    "approved": 0,
    "rejected": 0,
    "unread": 1
  }
}
```

### Rules

- Admin response includes organization-scoped pending approvals and recent
  outcomes relevant to the organization.
- Vendor response includes only requests associated with that vendor.
- `can_decide` is true only for authorized admins and pending requests.
- Super-admin behavior is out of scope for this feature.

## Mark Notification Read

### Request

```json
{
  "notification_id": "notification-event-id"
}
```

### Response

```json
{
  "success": true,
  "read_at": "2026-05-29T15:01:00Z"
}
```

### Rules

- A user can mark only their own notification records as read.
- Marking read never changes approval status.

## Decide Approval From Notification

### Request

```json
{
  "approval_id": "approval-request-id",
  "action": "approve"
}
```

### Response

```json
{
  "success": true,
  "status": "approved"
}
```

### Already Processed Response

```json
{
  "success": false,
  "code": "already_processed",
  "message": "This request was already processed."
}
```

### Rules

- Only organization admins can decide.
- Decisions use the same business rules as existing reservation/sale approvals.
- First valid decision wins across all channels.
