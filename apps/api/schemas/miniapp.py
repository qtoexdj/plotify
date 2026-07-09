import uuid
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


# --- AUTH SCHEMAS ---

class MiniappSessionRequest(BaseModel):
    """Solicitud de sesión de mini app validando initData."""
    org_id: uuid.UUID
    init_data: str


class MiniappUserDetail(BaseModel):
    """Detalle del usuario dentro de la sesión."""
    id: uuid.UUID
    nombre: str
    org_id: uuid.UUID
    org_nombre: str


class MiniappSessionResponse(BaseModel):
    """Respuesta con token firmado de sesión."""
    token: str
    expires_in: int
    role: str
    user: MiniappUserDetail


class MiniappVincularSolicitarRequest(BaseModel):
    """Solicitud para generar un código OTP de vinculación y enviarlo por Telegram."""
    email: str
    chat_id: int
    org_id: uuid.UUID


class MiniappVincularConfirmarRequest(BaseModel):
    """Confirmación del código OTP para vincular la cuenta de Telegram con el perfil."""
    email: str
    chat_id: int
    org_id: uuid.UUID
    code: str



# --- BANDEJA ADMIN SCHEMAS (US2) ---

class DiscrepanciaVariable(BaseModel):
    """Detalle de una diferencia de variables lado a lado."""
    nombre: str
    valor_certificado: str
    valor_vendedor: str
    diferencia_detectada: str


class BandejaItem(BaseModel):
    """Item resumido para la lista unificada del administrador."""
    id: uuid.UUID
    tipo: str  # "reserva" | "excepcion"
    titulo: str
    causa: str
    antiguedad_segundos: int
    estado: str


class BandejaDetail(BaseModel):
    """Detalle de un caso o reserva pendiente en la bandeja admin."""
    id: uuid.UUID
    tipo: str  # "reserva" | "excepcion"
    titulo: str
    estado: str
    causa: str
    antiguedad_segundos: int
    detalles_lote: Optional[Dict[str, Any]] = None
    comprador: Optional[Dict[str, Any]] = None
    conflictos: Optional[List[DiscrepanciaVariable]] = None
    evidencia_url: Optional[str] = None


class AdminDecisionRequest(BaseModel):
    """Acción de decisión del administrador (aprobar o rechazar)."""
    decision: str = Field(..., pattern="^(approve|reject)$")
    comentario: Optional[str] = None


# --- VENDEDOR SCHEMAS (US3, US4) ---

class VentaItem(BaseModel):
    """Progreso de venta para la lista del vendedor."""
    case_id: uuid.UUID
    lote_nombre: str
    etapa: str  # "venta" | "validacion" | "revision" | "minuta"
    blockers: List[str]
    updated_at: str


class DocumentoItem(BaseModel):
    """Minuta entregada con link de descarga firmado."""
    delivery_id: uuid.UUID
    nombre_archivo: str
    tipo: str
    url_descarga: str
    vence_en_segundos: int
    estado: str  # "vigente" | "vencido"


# --- RESERVA SCHEMAS (US5) ---

class MiniappReservaComprador(BaseModel):
    """Datos estructurados del comprador para la reserva."""
    nombre: str = Field(..., min_length=3)
    rut: str = Field(..., min_length=7)  # Validado por servidor módulo 11
    telefono: str
    email: str = Field(..., pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


class MiniappReservaRequest(BaseModel):
    """Solicitud estructurada para crear una reserva."""
    idempotency_key: uuid.UUID
    lot_id: uuid.UUID
    comprador: MiniappReservaComprador
    nota: Optional[str] = None


class MiniappReservaResponse(BaseModel):
    """Respuesta tras procesar la solicitud de reserva."""
    approval_id: uuid.UUID
    estado: str
