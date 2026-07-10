import re

from core.config import get_settings
from core.logger import get_logger
from core.database import get_supabase_client
from integrations.telegram_client import get_telegram_client_for_org
from integrations.meta_client import meta_client
from services.escritura_notifications import (
    absolute_frontend_link,
    sale_pending_validation_copy,
)

logger = get_logger(__name__)
_MINI_APP_URL_WARNED = False


def _normalize_run(value: str | None) -> str:
    """Mismo criterio que la columna generada lot_records.cliente_run_normalizado
    (regexp_replace(upper(run), '[^0-9K]', '', 'g')): solo dígitos y K."""
    return re.sub(r"[^0-9K]", "", (value or "").upper())


def _matching_reservation_client_name(
    supabase, *, lot_id: str, payload_run: str | None
) -> str | None:
    """FR-017: si la venta viene de una reserva (sale_mode='reserved') y el
    RUT coincide con el de esa reserva, devuelve el nombre del cliente ya
    aprobado para armar el mensaje delta. None si no hay coincidencia."""
    run_normalizado = _normalize_run(payload_run)
    if not run_normalizado:
        return None

    record_res = (
        supabase.table("lot_records")
        .select("cliente_nombre, cliente_run_normalizado")
        .eq("lot_id", lot_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    record_row = record_res.data[0] if record_res.data else None
    if not record_row or record_row.get("cliente_run_normalizado") != run_normalizado:
        return None
    return record_row.get("cliente_nombre")


async def notify_admin_approval(ctx: dict, approval_id: str) -> str:
    """
    Job ARQ: Envía al Admin de la organización un mensaje con la solicitud
    de reserva y botones para aprobar/rechazar.
    """
    try:
        supabase = get_supabase_client()

        # 1. Leer solicitud
        req_res = (
            supabase.table("approval_requests")
            .select("*")
            .eq("id", approval_id)
            .limit(1)
            .execute()
        )
        if not req_res.data:
            logger.error(
                "Solicitud de aprobación no encontrada.", approval_id=approval_id
            )
            return "APPROVAL_NOT_FOUND"

        request = req_res.data[0]
        payload = request.get("payload", {})

        # 2. Obtener nombre del proyecto y precio a partir del lote
        lot_res = (
            supabase.table("lots")
            .select("numero_lote, project_id, precio")
            .eq("id", request["lot_id"])
            .limit(1)
            .execute()
        )
        lot_info = lot_res.data[0] if lot_res.data else {}
        numero_lote = lot_info.get("numero_lote", "?")
        lot_label = f"Lote {numero_lote}"
        project_id = str(lot_info["project_id"]) if lot_info.get("project_id") else None

        project_name = "Desconocido"
        if lot_info.get("project_id"):
            proj_res = (
                supabase.table("projects")
                .select("name")
                .eq("id", lot_info["project_id"])
                .limit(1)
                .execute()
            )
            if proj_res.data:
                project_name = proj_res.data[0]["name"]

        # 3. Buscar admins de la organización
        org_id = request["organization_id"]
        members_res = (
            supabase.table("organization_members")
            .select("user_id")
            .eq("organization_id", org_id)
            .eq("role", "admin")
            .execute()
        )

        if not members_res.data:
            logger.warning(
                "No se encontraron administradores para la organización.", org_id=org_id
            )
            return "NO_ADMINS_FOUND"

        # Obtener datos de contacto de los admins
        admin_user_ids = [m["user_id"] for m in members_res.data]
        admin_contacts = []
        for uid in admin_user_ids:
            profile_res = (
                supabase.table("profiles")
                .select("id, phone, telegram_chat_id")
                .eq("id", uid)
                .limit(1)
                .execute()
            )
            if profile_res.data:
                profile_data = profile_res.data[0]
                profile_data["profile_id"] = uid
                admin_contacts.append(profile_data)

        if not admin_contacts:
            logger.warning("Ningún admin tiene datos de contacto.", org_id=org_id)
            return "NO_ADMIN_CONTACTS"

        request_type = request.get("request_type", "reservation")
        sale_mode = request.get("sale_mode")

        # 4. Construir mensaje
        precio_total = lot_info.get("precio", 0)
        precio_str = (
            f"${precio_total:,.0f}"
            if precio_total
            else "No definido"
        )

        # FR-017: venta desde una reserva aprobada con el mismo RUT -> mensaje
        # delta (solo lo que cambia), no el formulario completo de nuevo.
        # HG-1: sigue exigiendo confirmar/rechazar explícito; no se auto-aprueba.
        delta_client_name = None
        if request_type == "sale" and sale_mode == "reserved":
            delta_client_name = _matching_reservation_client_name(
                supabase, lot_id=request["lot_id"], payload_run=payload.get("cliente_run")
            )

        if request_type == "sale" and delta_client_name:
            valor_final_total = payload.get("valor_final", 0)
            valor_final_str = (
                f"${valor_final_total:,.0f}"
                if valor_final_total
                else "No definido"
            )
            message = (
                f"📋 *Confirmación de venta*\n\n"
                f"Ya aprobaste la reserva de *{delta_client_name}* "
                f"para el *Lote {numero_lote}* — *Proyecto:* {project_name}.\n"
                f"💵 *Valor final:* {valor_final_str}\n\n"
                f"¿Confirmas esta venta?"
            )
        elif request_type == "sale":
            valor_final_total = payload.get("valor_final", 0)
            valor_final_str = (
                f"${valor_final_total:,.0f}"
                if valor_final_total
                else "No definido"
            )
            notaria_str = payload.get("notaria", "No definida")
            fecha_str = payload.get("fecha_firma", "No definida")
            notification_copy = sale_pending_validation_copy(
                project_id=project_id,
                lot_label=lot_label,
                project_name=project_name,
                client_name=payload.get("cliente_nombre", "?"),
            )
            deep_link = absolute_frontend_link(notification_copy.deep_link)

            message = (
                f"📋 *{notification_copy.title}*\n\n"
                f"👤 *Vendedor:* {request['vendor_name']}\n"
                f"📍 *Lote:* {numero_lote} — *Proyecto:* {project_name}\n"
                f"🧑 *Cliente:* {payload.get('cliente_nombre', '?')} ({payload.get('cliente_run', '?')})\n"
                f"💰 *Precio Lote:* {precio_str}\n"
                f"💵 *Valor Venta Final:* {valor_final_str}\n"
                f"🏛️ *Notaría:* {notaria_str}\n"
                f"📅 *Fecha Firma:* {fecha_str}\n\n"
                f"{notification_copy.action_label}: {deep_link}\n\n"
                f"¿Apruebas esta venta?"
            )
        else:
            valor_str = (
                f"${payload.get('valor_reserva', 0):,.0f}"
                if payload.get("valor_reserva")
                else "No definido"
            )
            notaria_str = payload.get("notaria", "No definida")
            fecha_str = payload.get("fecha_firma", "No definida")

            message = (
                f"📋 *Solicitud de Reserva*\n\n"
                f"👤 *Vendedor:* {request['vendor_name']}\n"
                f"📍 *Lote:* {numero_lote} — *Proyecto:* {project_name}\n"
                f"🧑 *Cliente:* {payload.get('cliente_nombre', '?')} ({payload.get('cliente_run', '?')})\n"
                f"💰 *Precio Lote:* {precio_str}\n"
                f"💵 *Valor Reserva:* {valor_str}\n"
                f"🏛️ *Notaría:* {notaria_str}\n"
                f"📅 *Fecha Firma:* {fecha_str}\n\n"
                f"¿Aprobáis esta reserva?"
            )

        # 5. Enviar a cada admin (prioridad: Telegram > WhatsApp)
        for contact in admin_contacts:
            tg_chat_id = contact.get("telegram_chat_id")
            phone = contact.get("phone")

            if tg_chat_id:
                reply_markup = {
                    "inline_keyboard": [
                        [
                            {
                                "text": "✅ Aprobar",
                                "callback_data": f"approve:{approval_id}",
                            },
                            {
                                "text": "❌ Rechazar",
                                "callback_data": f"reject:{approval_id}",
                            },
                        ],
                    ]
                }
                mini_app_url = get_settings().TELEGRAM_MINI_APP_URL.rstrip('/')
                if mini_app_url:
                    reply_markup["inline_keyboard"].append(
                        [
                            {
                                "text": "⚡ Abrir en la app",
                                "web_app": {
                                    "url": (
                                        f"{mini_app_url}/mini/bandeja/{approval_id}"
                                        f"?org={org_id}&tipo=reserva"
                                    )
                                },
                            }
                        ]
                    )
                else:
                    global _MINI_APP_URL_WARNED
                    if not _MINI_APP_URL_WARNED:
                        logger.warning(
                            "TELEGRAM_MINI_APP_URL no configurada; se omite el botón web_app de aprobación."
                        )
                        _MINI_APP_URL_WARNED = True
                telegram_client = await get_telegram_client_for_org(org_id)
                if telegram_client:
                    await telegram_client.send_text(
                        tg_chat_id, message, reply_markup=reply_markup
                    )
                    logger.info(
                        "Notificación enviada por Telegram.",
                        chat_id=tg_chat_id,
                        approval_id=approval_id,
                    )
            elif phone:
                wa_message = (
                    message + "\n\nResponde *APROBAR* o *RECHAZAR* para decidir."
                )
                await meta_client.send_text(phone, wa_message)
                logger.info(
                    "Notificación enviada por WhatsApp.",
                    phone=phone,
                    approval_id=approval_id,
                )
            else:
                logger.warning("Admin sin telegram_chat_id ni phone.")

        # --- T053: Registrar evento en notification_events para cada admin ---
        for contact in admin_contacts:
            uid = contact.get("profile_id")
            tg_chat_id = contact.get("telegram_chat_id")
            phone = contact.get("phone")
            
            # delivery_channel estrictamente in ('web', 'telegram')
            channel = "telegram" if tg_chat_id else "web"
            status_val = "delivered" if (tg_chat_id or phone) else "pending"
            
            try:
                notif_event = {
                    "approval_id": approval_id,
                    "organization_id": org_id,
                    "recipient_id": uid,
                    "recipient_role": "admin",
                    "delivery_channel": channel,
                    "delivery_status": status_val
                }
                supabase.table("notification_events").insert(notif_event).execute()
                logger.info(
                    "Evento de notificación registrado en BD para el admin.",
                    admin_id=uid,
                    approval_id=approval_id
                )
            except Exception as db_err:
                logger.error(
                    "Error al insertar evento de notificación para el admin.",
                    admin_id=uid,
                    error=str(db_err)
                )

        return "SUCCESS"

    except Exception as e:
        logger.error(
            "Error enviando notificación de aprobación.",
            error=str(e),
            approval_id=approval_id,
        )
        raise e
