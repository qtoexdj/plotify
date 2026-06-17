from fastapi import HTTPException
from core.logger import get_logger
from core.database import get_supabase_client
from integrations.telegram_client import get_telegram_client_for_org
from integrations.meta_client import meta_client
from services.escritura_notifications import (
    absolute_frontend_link,
    draft_ready_for_review_copy,
    waiting_project_matriz_copy,
)
from utils.audit import (
    log_agent_action,
    EVENT_RESERVATION_APPROVED,
    EVENT_RESERVATION_REJECTED,
    EVENT_SALE_APPROVED,
    EVENT_SALE_REJECTED,
)

logger = get_logger(__name__)


import asyncio

async def execute_admin_decision_db(
    org_id: str,
    approval_id: str,
    action: str,
    admin_id: str,
) -> dict:
    """
    Realiza las operaciones de base de datos de manera atómica (validar tenant, RPC, y registrar auditoría).
    Usa asyncio.to_thread para todas las llamadas a Supabase para evitar bloquear el loop de FastAPI.
    """
    supabase = get_supabase_client()
    
    # 1. Validar tenant de la solicitud de aprobación de forma segura (cross-tenant safety)
    check_res = await asyncio.to_thread(
        lambda: (
            supabase.table("approval_requests")
            .select("organization_id, request_type, sale_mode, previous_lot_state")
            .eq("id", approval_id)
            .limit(1)
            .execute()
        )
    )
    if not check_res.data:
        raise HTTPException(status_code=404, detail="Solicitud de aprobación no encontrada.")

    request_info = check_res.data[0]
    db_org_id = request_info.get("organization_id")
    request_type = request_info.get("request_type", "reservation")
    
    if str(db_org_id) != str(org_id):
        raise HTTPException(status_code=403, detail="organization_id de la solicitud no coincide con el contexto.")

    # 2. Ejecutar la RPC correspondiente
    if action == "approve":
        rpc_name = "approve_sale" if request_type == "sale" else "approve_reservation"
    elif action == "reject":
        rpc_name = "reject_sale" if request_type == "sale" else "reject_reservation"
    else:
        raise HTTPException(status_code=400, detail="Acción desconocida en decisión de admin.")

    result = await asyncio.to_thread(
        lambda: (
            supabase.rpc(
                rpc_name,
                {
                    "p_approval_id": approval_id,
                    "p_admin_phone": admin_id,
                },
            ).execute()
        )
    )

    rpc_data = result.data
    if not rpc_data or not rpc_data.get("success"):
        error_msg = rpc_data.get("error", "already_processed") if rpc_data else "already_processed"
        raise HTTPException(status_code=409, detail=error_msg)

    # 3. Tras validar una venta, enganchar el flujo legal SDD 011.
    lot_id = rpc_data.get("lot_id")
    escritura_hook_result = None
    escritura_hook_error = None
    if request_type == "sale" and action == "approve" and lot_id:
        from services.escritura_sale_hook import handle_sale_validated_for_escritura

        try:
            hook_result = await handle_sale_validated_for_escritura(
                organization_id=org_id,
                lot_id=str(lot_id),
                validated_by=admin_id,
                supabase=supabase,
            )
            escritura_hook_result = hook_result.to_dict()
        except Exception as exc:  # pragma: no cover - defensive non-blocking path
            escritura_hook_error = str(exc)
            logger.error(
                "sale_escritura_hook_failed",
                organization_id=org_id,
                approval_id=approval_id,
                lot_id=str(lot_id),
                error=escritura_hook_error,
            )

    # 4. Registrar en auditoría de forma segura
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
            "sale_mode": request_info.get("sale_mode"),
            "previous_lot_state": request_info.get("previous_lot_state"),
            "escritura_hook": escritura_hook_result,
            "escritura_hook_error": escritura_hook_error,
        }
    )

    return {
        "rpc_data": rpc_data,
        "request_type": request_type,
        "sale_mode": request_info.get("sale_mode"),
        "previous_lot_state": request_info.get("previous_lot_state"),
        "escritura_hook": escritura_hook_result,
        "escritura_hook_error": escritura_hook_error,
    }


