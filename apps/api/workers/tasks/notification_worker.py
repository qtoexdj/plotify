from core.database import get_supabase_client
from core.logger import get_logger
from integrations.telegram_client import get_telegram_client_for_org
from utils.audit import (
    EVENT_DOCUMENT_SEND_FAILED,
    EVENT_DOCUMENT_SEND_RETRIED,
    EVENT_DOCUMENT_SENT,
    log_agent_action,
)

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


def _document_delivery_payload(document: dict, payload: dict) -> dict:
    recipients = payload.get("selected_recipients") or document.get("selected_recipients") or []
    return {
        "document_id": document.get("id"),
        "lot_id": document.get("lot_id"),
        "template_id": document.get("template_id"),
        "file_url": document.get("file_url"),
        "format": document.get("file_format"),
        "selected_recipients": recipients,
    }


async def _update_document_delivery(
    supabase,
    document_id: str,
    *,
    status: str,
    attempts: int,
    error_message: str | None,
    metadata: dict,
) -> None:
    supabase.table("generated_documents").update(
        {
            "delivery_status": status,
            "delivery_failed_attempts": attempts,
            "delivery_error_message": error_message,
            "delivery_metadata": metadata,
        }
    ).eq("id", document_id).execute()


async def send_generated_document(ctx: dict, payload: dict) -> str:
    """
    Job ARQ: marks delivery for an already generated document.

    The worker never regenerates the file. It only reads generated_documents and
    updates delivery metadata so failed sends can be retried against the same row.
    """
    document_id = payload.get("document_id")
    organization_id = payload.get("organization_id")
    if not document_id or not organization_id:
        return "MISSING_DOCUMENT_OR_ORG"

    supabase = get_supabase_client()
    result = (
        supabase.table("generated_documents")
        .select("*")
        .eq("id", document_id)
        .eq("organization_id", organization_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return "DOCUMENT_NOT_FOUND"

    document = result.data[0]
    attempts = int(document.get("delivery_failed_attempts") or 0)
    delivery_payload = _document_delivery_payload(document, payload)

    try:
        if payload.get("force_error"):
            raise RuntimeError(str(payload["force_error"]))
        if not document.get("file_url"):
            raise RuntimeError("Document has no file_url")
        if not delivery_payload["selected_recipients"]:
            raise RuntimeError("No selected recipients")

        await _update_document_delivery(
            supabase,
            document_id,
            status="sent",
            attempts=attempts,
            error_message=None,
            metadata={**delivery_payload, "channel": "document_delivery_worker"},
        )
        await log_agent_action(
            actor="document_delivery_worker",
            action=EVENT_DOCUMENT_SENT,
            entity="generated_documents",
            entity_id=document_id,
            organization_id=organization_id,
            payload=delivery_payload,
        )
        return "SENT"
    except Exception as exc:
        attempts += 1
        await _update_document_delivery(
            supabase,
            document_id,
            status="failed",
            attempts=attempts,
            error_message=str(exc),
            metadata=delivery_payload,
        )
        await log_agent_action(
            actor="document_delivery_worker",
            action=EVENT_DOCUMENT_SEND_FAILED,
            entity="generated_documents",
            entity_id=document_id,
            organization_id=organization_id,
            payload={**delivery_payload, "error": str(exc), "attempts": attempts},
        )
        return "FAILED"


async def retry_generated_document_delivery(ctx: dict, payload: dict) -> str:
    payload = {**payload}
    payload.pop("force_error", None)
    result = await send_generated_document(ctx, payload)
    if result == "SENT" and payload.get("document_id") and payload.get("organization_id"):
        await log_agent_action(
            actor="document_delivery_worker",
            action=EVENT_DOCUMENT_SEND_RETRIED,
            entity="generated_documents",
            entity_id=payload["document_id"],
            organization_id=payload["organization_id"],
            payload={"document_id": payload["document_id"], "result": result},
        )
    return result
