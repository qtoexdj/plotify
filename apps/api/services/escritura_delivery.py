"""SDD 011 T016: entrega del borrador aceptado al vendedor (FR-010/FR-012).

Entrega de **dos niveles**, auditada en `escritura_deliveries`:

1. **Enlace seguro con vencimiento** (siempre): la vía web que nunca falla por
   restricciones de canal. Vence a los 7 días (data-model decisión B1).
2. **Archivo por Telegram** (best-effort): `send_document`; si el vendedor no
   tiene Telegram vinculado se registra `unavailable` y cae a "mis documentos".

Jamás falla en silencio: cada intento deja su fila auditada (quién, a quién,
canal, enlace, vencimiento, estado, cuándo).
"""

from __future__ import annotations

import asyncio
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from core.logger import get_logger
from integrations.telegram_client import get_telegram_client_for_org
from services.escritura_notifications import vendor_draft_delivered_copy
from services.legal_microcopy import ESCRITURA_BORRADOR_NOTICE, FLOW_STATE_LABELS

logger = get_logger(__name__)

DELIVERY_BUCKET = "documents"
LINK_TTL_DAYS = 7
SIGNED_URL_TTL_SECONDS = LINK_TTL_DAYS * 24 * 60 * 60  # 7 días

DELIVERY_COLUMNS = (
    "id, organization_id, project_id, escritura_case_id, generation_id, "
    "recipient_user_id, channel, link_token, link_expires_at, status, "
    "sent_at, created_at"
)

# Frases humanas del estado de una entrega (FR-014, diccionario único). El
# estado "entregada" DERIVA del diccionario de flujo, no se redacta dos veces:
# misma frase en notificaciones, mesa, CCL y "mis documentos del vendedor".
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


def _new_link_token() -> str:
    return secrets.token_urlsafe(32)


@dataclass(frozen=True)
class DeliveryOutcome:
    """Resultado de una entrega: las filas auditadas + el estado de los canales."""

    deliveries: list[dict[str, Any]] = field(default_factory=list)
    telegram_sent: bool = False
    web_available: bool = False
    recipient_has_telegram: bool = False


async def _signed_url(supabase: Any, storage_path: str) -> str:
    if not storage_path:
        return ""
    signed = await asyncio.to_thread(
        lambda: supabase.storage.from_(DELIVERY_BUCKET).create_signed_url(
            storage_path, expires_in=SIGNED_URL_TTL_SECONDS
        )
    )
    if isinstance(signed, dict):
        return str(signed.get("signedURL") or signed.get("signedUrl") or "")
    return ""


async def _download(supabase: Any, storage_path: str) -> bytes | None:
    try:
        data = await asyncio.to_thread(
            lambda: supabase.storage.from_(DELIVERY_BUCKET).download(storage_path)
        )
    except Exception as exc:  # pragma: no cover - defensivo
        logger.warning("escritura_delivery_download_failed", error=str(exc))
        return None
    return data if isinstance(data, (bytes, bytearray)) else None


async def _recipient_chat_id(supabase: Any, recipient_user_id: str | None) -> str | None:
    if not recipient_user_id:
        return None
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("profiles")
            .select("telegram_chat_id")
            .eq("id", recipient_user_id)
            .limit(1)
            .execute()
        )
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
    link_token: str,
    link_expires_at: str,
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
        "link_token": link_token,
        "link_expires_at": link_expires_at,
        "status": status,
        "sent_at": sent_at,
    }
    result = await asyncio.to_thread(
        lambda: supabase.table("escritura_deliveries").insert(payload).execute()
    )
    rows = result.data if isinstance(result.data, list) else []
    row = rows[0] if rows else dict(payload)
    logger.info(
        "escritura_delivery_recorded",
        channel=channel,
        status=status,
        generation_id=generation_id,
        recipient_user_id=recipient_user_id,
    )
    return row


