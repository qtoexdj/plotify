from core.logger import get_logger
from core.database import get_supabase_client
from integrations.telegram_client import get_telegram_client_for_org
from integrations.meta_client import meta_client
from utils.audit import (
    log_agent_action,
    EVENT_RESERVATION_APPROVED,
    EVENT_RESERVATION_REJECTED,
    EVENT_SALE_APPROVED,
    EVENT_SALE_REJECTED,
)

logger = get_logger(__name__)


async def process_admin_decision(
    ctx: dict, org_id: str, approval_id: str, action: str, admin_id: str
) -> str:
    """
    Job ARQ: Procesa la decisión del Admin (aprobar/rechazar).
    Llama a la función RPC atómica en Supabase y notifica al vendedor.
    """
    try:
        supabase = get_supabase_client()
        telegram_client = await get_telegram_client_for_org(org_id)

        # Validar tenant de la solicitud de aprobación (cross-tenant safety)
        check_res = (
            supabase.table("approval_requests")
            .select("organization_id, request_type, sale_mode, previous_lot_state")
            .eq("id", approval_id)
            .limit(1)
            .execute()
        )
        if not check_res.data:
            logger.error("Solicitud de aprobación no encontrada en el worker.", approval_id=approval_id)
            return "NOT_FOUND"

        db_org_id = check_res.data[0].get("organization_id")
        request_type = check_res.data[0].get("request_type", "reservation")
        if str(db_org_id) != str(org_id):
            logger.error(
                "Brecha cross-tenant detectada en worker: org_id de la solicitud no coincide con el contexto del canal.",
                expected_org=db_org_id,
                actual_org=org_id,
                approval_id=approval_id,
            )
            return "TENANT_MISMATCH"

        if action == "approve":
            rpc_name = "approve_sale" if request_type == "sale" else "approve_reservation"
            result = supabase.rpc(
                rpc_name,
                {
                    "p_approval_id": approval_id,
                    "p_admin_phone": admin_id,  # Se guarda el ID (phone o chat_id)
                },
            ).execute()
        elif action == "reject":
            rpc_name = "reject_sale" if request_type == "sale" else "reject_reservation"
            result = supabase.rpc(
                rpc_name,
                {
                    "p_approval_id": approval_id,
                    "p_admin_phone": admin_id,  # Se guarda el ID (phone o chat_id)
                },
            ).execute()
        else:
            logger.error("Acción desconocida en decisión de admin.", action=action)
            return "UNKNOWN_ACTION"

        rpc_data = result.data
        if not rpc_data or not rpc_data.get("success"):
            error_msg = (
                rpc_data.get("error", "Error desconocido")
                if rpc_data
                else "Sin respuesta RPC"
            )
            logger.error(
                "RPC de aprobación falló.", error=error_msg, approval_id=approval_id
            )
            return f"RPC_FAILED: {error_msg}"

        # Registrar en auditoría
        lot_id = rpc_data.get("lot_id")
        if request_type == "sale":
            audit_action = EVENT_SALE_APPROVED if action == "approve" else EVENT_SALE_REJECTED
        else:
            audit_action = EVENT_RESERVATION_APPROVED if action == "approve" else EVENT_RESERVATION_REJECTED
        channel = "telegram" if admin_id.isdigit() else "web"

        await log_agent_action(
            actor=admin_id,
            action=audit_action,
            entity="approval_requests",
            entity_id=approval_id,
            organization_id=org_id,
            payload={
                "lot_id": str(lot_id) if lot_id else None,
                "approval_id": approval_id,
                "admin_id": admin_id,
                "channel": channel,
                "sale_mode": check_res.data[0].get("sale_mode"),
                "previous_lot_state": check_res.data[0].get("previous_lot_state"),
            }
        )

        # Notificar al vendedor
        vendor_phone = rpc_data.get("vendor_phone")
        vendor_platform = rpc_data.get("vendor_platform")
        vendor_name = rpc_data.get("vendor_name", "Vendedor")

        # Obtener número de lote para el mensaje
        lot_id = rpc_data.get("lot_id")
        lot_label = "el lote solicitado"
        if lot_id:
            lot_res = (
                supabase.table("lots")
                .select("numero_lote")
                .eq("id", str(lot_id))
                .limit(1)
                .execute()
            )
            if lot_res.data:
                lot_label = f"Lote {lot_res.data[0]['numero_lote']}"

        if request_type == "sale":
            if action == "approve":
                vendor_msg = f"✅ ¡Buenas noticias, {vendor_name}! Tu venta del *{lot_label}* fue *aprobada* por el administrador."
                admin_msg = f"✅ *Venta Aprobada*\nSe ha aprobado la venta del *{lot_label}* y se ha notificado a {vendor_name} exitosamente."
            else:
                vendor_msg = f"❌ Lamentamos informarte, {vendor_name}, que tu venta del *{lot_label}* fue *rechazada* por el administrador."
                admin_msg = f"❌ *Venta Rechazada*\nSe ha rechazado la venta del *{lot_label}* y se ha notificado a {vendor_name}."
        else:
            if action == "approve":
                vendor_msg = f"✅ ¡Buenas noticias, {vendor_name}! Tu reserva del *{lot_label}* fue *aprobada* por el administrador."
                admin_msg = f"✅ *Reserva Aprobada*\nSe ha aprobado la reserva del *{lot_label}* y se ha notificado a {vendor_name} exitosamente."
            else:
                vendor_msg = f"❌ Lamentamos informarte, {vendor_name}, que tu reserva del *{lot_label}* fue *rechazada* por el administrador."
                admin_msg = f"❌ *Reserva Rechazada*\nSe ha rechazado la reserva del *{lot_label}* y se ha notificado a {vendor_name}."

        if vendor_phone:
            # Buscar si el vendedor tiene vinculado su Telegram en profiles usando su vendor_phone
            vendor_telegram_chat_id = None
            profile_res = (
                supabase.table("profiles")
                .select("telegram_chat_id")
                .eq("phone", vendor_phone)
                .limit(1)
                .execute()
            )
            if profile_res.data and profile_res.data[0].get("telegram_chat_id"):
                vendor_telegram_chat_id = profile_res.data[0]["telegram_chat_id"]

            used_platform = None
            if vendor_telegram_chat_id and telegram_client:
                # Si tiene el Telegram vinculado en el perfil, lo usamos (tiene prioridad para admin/vendedores)
                await telegram_client.send_text(vendor_telegram_chat_id, vendor_msg)
                used_platform = "telegram_linked"
            elif vendor_platform == "telegram":
                # Si su plataforma original era telegram pero no tiene perfil vinculado (ej: el num guardado es el chat id)
                if vendor_phone.startswith("+"):
                    logger.warning(
                        "Falla al enviar por Telegram: vendor_platform es telegram pero vendor_phone es un numero. Usando WhatsApp como fallback",
                        vendor_phone=vendor_phone,
                    )
                    await meta_client.send_text(vendor_phone, vendor_msg)
                    used_platform = "whatsapp_fallback"
                else:
                    if telegram_client:
                        await telegram_client.send_text(vendor_phone, vendor_msg)
                        used_platform = "telegram_fallback"
                    else:
                        await meta_client.send_text(vendor_phone, vendor_msg)
                        used_platform = "whatsapp_fallback_tg_fail"
            else:
                # Default a WhatsApp
                await meta_client.send_text(vendor_phone, vendor_msg)
                used_platform = "whatsapp"

            logger.info(
                "Vendedor notificado del resultado.",
                vendor_phone=vendor_phone,
                telegram_chat_id=vendor_telegram_chat_id,
                platform_used=used_platform,
                action=action,
                approval_id=approval_id,
            )

        # Enviar confirmación final al administrador
        if admin_id and telegram_client:
            logger.info(
                "Enviando confirmación final al administrador.", admin_id=admin_id
            )
            await telegram_client.send_text(admin_id, admin_msg)

        return "SUCCESS"

    except Exception as e:
        logger.error(
            "Error procesando decisión del admin.",
            error=str(e),
            approval_id=approval_id,
        )
        raise e
