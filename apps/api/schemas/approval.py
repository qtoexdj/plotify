from pydantic import BaseModel, Field
from typing import Optional, Literal
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


class SalePayload(BaseModel):
    """Datos del cliente y la operación de venta, almacenados como JSONB."""

    cliente_nombre: str = Field(..., min_length=2)
    cliente_run: str = Field(..., min_length=7)
    valor_final: float = Field(..., gt=0)
    notaria: Optional[str] = None
    fecha_firma: Optional[date] = None


class SaleRequest(BaseModel):
    """Payload completo que envía el Frontend para solicitar una venta."""

    lot_id: str
    organization_id: str
    vendor_id: str
    vendor_name: str
    vendor_phone: str
    vendor_platform: str = Field(..., pattern=r"^(telegram|whatsapp)$")
    payload: SalePayload
    sale_mode: Optional[Literal["direct", "reserved"]] = None
    previous_lot_state: Optional[Literal["disponible", "reservado"]] = None


class ReservationResponse(BaseModel):
    """Respuesta del endpoint al Frontend."""

    approval_id: str
    status: str = "pending"
    message: str = "Solicitud enviada al administrador."


class DecisionResponse(BaseModel):
    """Respuesta a una decisión del administrador."""

    success: bool
    error: Optional[str] = None


class ApprovalRequestDetailResponse(BaseModel):
    """Detalle completo de una solicitud de aprobación de reserva o venta."""

    id: str
    lot_id: str
    organization_id: str
    vendor_id: str
    vendor_name: str
    vendor_phone: Optional[str] = None
    vendor_platform: str
    status: str
    created_at: str
    payload: dict
    request_type: str = "reservation"