async def deliver_draft(
    *,
    supabase: Any,
    generation: dict[str, Any],
    recipient_user_id: str | None,
    lot_label: str,
    channels: tuple[str, ...] = ("telegram", "web"),
) -> DeliveryOutcome:
    """Entrega el borrador (DOCX de ``generation``) al vendedor, auditado.

    ``generation`` es la fila de ``escritura_minuta_generations`` (org/project/
    case/id/storage_path). El enlace seguro y la fila web se crean siempre; el
    archivo por Telegram es best-effort y nunca falla en silencio.
    """
    org_id = str(generation["organization_id"])
    project_id = str(generation["project_id"])
    case_id = str(generation["escritura_case_id"])
    generation_id = str(generation["id"])
    storage_path = str(generation.get("storage_path") or "")

    link_token = _new_link_token()
    link_expires_at = (_now() + timedelta(days=LINK_TTL_DAYS)).isoformat()
    signed_url = await _signed_url(supabase, storage_path)

    created: list[dict[str, Any]] = []
    telegram_sent = False
    recipient_has_telegram = False

    # (1) Web: la vía que siempre está disponible en "mis documentos".
    if "web" in channels:
        created.append(
            await _insert_delivery(
                supabase,
                org_id=org_id,
                project_id=project_id,
                case_id=case_id,
                generation_id=generation_id,
                recipient_user_id=recipient_user_id,
                channel="web",
                link_token=link_token,
                link_expires_at=link_expires_at,
                status="sent",
                sent_at=_now().isoformat(),
            )
        )

    # (2) Telegram best-effort; jamás silencio si no está vinculado.
    if "telegram" in channels:
        chat_id = await _recipient_chat_id(supabase, recipient_user_id)
        recipient_has_telegram = bool(chat_id)
        if not chat_id:
            created.append(
                await _insert_delivery(
                    supabase,
                    org_id=org_id,
                    project_id=project_id,
                    case_id=case_id,
                    generation_id=generation_id,
                    recipient_user_id=recipient_user_id,
                    channel="telegram",
                    link_token=link_token,
                    link_expires_at=link_expires_at,
                    status="unavailable",
                    sent_at=None,
                )
            )
        else:
            client = await get_telegram_client_for_org(org_id)
            sent = False
            if client is not None:
                document_bytes = await _download(supabase, storage_path)
                copy = vendor_draft_delivered_copy(lot_label=lot_label)
                caption = f"📄 {copy.message} ({ESCRITURA_BORRADOR_NOTICE})"
                if signed_url:
                    caption += f"\nEnlace seguro (7 días): {signed_url}"
                if document_bytes is not None:
                    response = await client.send_document(
                        chat_id,
                        document_bytes=document_bytes,
                        filename=f"Borrador escritura {lot_label}.docx",
                        caption=caption,
                    )
                    sent = response is not None
                else:
                    # Sin archivo descargable: al menos el enlace seguro.
                    response = await client.send_text(chat_id, caption)
                    sent = response is not None
            telegram_sent = sent
            created.append(
                await _insert_delivery(
                    supabase,
                    org_id=org_id,
                    project_id=project_id,
                    case_id=case_id,
                    generation_id=generation_id,
                    recipient_user_id=recipient_user_id,
                    channel="telegram",
                    link_token=link_token,
                    link_expires_at=link_expires_at,
                    status="sent" if sent else "failed",
                    sent_at=_now().isoformat() if sent else None,
                )
            )

    return DeliveryOutcome(
        deliveries=created,
        telegram_sent=telegram_sent,
        web_available="web" in channels,
        recipient_has_telegram=recipient_has_telegram,
    )


# ─── Vista "mis documentos del vendedor" (FR-011 / SC-005) ───────────────────


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


async def _generation_storage_paths(
    supabase: Any, generation_ids: list[Any], organization_id: str
) -> dict[str, str]:
    ids = sorted({str(gid) for gid in generation_ids if gid})
    if not ids:
        return {}
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_minuta_generations")
            .select("id, storage_path")
            .eq("organization_id", organization_id)
            .in_("id", ids)
            .execute()
        )
    )
    rows = result.data if isinstance(result.data, list) else []
    return {str(row["id"]): str(row.get("storage_path") or "") for row in rows}


