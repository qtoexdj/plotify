"""Private escritura delivery with opaque IDs and hash-only capabilities."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from core.logger import get_logger
from integrations.telegram_client import get_telegram_client_for_org
from services.document_capabilities import issue_delivery_capability
from services.escritura_notifications import vendor_draft_delivered_copy
from services.legal_microcopy import ESCRITURA_BORRADOR_NOTICE, FLOW_STATE_LABELS

logger = get_logger(__name__)
LINK_TTL_DAYS = 7
DELIVERY_COLUMNS = (
    "id, organization_id, project_id, escritura_case_id, generation_id, "
    "recipient_user_id, channel, link_expires_at, status, sent_at, created_at, "
    "active_capability_id"
)

DELIVERY_STATUS_LABELS: dict[str, str] = {
    "pending": "Preparando entrega",
    "sent": FLOW_STATE_LABELS["delivered"],
    "failed": "No se pudo entregar",
    "unavailable": "Pendiente de Telegram",
    "expired": "Enlace vencido",
}


def delivery_status_label(status: str) -> str:
    return DELIVERY_STATUS_LABELS.get(status, "Entrega")


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class DeliveryOutcome:
    deliveries: list[dict[str, Any]] = field(default_factory=list)
    telegram_sent: bool = False
    web_available: bool = False
    recipient_has_telegram: bool = False


def summarize_delivery_state(deliveries: list[dict[str, Any]]) -> dict[str, Any]:
    """Project independent delivery, capability and historical-access axes."""
    web = [row for row in deliveries if row.get("channel") == "web"]
    retries = [
        str(row["id"])
        for row in deliveries
        if row.get("delivery_status") in {"retry_scheduled", "failed"}
    ]
    primary = web[0] if web else {}
    historically_delivered = any(
        row.get("delivery_status") == "available" or row.get("first_accessed_at")
        for row in deliveries
    )
    return {
        "delivery_status": "partial" if retries and historically_delivered else ("available" if historically_delivered else "pending"),
        "authenticated_web_available": bool(web),
        "historically_delivered": historically_delivered,
        "capability_status": primary.get("capability_status", "none"),
        "current_capability_access": primary.get("capability_status") == "active" and bool(primary.get("active_capability_id")),
        "retry_delivery_ids": retries,
    }


def build_recipient_snapshot(
    *, approved_request: dict[str, Any], sale_requests: list[dict[str, Any]],
    vendors: list[dict[str, Any]], active_admin_user_ids: list[str],
) -> dict[str, Any]:
    """Freeze recipients from the exact sale transition, never a later request."""
    del sale_requests
    if approved_request.get("request_type") != "sale" or approved_request.get("status") != "approved":
        raise ValueError("DELIVERY_APPROVED_SALE_REQUIRED")
    vendor = next((row for row in vendors if str(row.get("id")) == str(approved_request.get("vendor_id"))), None)
    seller_user_id = vendor.get("user_id") if vendor and vendor.get("active") else None
    if not seller_user_id:
        raise ValueError("VENDOR_USER_LINK_REQUIRED")
    return {
        "approval_request_id": str(approved_request["id"]),
        "approval_transition_version": approved_request.get("approved_transition_version"),
        "seller_user_id": str(seller_user_id),
        "admin_user_ids": list(dict.fromkeys(str(user_id) for user_id in active_admin_user_ids)),
    }


def build_delivery_obligations(
    *, generation_id: str, recipient_snapshot: dict[str, Any],
    current_admin_user_ids: list[str], telegram_user_ids: list[str],
) -> list[dict[str, Any]]:
    """Create unique durable obligations from the frozen approval snapshot."""
    del current_admin_user_ids
    recipients = [str(recipient_snapshot["seller_user_id"]), *map(str, recipient_snapshot.get("admin_user_ids", []))]
    telegram = set(map(str, telegram_user_ids))
    obligations: list[dict[str, Any]] = []
    for recipient in dict.fromkeys(recipients):
        role = "sale_vendor" if recipient == str(recipient_snapshot["seller_user_id"]) else "admin"
        obligations.append({"generation_id": generation_id, "recipient_user_id": recipient, "recipient_role": role, "channel": "web", "required": role == "sale_vendor"})
        if recipient in telegram:
            obligations.append({"generation_id": generation_id, "recipient_user_id": recipient, "recipient_role": role, "channel": "telegram", "required": False})
    return obligations


def reassign_delivery_recipient(
    *, recipient_snapshot: dict[str, Any], old_recipient_user_id: str,
    new_recipient_user_id: str, actor_user_id: str, operation_id: str, reason: str,
) -> dict[str, Any]:
    if not operation_id or not reason.strip() or old_recipient_user_id == new_recipient_user_id:
        raise ValueError("DELIVERY_REASSIGNMENT_INVALID")
    return {
        "original_snapshot": recipient_snapshot,
        "replacement_recipient_user_id": new_recipient_user_id,
        "previous_capability_status": "revoked",
        "audit": {"operation_id": operation_id, "actor_user_id": actor_user_id, "reason": reason},
    }


async def _download_generation(supabase: Any, generation: dict[str, Any]) -> bytes | None:
    object_name = str(generation.get("storage_path") or "")
    if not object_name:
        return None
    try:
        data = await asyncio.to_thread(
            lambda: supabase.storage.from_("documents").download(object_name)
        )
    except Exception:
        logger.warning("escritura_delivery_artifact_unavailable")
        return None
    return data if isinstance(data, (bytes, bytearray)) else None


async def _recipient_chat_id(supabase: Any, recipient_user_id: str | None) -> str | None:
    if not recipient_user_id:
        return None
    result = await asyncio.to_thread(
        lambda: supabase.table("profiles")
        .select("telegram_chat_id")
        .eq("id", recipient_user_id)
        .limit(1)
        .execute()
    )
    rows = result.data if isinstance(result.data, list) else []
    return rows[0].get("telegram_chat_id") if rows else None


async def _insert_delivery(
    supabase: Any,
    *,
    org_id: str,
    project_id: str,
    case_id: str,
    generation_id: str,
    recipient_user_id: str | None,
    channel: str,
    status: str,
    sent_at: str | None,
) -> dict[str, Any]:
    payload = {
        "organization_id": org_id,
        "project_id": project_id,
        "escritura_case_id": case_id,
        "generation_id": generation_id,
        "recipient_user_id": recipient_user_id,
        "channel": channel,
        "link_expires_at": (_now() + timedelta(days=LINK_TTL_DAYS)).isoformat(),
        "status": status,
        "sent_at": sent_at,
    }
    result = await asyncio.to_thread(
        lambda: supabase.table("escritura_deliveries").insert(payload).execute()
    )
    rows = result.data if isinstance(result.data, list) else []
    return rows[0] if rows else payload


async def deliver_draft(
    *,
    supabase: Any,
    generation: dict[str, Any],
    recipient_user_id: str | None,
    lot_label: str,
    channels: tuple[str, ...] = ("telegram", "web"),
) -> DeliveryOutcome:
    org_id = str(generation["organization_id"])
    project_id = str(generation["project_id"])
    case_id = str(generation["escritura_case_id"])
    generation_id = str(generation["id"])
    created: list[dict[str, Any]] = []

    if recipient_user_id is None:
        created.append(
            await _insert_delivery(
                supabase,
                org_id=org_id,
                project_id=project_id,
                case_id=case_id,
                generation_id=generation_id,
                recipient_user_id=None,
                channel="web",
                status="unavailable",
                sent_at=None,
            )
        )
        return DeliveryOutcome(deliveries=created)

    if "web" in channels:
        web = await _insert_delivery(
            supabase,
            org_id=org_id,
            project_id=project_id,
            case_id=case_id,
            generation_id=generation_id,
            recipient_user_id=recipient_user_id,
            channel="web",
            status="sent",
            sent_at=_now().isoformat(),
        )
        created.append(web)
        delivery_id = web.get("id")
        if delivery_id:
            try:
                await issue_delivery_capability(
                    supabase,
                    delivery_id=str(delivery_id),
                    organization_id=org_id,
                    recipient_user_id=recipient_user_id,
                )
            except Exception:
                logger.exception("delivery_capability_issue_failed", delivery_id=delivery_id)

    telegram_sent = False
    chat_id = await _recipient_chat_id(supabase, recipient_user_id) if "telegram" in channels else None
    if "telegram" in channels:
        if chat_id:
            client = await get_telegram_client_for_org(org_id)
            if client is not None:
                artifact = await _download_generation(supabase, generation)
                copy = vendor_draft_delivered_copy(lot_label=lot_label)
                caption = f"📄 {copy.message} ({ESCRITURA_BORRADOR_NOTICE})"
                if artifact is not None:
                    response = await client.send_document(
                        chat_id,
                        document_bytes=artifact,
                        filename=f"Borrador escritura {lot_label}.docx",
                        caption=caption,
                    )
                else:
                    response = await client.send_text(
                        chat_id, f"{caption}\nDisponible de forma privada en Plotify."
                    )
                telegram_sent = response is not None
        created.append(
            await _insert_delivery(
                supabase,
                org_id=org_id,
                project_id=project_id,
                case_id=case_id,
                generation_id=generation_id,
                recipient_user_id=recipient_user_id,
                channel="telegram",
                status="sent" if telegram_sent else ("unavailable" if not chat_id else "failed"),
                sent_at=_now().isoformat() if telegram_sent else None,
            )
        )

    return DeliveryOutcome(
        deliveries=created,
        telegram_sent=telegram_sent,
        web_available="web" in channels,
        recipient_has_telegram=bool(chat_id),
    )


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def _delivery_view(row: dict[str, Any], *, status: str) -> dict[str, Any]:
    generation_id = str(row["generation_id"])
    return {
        "id": row["id"],
        "escritura_case_id": row["escritura_case_id"],
        "generation_id": generation_id,
        "file_id": generation_id if status == "sent" else None,
        "recipient_user_id": row.get("recipient_user_id"),
        "channel": row["channel"],
        "status": status,
        "link_expires_at": row.get("link_expires_at"),
        "sent_at": row.get("sent_at"),
        "created_at": row["created_at"],
        "status_label": delivery_status_label(status),
    }


async def list_vendor_deliveries(
    supabase: Any, *, recipient_user_id: str, organization_id: str
) -> list[dict[str, Any]]:
    result = await asyncio.to_thread(
        lambda: supabase.table("escritura_deliveries")
        .select(DELIVERY_COLUMNS)
        .eq("organization_id", organization_id)
        .eq("recipient_user_id", recipient_user_id)
        .order("created_at", desc=True)
        .execute()
    )
    rows = result.data if isinstance(result.data, list) else []
    by_generation: dict[str, dict[str, Any]] = {}
    for row in rows:
        generation_id = str(row.get("generation_id"))
        current = by_generation.get(generation_id)
        if current is None or (row.get("channel") == "web" and current.get("channel") != "web"):
            by_generation[generation_id] = row

    now = _now()
    views: list[dict[str, Any]] = []
    for row in by_generation.values():
        persisted_status = str(row.get("status") or "")
        expires = _parse_iso(row.get("link_expires_at"))
        effective = "expired" if expires and expires < now and persisted_status == "sent" else persisted_status
        views.append(_delivery_view(row, status=effective))
    return views


async def renew_delivery_link(
    supabase: Any, *, delivery_id: str, recipient_user_id: str, organization_id: str
) -> dict[str, Any] | None:
    result = await asyncio.to_thread(
        lambda: supabase.table("escritura_deliveries")
        .select(DELIVERY_COLUMNS)
        .eq("id", delivery_id)
        .eq("organization_id", organization_id)
        .eq("recipient_user_id", recipient_user_id)
        .maybe_single()
        .execute()
    )
    row = result.data if result is not None and isinstance(result.data, dict) else None
    if not row:
        return None
    issued = await issue_delivery_capability(
        supabase,
        delivery_id=delivery_id,
        organization_id=organization_id,
        recipient_user_id=recipient_user_id,
    )
    updated = await asyncio.to_thread(
        lambda: supabase.table("escritura_deliveries")
        .update({"link_expires_at": issued.expires_at, "status": "sent"})
        .eq("id", delivery_id)
        .eq("organization_id", organization_id)
        .eq("recipient_user_id", recipient_user_id)
        .execute()
    )
    rows = updated.data if isinstance(updated.data, list) else []
    fresh = rows[0] if rows else {**row, "link_expires_at": issued.expires_at, "status": "sent"}
    return _delivery_view(fresh, status="sent")
