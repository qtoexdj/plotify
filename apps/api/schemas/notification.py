from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class NotificationItem(BaseModel):
    id: str
    approval_id: str
    request_type: str = Field(..., pattern=r"^(reservation|sale)$")
    status: str
    project_name: str
    lot_label: str
    client_name: str
    vendor_name: str
    created_at: str
    decided_at: Optional[str] = None
    can_decide: bool
    read_at: Optional[str] = None

class NotificationCounts(BaseModel):
    pending: int
    approved: int
    rejected: int
    unread: int

class NotificationListResponse(BaseModel):
    items: List[NotificationItem]
    counts: NotificationCounts

class MarkReadRequest(BaseModel):
    notification_id: str

class MarkReadResponse(BaseModel):
    success: bool
    read_at: str

class NotificationDecisionRequest(BaseModel):
    approval_id: str
    action: Literal["approve", "reject"]

class NotificationDecisionResponse(BaseModel):
    success: bool
    status: Optional[str] = None
    error: Optional[str] = None
    code: Optional[str] = None

class TelegramCommandSummary(BaseModel):
    command: str
    recipient_chat_id: str
    recipient_role: Literal["admin", "vendor"]
    status: str
    details: Optional[str] = None
