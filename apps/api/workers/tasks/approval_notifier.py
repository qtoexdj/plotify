from core.logger import get_logger
from core.database import get_supabase_client
from integrations.telegram_client import get_telegram_client_for_org
from integrations.meta_client import meta_client

logger = get_logger(__name__)


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

        # 2. Obtener nombre del proyecto a partir del lote
        lot_res = (
            supabase.table("lots")
            .select("numero_lote, project_id")
            .eq("id", request["lot_id"])
            .limit(1)
            .execute()
        )
        lot_info = lot_res.data[0] if lot_res.data else {}
        numero_lote = lot_info.get("numero_lote", "?")

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
                .select("phone, telegram_chat_id")
                .eq("id", uid)
                .limit(1)
                .execute()
            )
            if profile_res.data:
                admin_contacts.append(profile_res.data[0])

        if not admin_contacts:
            logger.warning("Ningún admin tiene datos de contacto.", org_id=org_id)
            return "NO_ADMIN_CONTACTS"

        # 4. Construir mensaje
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
            f"💰 *Valor Reserva:* {valor_str}\n"
            f"🏛️ *Notaría:* {notaria_str}\n"
            f"📅 *Fecha Firma:* {fecha_str}\n\n"
            f"¿Aprobas esta reserva?"
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
                        ]
                    ]
                }
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

        return "SUCCESS"

    except Exception as e:
        logger.error(
            "Error enviando notificación de aprobación.",
            error=str(e),
            approval_id=approval_id,
        )
        raise e
