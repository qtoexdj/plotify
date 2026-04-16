from core.database import get_supabase_client
from core.logger import get_logger
from integrations.telegram_client import get_telegram_client_for_org

logger = get_logger(__name__)

NOTIFICATION_TEMPLATES = {
    "reservation_approved": "✅ Reserva aprobada: Lote {numero_lote} — Cliente: {cliente_nombre}",
    "new_lead": "🆕 Nuevo lead: {name} ({phone}) vía {platform}",
    "stage_change": "📋 Lote {numero_lote}: {old_stage} → {new_stage}",
}


async def send_notification(ctx: dict, payload: dict) -> str:
    """
    Job ARQ: Envía notificación proactiva al admin de la org vía Telegram.

    payload esperado:
      {
        "event_type": "reservation_approved" | "new_lead" | "stage_change",
        "organization_id": "<uuid>",
        "data": { ...variables del template... }
      }
    """
    try:
        event_type = payload.get("event_type")
        org_id = payload.get("organization_id")
        data = payload.get("data", {})

        template = NOTIFICATION_TEMPLATES.get(event_type)
        if not template:
            logger.warning("unknown_notification_type", event_type=event_type)
            return "UNKNOWN_TYPE"

        if not org_id:
            logger.error("missing_organization_id", payload=payload)
            return "MISSING_ORG_ID"

        try:
            message = template.format(**data)
        except KeyError as e:
            logger.error(
                "notification_template_missing_key",
                event_type=event_type,
                missing_key=str(e),
            )
            return "TEMPLATE_KEY_ERROR"

        # Obtener admins de la org con telegram_chat_id
        supabase = get_supabase_client()
        admins_res = (
            supabase.table("organization_members")
            .select("profiles(telegram_chat_id)")
            .eq("organization_id", org_id)
            .eq("role", "admin")
            .execute()
        )

        telegram_client = await get_telegram_client_for_org(org_id)
        if not telegram_client:
            logger.warning("no_telegram_client_for_org", org_id=org_id)
            return "NO_TELEGRAM_CLIENT"

        sent_count = 0
        for admin in admins_res.data or []:
            profile = admin.get("profiles") or {}
            # profiles puede venir como dict o como lista dependiendo de la query
            if isinstance(profile, list):
                profile = profile[0] if profile else {}
            chat_id = profile.get("telegram_chat_id")
            if chat_id:
                await telegram_client.send_text(str(chat_id), message)
                sent_count += 1
                logger.info(
                    "notification_sent",
                    event_type=event_type,
                    chat_id=chat_id,
                    org_id=org_id,
                )

        if sent_count == 0:
            logger.warning(
                "no_admins_with_telegram", org_id=org_id, event_type=event_type
            )
            return "NO_RECIPIENTS"

        return f"OK:{sent_count}"

    except Exception as exc:
        logger.error(
            "send_notification_error",
            event_type=payload.get("event_type"),
            org_id=payload.get("organization_id"),
            error=str(exc),
        )
        raise
