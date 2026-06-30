"""
Herramienta LangGraph: requisitos y datos bancarios para reserva de lotes.

IMPORTANTE (M1.4/M1.5):
- Filtrado por organization_id para aislamiento multi-tenant.
- Los datos bancarios se leen desde la tabla organization_payment_info
  en lugar de estar hardcodeados en el código.
"""

import asyncio
from typing import Optional

from fastapi import HTTPException
from langchain_core.tools import tool

from agent.skill_registry import register_builtin
from core.database import get_supabase_client
from core.logger import get_logger
from utils.audit import log_agent_action

logger = get_logger(__name__)


def _pending_message(message: str) -> str:
    return f"PENDING: {message}"


def _blocked_message(message: str) -> str:
    return f"BLOCKED: {message}"


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
    - organization_id (inyectado por runtime): ID confiable de la organización.
    - numero_lote (opcional): número exacto del lote que el cliente desea reservar.
    """
    organization_id = str(organization_id or "").strip()
    if not organization_id:
        logger.error("get_reservation_requirements llamada sin organization_id")
        return _blocked_message(
            "se requiere organization_id confiable para obtener los datos de reserva."
        )

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
                return _blocked_message(
                    f"No encontre el lote {numero_lote} para esta organizacion."
                )

            lot = lots[0]
            if lot.get("estado") != "disponible":
                return _blocked_message(
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

                return _pending_message(
                    f"{payment_info}\n\n"
                    f"El valor de reserva exacto para el Lote {numero_lote} es de {val_pesos}. "
                    "La reserva queda pendiente hasta que se cree una solicitud y el administrador la revise."
                )
            else:
                return _blocked_message(
                    f"{payment_info}\n\n"
                    f"El valor de reserva para el Lote {numero_lote} aún no está fijado "
                    f"en el sistema. Contáctese con un ejecutivo humano."
                )

        return _pending_message(
            f"{payment_info}\n\n"
            "El valor de reserva exacto depende del lote. "
            "Sugiere que el cliente elija un lote primero para darte el monto preciso; "
            "cualquier reserva posterior queda pendiente de aprobacion."
        )

    except Exception as e:
        logger.error(
            "Error en get_reservation_requirements",
            organization_id=organization_id,
            error=str(e),
        )
        return _blocked_message(
            f"Ocurrió un error consultando requisitos de reserva: {str(e)}"
        )


@register_builtin("request_reservation_intent")
@tool
async def request_reservation_intent(
    organization_id: str,
    vendor_id: str,
    lot_id: str,
    cliente_nombre: str,
    cliente_run: str,
    valor_reserva: float,
    vendor_name: Optional[str] = None,
    vendor_phone: Optional[str] = None,
    vendor_platform: str = "telegram",
    notaria: Optional[str] = None,
    fecha_firma: Optional[str] = None,
) -> str:
    """Crea una solicitud de reserva pendiente para revisión humana.
    Argumentos:
    - organization_id (inyectado por runtime): ID confiable de la organización.
    - vendor_id (inyectado por runtime): vendedor confiable vinculado al canal.
    - lot_id: ID exacto del lote que el cliente quiere reservar.
    - cliente_nombre: nombre del comprador.
    - cliente_run: RUN del comprador.
    - valor_reserva: monto de la reserva.
    - vendor_name/vendor_phone/vendor_platform: datos operativos del canal.
    """
    organization_id = str(organization_id or "").strip()
    vendor_id = str(vendor_id or "").strip()
    lot_id = str(lot_id or "").strip()
    vendor_platform = str(vendor_platform or "telegram").strip().lower()

    if not organization_id:
        return _blocked_message("falta organization_id confiable.")
    if not vendor_id:
        return _blocked_message("la reserva requiere un vendedor vinculado.")
    if not lot_id:
        return _blocked_message("falta el ID del lote a reservar.")
    if vendor_platform not in {"telegram", "whatsapp"}:
        return _blocked_message("el canal del vendedor no está soportado.")

    try:
        from api.v1.endpoints.approvals import request_reservation
        from core.redis import get_arq_pool
        from schemas.approval import ReservationPayload, ReservationRequest

        payload_obj = ReservationPayload(
            cliente_nombre=cliente_nombre,
            cliente_run=cliente_run,
            valor_reserva=valor_reserva,
            notaria=notaria,
            fecha_firma=fecha_firma,
        )
        body = ReservationRequest(
            lot_id=lot_id,
            organization_id=organization_id,
            vendor_id=vendor_id,
            vendor_name=vendor_name or "Vendedor",
            vendor_phone=vendor_phone or "",
            vendor_platform=vendor_platform,
            payload=payload_obj,
        )
        redis = await get_arq_pool()
        response = await request_reservation(body, redis=redis)
        status = getattr(response, "status", "pending")
        approval_id = getattr(response, "approval_id", "")
        if status != "pending" or not approval_id:
            logger.warning(
                "request_reservation_intent_unexpected_status",
                organization_id=organization_id,
                vendor_id=vendor_id,
                lot_id=lot_id,
                status=status,
            )
            return _blocked_message(
                "la solicitud de reserva no quedo pendiente de revision."
            )

        return _pending_message(
            "Solicitud de reserva enviada al administrador. "
            f"approval_id={approval_id}. No está aprobada todavía."
        )
    except HTTPException as exc:
        detail = (
            exc.detail
            if isinstance(exc.detail, str)
            else "regla operacional bloqueada"
        )
        logger.info(
            "request_reservation_intent_blocked",
            organization_id=organization_id,
            vendor_id=vendor_id,
            lot_id=lot_id,
            status_code=exc.status_code,
            detail=detail,
        )
        return _blocked_message(str(detail))
    except Exception as exc:
        logger.error(
            "request_reservation_intent_failed",
            organization_id=organization_id,
            vendor_id=vendor_id,
            lot_id=lot_id,
            error=str(exc),
        )
        return _blocked_message(
            "no fue posible crear la solicitud de reserva en este momento."
        )
