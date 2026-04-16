from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


class ReservationPayload(BaseModel):
    """Datos del cliente y la operación, almacenados como JSONB."""

    cliente_nombre: str = Field(..., min_length=2)
    cliente_run: str = Field(..., min_length=7)
    valor_reserva: float = Field(..., gt=0)
    notaria: Optional[str] = None
    fecha_firma: Optional[date] = None


class ReservationRequest(BaseModel):
    """Payload completo que envía el Frontend para solicitar una reserva."""

    lot_id: str
    organization_id: str
    vendor_id: str
    vendor_name: str
    vendor_phone: str
    vendor_platform: str = Field(..., pattern=r"^(telegram|whatsapp)$")
    payload: ReservationPayload


class ReservationResponse(BaseModel):
    """Respuesta del endpoint al Frontend."""

    approval_id: str
    status: str = "pending"
    message: str = "Solicitud enviada al administrador."
