from pydantic import BaseModel
from typing import Optional, Dict, Any


class MessageJobPayload(BaseModel):
    """Payload encolado en Redis para ser procesado por el worker."""

    platform: str  # "whatsapp" o "telegram"
    phone_id: str  # Número de teléfono o Chat ID
    vendor_id: Optional[str] = None  # Si conocemos el número de vendor de WhatsApp
    organization_id: Optional[str] = None  # ID Inmobiliaria dueña del Webhook Destino
    message_text: str
    message_id: str
    raw_payload: Dict[str, Any]
