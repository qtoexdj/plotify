from pydantic import BaseModel, Field
from typing import List, Optional, Literal


# Estructuras básicas del Webhook de WhatsApp Cloud API (Meta)
class MetaText(BaseModel):
    body: str


class MetaMessage(BaseModel):
    id: str
    from_: str = Field(alias="from")
    timestamp: str
    type: Literal[
        "text", "image", "audio", "document", "interactive", "button", "unknown"
    ] = "unknown"
    text: Optional[MetaText] = None
    # Add other types as needed later


class MetaContact(BaseModel):
    profile: dict
    wa_id: str


class MetaValue(BaseModel):
    messaging_product: str
    metadata: dict
    contacts: Optional[List[MetaContact]] = None
    messages: Optional[List[MetaMessage]] = None
    statuses: Optional[List[dict]] = None


class MetaChange(BaseModel):
    value: MetaValue
    field: str


class MetaEntry(BaseModel):
    id: str
    changes: List[MetaChange]


class MetaWebhookPayload(BaseModel):
    object: str
    entry: List[MetaEntry]