async def send_decision_notifications(
    ctx: dict | None,
    org_id: str,
    approval_id: str,
    action: str,
    admin_id: str,
    db_result: dict,
) -> str:
    """
    Job ARQ: Envía las notificaciones asíncronas de Telegram/WhatsApp
    al vendedor y la confirmación final al administrador.
    """
    try:
        supabase = get_supabase_client()
        telegram_client = await get_telegram_client_for_org(org_id)
        
        rpc_data = db_result["rpc_data"]
        request_type = db_result["request_type"]
        
        # Notificar al vendedor
        vendor_phone = rpc_data.get("vendor_phone")
        vendor_platform = rpc_data.get("vendor_platform")
        vendor_name = rpc_data.get("vendor_name", "Vendedor")

        # Obtener número de lote para el mensaje
        lot_id = rpc_data.get("lot_id")
        lot_label = "el lote solicitado"
        if lot_id:
            lot_res = await asyncio.to_thread(
                lambda: (
                    supabase.table("lots")
                    .select("numero_lote")
                    .eq("id", str(lot_id))
                    .limit(1)
                    .execute()
                )
            )
            if lot_res.data:
                lot_label = f"Lote {lot_res.data[0]['numero_lote']}"

        if request_type == "sale":
            if action == "approve":
                vendor_msg = f"✅ ¡Buenas noticias, {vendor_name}! Tu venta del *{lot_label}* fue *aprobada* por el administrador."
                hook_result = db_result.get("escritura_hook") or {}
                if hook_result.get("ready_for_borrador") and hook_result.get(
                    "escritura_case_id"
                ):
                    notification_copy = draft_ready_for_review_copy(
                        escritura_case_id=str(hook_result["escritura_case_id"]),
                        lot_label=lot_label,
                    )
                    admin_msg = (
                        f"✅ *{notification_copy.title}*\n"
                        f"Se aprobó la venta del *{lot_label}*. "
                        f"{notification_copy.message}\n"
                        f"{notification_copy.action_label}: "
                        f"{absolute_frontend_link(notification_copy.deep_link)}"
                    )
                elif hook_result.get("project_id"):
                    notification_copy = waiting_project_matriz_copy(
                        project_id=str(hook_result["project_id"]),
                        lot_label=lot_label,
                    )
                    admin_msg = (
                        f"✅ *{notification_copy.title}*\n"
                        f"Se aprobó la venta del *{lot_label}*. "
                        f"{notification_copy.message}\n"
                        f"{notification_copy.action_label}: "
                        f"{absolute_frontend_link(notification_copy.deep_link)}"
                    )
                else:
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

        # --- T058 & T053: Resolver la identidad vinculada del vendedor a partir de approval_requests ---
        recipient_id = None
        vendor_telegram_chat_id = None
        
        # 1. Obtener el vendor_id de la solicitud
        req_res = await asyncio.to_thread(
            lambda: (
                supabase.table("approval_requests")
                .select("vendor_id")
                .eq("id", approval_id)
                .limit(1)
                .execute()
            )
        )
        if req_res.data and req_res.data[0].get("vendor_id"):
            vendor_db_id = req_res.data[0]["vendor_id"]
            # 2. Obtener el user_id (profiles.id) a partir del vendor_id
            vendor_res = await asyncio.to_thread(
                lambda: (
                    supabase.table("vendors")
                    .select("user_id")
                    .eq("id", vendor_db_id)
                    .limit(1)
                    .execute()
                )
            )
            if vendor_res.data and vendor_res.data[0].get("user_id"):
                recipient_id = vendor_res.data[0]["user_id"]
                
        # 3. Si tenemos recipient_id, buscar su telegram_chat_id y phone
        if recipient_id:
            profile_res = await asyncio.to_thread(
                lambda: (
                    supabase.table("profiles")
                    .select("phone, telegram_chat_id")
                    .eq("id", recipient_id)
                    .limit(1)
                    .execute()
                )
            )
            if profile_res.data:
                vendor_telegram_chat_id = profile_res.data[0].get("telegram_chat_id")
                if not vendor_phone and profile_res.data[0].get("phone"):
                    vendor_phone = profile_res.data[0].get("phone")

        # 4. Fallback histórico si no se resolvió por vinculación (buscar por teléfono del vendor_phone)
        if not recipient_id and vendor_phone:
            profile_res = await asyncio.to_thread(
                lambda: (
                    supabase.table("profiles")
                    .select("id, telegram_chat_id")
                    .eq("phone", vendor_phone)
                    .limit(1)
                    .execute()
                )
            )
            if profile_res.data:
                recipient_id = profile_res.data[0]["id"]
                vendor_telegram_chat_id = profile_res.data[0].get("telegram_chat_id")

        if vendor_phone or vendor_telegram_chat_id:
            used_platform = None
            if vendor_telegram_chat_id and telegram_client:
                await telegram_client.send_text(vendor_telegram_chat_id, vendor_msg)
                used_platform = "telegram_linked"
            elif vendor_platform == "telegram":
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
            elif vendor_phone:
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

            # --- T058: Auditoría explícita de fallbacks de entrega ---
            if used_platform and ("fallback" in used_platform or not recipient_id):
                try:
                    await log_agent_action(
                        actor="system",
                        action="telegram.delivery_fallback",
                        entity="approval_requests",
                        entity_id=approval_id,
                        organization_id=org_id,
                        payload={
                            "vendor_name": vendor_name,
                            "vendor_phone": vendor_phone,
                            "platform_used": used_platform,
                            "recipient_resolved": recipient_id is not None,
                            "reason": (
                                "Vendedor no tiene cuenta de Telegram formalmente vinculada en perfiles"
                                if not recipient_id
                                else "Falla o incompatibilidad de formato en canal de Telegram"
                            )
                        }
                    )
                    logger.info("Auditoría de fallback de entrega registrada exitosamente.")
                except Exception as audit_err:
                    logger.error("Error al registrar auditoría de fallback de entrega.", error=str(audit_err))

        # --- T053: Registrar evento en notification_events para el vendedor ---
        if recipient_id:
            channel = "telegram" if (vendor_telegram_chat_id and telegram_client) else "web"
            status_val = "delivered" if (vendor_telegram_chat_id or vendor_phone) else "pending"
            
            try:
                notif_event = {
                    "approval_id": approval_id,
                    "organization_id": org_id,
                    "recipient_id": recipient_id,
                    "recipient_role": "vendor",
                    "delivery_channel": channel,
                    "delivery_status": status_val
                }
                await asyncio.to_thread(
                    lambda: supabase.table("notification_events").insert(notif_event).execute()
                )
                logger.info(
                    "Evento de notificación registrado en BD para el vendedor.",
                    vendor_id=recipient_id,
                    approval_id=approval_id
                )
            except Exception as db_err:
                logger.error(
                    "Error al insertar evento de notificación para el vendedor.",
                    vendor_id=recipient_id,
                    error=str(db_err)
                )

        # Enviar confirmación final al administrador
        if admin_id and telegram_client and admin_id.isdigit():
            logger.info(
                "Enviando confirmación final al administrador en Telegram.", admin_id=admin_id
            )
            await telegram_client.send_text(admin_id, admin_msg)

        return "SUCCESS"

    except Exception as e:
        logger.error(
            "Error enviando notificaciones de decision.",
            error=str(e),
            approval_id=approval_id,
        )
        return f"NOTIFY_FAILED: {str(e)}"


async def process_admin_decision(
    ctx: dict, org_id: str, approval_id: str, action: str, admin_id: str
) -> str:
    """
    Job ARQ: Procesa la decisión del Admin (aprobar/rechazar) de forma asíncrona completa (para canal Telegram).
    """
    try:
        db_result = await execute_admin_decision_db(
            org_id=org_id,
            approval_id=approval_id,
            action=action,
            admin_id=admin_id,
        )
        await send_decision_notifications(
            ctx=ctx,
            org_id=org_id,
            approval_id=approval_id,
            action=action,
            admin_id=admin_id,
            db_result=db_result,
        )
        return "SUCCESS"
    except HTTPException as e:
        logger.error(
            "HTTPException procesando decision de admin en el job arq.",
            status_code=e.status_code,
            detail=e.detail,
            approval_id=approval_id,
        )
        if e.status_code == 409:
            return f"RPC_FAILED: {e.detail}"
        elif e.status_code == 403:
            return "TENANT_MISMATCH"
        elif e.status_code == 404:
            return "NOT_FOUND"
        return f"ERROR: {e.detail}"
    except Exception as e:
        logger.error(
            "Error procesando decision de admin en el job arq.",
            error=str(e),
            approval_id=approval_id,
        )
        return str(e)
