"""
Módulo de Auditoría del Sistema.
Registra acciones críticas del Agente AI en una tabla de base de datos
compartida con el frontend (M3.2).
"""

import asyncio
from core.database import get_supabase_client
from core.logger import get_logger

logger = get_logger(__name__)


# Familias de eventos de auditoría estandarizadas para el MVP de Plotify
EVENT_RESERVATION_REQUESTED = "reservation.requested"
EVENT_RESERVATION_APPROVED = "reservation.approved"
EVENT_RESERVATION_REJECTED = "reservation.rejected"
EVENT_RESERVATION_RELEASED = "reservation.released"
EVENT_DOCUMENT_GENERATED = "document.generated"
EVENT_DOCUMENT_REGENERATED = "document.regenerated"
EVENT_DOCUMENT_SENT = "document.sent"
EVENT_DOCUMENT_SEND_FAILED = "document.send_failed"
EVENT_DOCUMENT_SEND_RETRIED = "document.send_retried"
EVENT_LOT_VERIFIED = "lot.verified"
EVENT_TEMPLATE_MODIFIED = "template.modified"


async def log_agent_action(
    actor: str,
    action: str,
    entity: str,
    entity_id: str,
    organization_id: str,
    payload: dict | None = None,
) -> None:
    """
    Guarda de forma asíncrona un evento de auditoría en la tabla `audit_logs`.
    Usado por herramientas o endpoints para mantener trazabilidad.

    El payload debe estructurarse usando las siguientes claves canónicas cuando aplique:
    - lot_id: UUID del lote si el evento se relaciona con un lote.
    - project_id: UUID del proyecto si el evento se relaciona con un proyecto.
    - approval_id: UUID de la solicitud si viene del flujo de aprobaciones.
    - document_id: UUID del documento generado si viene de generación/envío.
    - channel: "telegram" o "web" para decisiones y flujos concurrentes.
    - actor_user_id: UUID del usuario si es un actor humano.

    Args:
        actor: Quien realiza la acción (Ej: "ai_agent" o "system")
        action: Qué hizo (Ej: "reservation.requested", etc.)
        entity: Sobre qué entidad actuó (Ej: "lots", "message")
        entity_id: ID o referencia de la entidad ("1", "Lote-A1")
        organization_id: UUID de la organización asociada (Multi-tenant).
        payload: Metadata adicional útil en formato dict.
    """
    if not payload:
        payload = {}

    def _sync_insert():
        try:
            supabase = get_supabase_client()
            supabase.table("audit_logs").insert(
                {
                    "actor": actor,
                    "action": action,
                    "entity": entity,
                    "entity_id": str(entity_id),
                    "organization_id": str(organization_id) if organization_id is not None else None,
                    "payload": payload,
                }
            ).execute()
        except Exception as e:
            logger.error("Error guardando log de auditoría", error=str(e))

    # Ejecutar guardado sin bloquear el event loop principal de LangGraph
    await asyncio.to_thread(_sync_insert)
