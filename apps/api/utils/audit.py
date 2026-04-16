"""
Módulo de Auditoría del Sistema.
Registra acciones críticas del Agente AI en una tabla de base de datos
compartida con el frontend (M3.2).
"""

import asyncio
from core.database import get_supabase_client
from core.logger import get_logger

logger = get_logger(__name__)


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

    Args:
        actor: Quien realiza la acción (Ej: "ai_agent" o "system")
        action: Qué hizo (Ej: "REQUEST_RESERVATION_INFO", "REJECT_LEAD")
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
                    "organization_id": str(organization_id),
                    "payload": payload,
                }
            ).execute()
        except Exception as e:
            logger.error("Error guardando log de auditoría", error=str(e))

    # Ejecutar guardado sin bloquear el event loop principal de LangGraph
    await asyncio.to_thread(_sync_insert)
