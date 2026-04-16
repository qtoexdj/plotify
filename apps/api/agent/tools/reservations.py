"""
Herramienta LangGraph: requisitos y datos bancarios para reserva de lotes.

IMPORTANTE (M1.4/M1.5):
- Filtrado por organization_id para aislamiento multi-tenant.
- Los datos bancarios se leen desde la tabla organization_payment_info
  en lugar de estar hardcodeados en el código.
"""

from langchain_core.tools import tool
from core.database import get_supabase_client
from core.logger import get_logger
from agent.skill_registry import register_builtin
from typing import Optional
import asyncio

from utils.audit import log_agent_action

logger = get_logger(__name__)


async def _get_payment_info(organization_id: str) -> str:
    """
    Obtiene los datos bancarios de la organización desde Supabase.
    Retorna un string formateado listo para incluir en el prompt del agente.
    """
    try:

        def _fetch():
            supabase = get_supabase_client()
            return (
                supabase.table("organization_payment_info")
                .select(
                    "razon_social, rut, banco, tipo_cuenta, numero_cuenta, email_transferencia"
                )
                .eq("organization_id", organization_id)
                .limit(1)
                .execute()
            )

        result = await asyncio.to_thread(_fetch)
        if result.data:
            info = result.data[0]
            tipo = info.get("tipo_cuenta", "corriente").capitalize()
            base = (
                f"Para reservar, el cliente debe transferir el valor de la reserva a:\n"
                f"  - Razón Social: {info['razon_social']}\n"
                f"  - RUT: {info['rut']}\n"
                f"  - Banco: {info['banco']}\n"
                f"  - Tipo de cuenta: {tipo}\n"
                f"  - Número de cuenta: {info['numero_cuenta']}"
            )
            if info.get("email_transferencia"):
                base += f"\n  - Email transferencia: {info['email_transferencia']}"
            return base
        # Sin datos configurados
        logger.warning(
            "organization_payment_info no configurada",
            organization_id=organization_id,
        )
        return (
            "Los datos bancarios para la transferencia aún no han sido configurados "
            "por la organización. Indica al cliente que se comunique con un ejecutivo."
        )
    except Exception as e:
        logger.error(
            "Error consultando organization_payment_info",
            organization_id=organization_id,
            error=str(e),
        )
        return "No fue posible obtener los datos bancarios en este momento."


@register_builtin("get_reservation_requirements")
@tool
async def get_reservation_requirements(
    organization_id: str,
    numero_lote: Optional[str] = None,
) -> str:
    """Consulta esta herramienta cuando un cliente demuestre clara intención de comprar o reservar.
    Indica los pasos para transferir la reserva y los datos bancarios de la organización.
    Si se provee `numero_lote`, devuelve el valor de reserva específico de dicho lote.
    Argumentos:
    - organization_id (requerido): ID de la organización para obtener datos bancarios correctos.
    - numero_lote (opcional): número exacto del lote que el cliente desea reservar.
    """
    if not organization_id:
        logger.error("get_reservation_requirements llamada sin organization_id")
        return "Error interno: se requiere organization_id para obtener los datos de reserva."

    # Obtener datos bancarios dinámicamente desde la BD de forma no bloqueante
    payment_info = await _get_payment_info(organization_id)

    try:
        if numero_lote:

            def _fetch_lot():
                supabase = get_supabase_client()
                return (
                    supabase.table("lots")
                    .select("valor_reserva, estado, projects!inner(organization_id)")
                    .eq("numero_lote", str(numero_lote))
                    .eq("projects.organization_id", organization_id)
                    .limit(1)
                    .execute()
                )

            response = await asyncio.to_thread(_fetch_lot)
            lots = response.data

            if not lots:
                return f"No encontré el lote {numero_lote} para esta organización."

            lot = lots[0]
            if lot.get("estado") != "disponible":
                return (
                    f"El lote {numero_lote} no está disponible "
                    f"(estado actual: {lot.get('estado')})."
                )

            valor = lot.get("valor_reserva")
            if valor:
                val_pesos = f"${valor:,.0f}"

                # M3.2 - Registrar en auditoría que el Agente dio requisitos de reserva
                await log_agent_action(
                    actor="ai_agent",
                    action="QUERIED_RESERVATION_REQUIREMENTS",
                    entity="lots",
                    entity_id=str(lot.get("id", numero_lote)),
                    organization_id=organization_id,
                    payload={"numero_lote": numero_lote, "valor": valor},
                )

                return (
                    f"{payment_info}\n\n"
                    f"El valor de reserva exacto para el Lote {numero_lote} es de {val_pesos}."
                )
            else:
                return (
                    f"{payment_info}\n\n"
                    f"El valor de reserva para el Lote {numero_lote} aún no está fijado "
                    f"en el sistema. Contáctese con un ejecutivo humano."
                )

        return (
            f"{payment_info}\n\n"
            "El valor de reserva exacto depende del lote. "
            "Sugiere que el cliente elija un lote primero para darte el monto preciso."
        )

    except Exception as e:
        logger.error(
            "Error en get_reservation_requirements",
            organization_id=organization_id,
            error=str(e),
        )
        return f"Ocurrió un error consultando requisitos de reserva: {str(e)}"