def _delivery_view(row: dict[str, Any], *, download_url: str | None, status: str) -> dict[str, Any]:
    """Vista segura de una entrega: NUNCA expone el `link_token` crudo."""
    return {
        "id": row["id"],
        "escritura_case_id": row["escritura_case_id"],
        "generation_id": row["generation_id"],
        "recipient_user_id": row.get("recipient_user_id"),
        "channel": row["channel"],
        "status": status,
        "link_expires_at": row.get("link_expires_at"),
        "sent_at": row.get("sent_at"),
        "created_at": row["created_at"],
        "download_url": download_url,
        "status_label": delivery_status_label(status),
    }


async def list_vendor_deliveries(
    supabase: Any, *, recipient_user_id: str, organization_id: str
) -> list[dict[str, Any]]:
    """Entregas del vendedor autenticado SOLAMENTE (FR-011 / SC-005).

    Filtra por organización **y** por vendedor destinatario: jamás devuelve
    documentos de ventas ajenas. Deduplica por documento (una entrada por
    generación, prefiriendo el canal web descargable), resuelve la URL firmada
    y la frase de estado, y nunca expone el `link_token`.
    """
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_deliveries")
            .select(DELIVERY_COLUMNS)
            .eq("organization_id", organization_id)
            .eq("recipient_user_id", recipient_user_id)
            .order("created_at", desc=True)
            .execute()
        )
    )
    rows = result.data if isinstance(result.data, list) else []

    by_generation: dict[str, dict[str, Any]] = {}
    for row in rows:
        gid = str(row.get("generation_id"))
        existing = by_generation.get(gid)
        if existing is None or (
            row.get("channel") == "web" and existing.get("channel") != "web"
        ):
            by_generation[gid] = row

    paths = await _generation_storage_paths(
        supabase, [r.get("generation_id") for r in by_generation.values()], organization_id
    )
    now = _now()
    views: list[dict[str, Any]] = []
    for row in by_generation.values():
        status = str(row.get("status") or "")
        expires = _parse_iso(row.get("link_expires_at"))
        is_expired = expires is not None and expires < now
        effective = "expired" if (is_expired and status == "sent") else status
        storage_path = paths.get(str(row.get("generation_id")))
        download_url = None
        if storage_path and not is_expired and status == "sent":
            download_url = await _signed_url(supabase, storage_path)
        views.append(_delivery_view(row, download_url=download_url, status=effective))
    return views


async def renew_delivery_link(
    supabase: Any, *, delivery_id: str, recipient_user_id: str, organization_id: str
) -> dict[str, Any] | None:
    """Renueva el enlace vencido de UNA entrega del propio vendedor (FR-010).

    Acotada al vendedor + organización: un vendedor no puede renovar (ni tocar)
    la entrega de otro. Devuelve la vista renovada o None si no es suya.
    """
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_deliveries")
            .select(DELIVERY_COLUMNS)
            .eq("id", delivery_id)
            .eq("organization_id", organization_id)
            .eq("recipient_user_id", recipient_user_id)
            .maybe_single()
            .execute()
        )
    )
    row = result.data if isinstance(result.data, dict) else None
    if not row:
        return None
    new_expires = (_now() + timedelta(days=LINK_TTL_DAYS)).isoformat()
    updated = await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_deliveries")
            .update(
                {
                    "link_token": _new_link_token(),
                    "link_expires_at": new_expires,
                    "status": "sent",
                }
            )
            .eq("id", delivery_id)
            .eq("organization_id", organization_id)
            .eq("recipient_user_id", recipient_user_id)
            .execute()
        )
    )
    rows = updated.data if isinstance(updated.data, list) else []
    fresh = rows[0] if rows else {**row, "link_expires_at": new_expires, "status": "sent"}
    paths = await _generation_storage_paths(
        supabase, [fresh.get("generation_id")], organization_id
    )
    storage_path = paths.get(str(fresh.get("generation_id")))
    download_url = await _signed_url(supabase, storage_path) if storage_path else None
    return _delivery_view(fresh, download_url=download_url, status="sent")
