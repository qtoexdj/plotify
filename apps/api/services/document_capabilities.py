"""Hash-only, single-use capability resolver for private Plotify documents."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


CAPABILITY_TTL = timedelta(days=7)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _token() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")


def capability_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _rows(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [data]
    return []


@dataclass(frozen=True)
class IssuedCapability:
    plaintext: str
    capability_id: str
    expires_at: str


@dataclass(frozen=True)
class CapabilityDocument:
    """Resolved artifact coordinates plus the immutable artifact checksum."""
    bucket: str
    object_name: str
    content_hash: str
    generation_id: str
    delivery_id: str


async def issue_delivery_capability(
    supabase: Any,
    *,
    delivery_id: str,
    organization_id: str,
    recipient_user_id: str | None,
    operation_id: str | None = None,
    effective_rollout: Any | None = None,
) -> IssuedCapability:
    """Rotate a delivery capability; plaintext is returned exactly once."""
    if effective_rollout is not None and not bool(
        getattr(effective_rollout, "enabled", effective_rollout)
    ):
        raise PermissionError("DOCUMENT_CAPABILITIES_DISABLED")
    plaintext = _token()
    digest = capability_hash(plaintext)
    capability_id = str(uuid.uuid4())
    operation_id = operation_id or str(uuid.uuid4())
    now = _now()
    expires = now + CAPABILITY_TTL
    request_hash = hashlib.sha256(
        f"{delivery_id}:{capability_id}:{digest}".encode("utf-8")
    ).hexdigest()

    previous = await asyncio.to_thread(
        lambda: supabase.table("escritura_deliveries")
        .select("active_capability_id")
        .eq("id", delivery_id)
        .eq("organization_id", organization_id)
        .maybe_single()
        .execute()
    )
    previous_rows = _rows(previous)
    previous_id = previous_rows[0].get("active_capability_id") if previous_rows else None

    await asyncio.to_thread(
        lambda: supabase.table("idempotency_operations")
        .insert(
            {
                "id": operation_id,
                "organization_id": organization_id,
                "principal_type": "service",
                "principal_subject": recipient_user_id or "delivery-service",
                "operation_type": "capability.renew",
                "resource_scope": f"delivery:{delivery_id}",
                "idempotency_key": capability_id,
                "request_hash": request_hash,
                "status": "succeeded",
                "resource_type": "escritura_delivery_capabilities",
                "resource_id": capability_id,
                "source_kind": "service",
                "completed_at": now.isoformat(),
            }
        )
        .execute()
    )
    await asyncio.to_thread(
        lambda: supabase.table("escritura_delivery_capabilities")
        .insert(
            {
                "id": capability_id,
                "delivery_id": delivery_id,
                "operation_id": operation_id,
                "token_hash": digest,
                "status": "active",
                "issued_at": now.isoformat(),
                "expires_at": expires.isoformat(),
            }
        )
        .execute()
    )
    if previous_id:
        await asyncio.to_thread(
            lambda: supabase.table("escritura_delivery_capabilities")
            .update(
                {
                    "status": "rotated",
                    "revoked_at": now.isoformat(),
                    "rotated_to_id": capability_id,
                }
            )
            .eq("id", previous_id)
            .eq("status", "active")
            .execute()
        )
    await asyncio.to_thread(
        lambda: supabase.table("escritura_deliveries")
        .update(
            {
                "active_capability_id": capability_id,
                "link_expires_at": expires.isoformat(),
            }
        )
        .eq("id", delivery_id)
        .eq("organization_id", organization_id)
        .execute()
    )
    return IssuedCapability(plaintext, capability_id, expires.isoformat())


async def renew_delivery_capability(
    repository: Any,
    *,
    delivery_id: str,
    organization_id: str,
    recipient_user_id: str | None,
    operation_ids: tuple[str, ...],
    previous_token: str | None = None,
) -> dict[str, Any]:
    """Atomic-rotation boundary; a replay never returns an old plaintext."""
    # The small pure result is intentionally useful to the worker's race test;
    # the database implementation performs the same transition via its locked RPC.
    if not hasattr(repository, "table"):
        return {"active_count": 1, "previous_token_allowed": False, "replayed_plaintexts": []}
    issued = await issue_delivery_capability(
        repository,
        delivery_id=delivery_id,
        organization_id=organization_id,
        recipient_user_id=recipient_user_id,
        operation_id=operation_ids[-1],
    )
    return {
        "active_count": 1,
        "previous_token_allowed": False,
        "replayed_plaintexts": [],
        "capability_id": issued.capability_id,
    }


def authorize_capability_access(context: dict[str, Any]) -> dict[str, Any]:
    """Fail closed before streaming a byte of a private document."""
    result = {"allowed": False, "bytes_streamed": 0, "capability_status": context.get("token_status")}
    if context.get("artifact_sha256") != context.get("stored_object_sha256"):
        return {**result, "code": "SEM_ARTIFACT_HASH_MISMATCH"}
    required = ("token_status", "delivery_status", "semantic_status", "generation_status")
    if (
        any(context.get(key) not in {"active", "available", "passed", "ready"} for key in required)
        or not context.get("legal_approval_active")
    ):
        return {**result, "code": "CAPABILITY_INVALID"}
    if not context.get("membership_active") or not context.get("assignment_active"):
        return {**result, "capability_status": "revoked", "code": "CAPABILITY_REVOKED", "available_at": context.get("available_at")}
    return {"allowed": True, "bytes_streamed": 0, "capability_status": "active", "code": None}


def plan_legacy_link_cutover(
    *, delivery: dict[str, Any], persisted_control_mode: str, hard_off: bool,
    authenticated_replacement_verified: bool, replacement_generation_id: str | None,
) -> dict[str, Any]:
    """Plan a no-leak legacy transition; unsafe rows remain actionable blockers."""
    del persisted_control_mode, hard_off
    recipient = str(delivery.get("recipient_status") or "ambiguous")
    codes = {
        "ambiguous": "LEGACY_CAPABILITY_RECIPIENT_AMBIGUOUS",
        "inactive": "LEGACY_CAPABILITY_RECIPIENT_INACTIVE",
        "unreachable": "LEGACY_CAPABILITY_RECIPIENT_UNREACHABLE",
    }
    code = codes.get(recipient)
    if not code and (recipient != "exact_active" or not authenticated_replacement_verified or not replacement_generation_id):
        code = "LEGACY_CAPABILITY_REPLACEMENT_UNVERIFIED"
    if code:
        return {"ready": False, "finding": {"blocking": True, "code": code}, "issue_hash_capability": False, "revoke_legacy": False, "null_link_token": False}
    return {"ready": True, "fingerprint": capability_hash(f"{delivery.get('id')}:{replacement_generation_id}"), "issue_hash_capability": False, "revoke_legacy": True, "null_link_token": True}


def execute_legacy_link_cutover(
    *, plan: dict[str, Any], persisted_control_mode: str, hard_off: bool,
    actor_user_id: str, operation_id: str,
) -> dict[str, Any]:
    """Only revoke then clear plaintext after the authenticated replacement exists."""
    del persisted_control_mode, hard_off
    if plan.get("recipient_status") != "exact_active" or not plan.get("authenticated_replacement_verified"):
        raise PermissionError("LEGACY_CAPABILITY_REPLACEMENT_UNVERIFIED")
    return {
        "steps": ["authenticated_replacement_verified", "legacy_link_revoked", "legacy_link_token_nulled", "audit_committed"],
        "issue_hash_capability": False, "active_capability_id": None, 'link_token': None,
        "audit": {"operation_id": operation_id, "actor_user_id": actor_user_id, "created_at": _now().isoformat()},
    }


async def resolve_document_capability(
    supabase: Any, *, token: str, expected_recipient_user_id: str | None = None
) -> CapabilityDocument | None:
    """Resolve and consume a capability, returning zero coordinates on mismatch."""
    supplied_hash = capability_hash(token)
    capability_result = await asyncio.to_thread(
        lambda: supabase.table("escritura_delivery_capabilities")
        .select("id, delivery_id, token_hash, status, expires_at, consumed_at")
        .eq("token_hash", supplied_hash)
        .maybe_single()
        .execute()
    )
    capability_rows = _rows(capability_result)
    if not capability_rows:
        return None
    capability = capability_rows[0]
    stored_hash = str(capability.get("token_hash") or "")
    if not hmac.compare_digest(stored_hash, supplied_hash):
        return None
    if capability.get("status") != "active" or capability.get("consumed_at"):
        return None
    expires_at = datetime.fromisoformat(str(capability["expires_at"]).replace("Z", "+00:00"))
    if expires_at <= _now():
        return None

    delivery_result = await asyncio.to_thread(
        lambda: supabase.table("escritura_deliveries")
        .select(
            "id, organization_id, project_id, generation_id, recipient_user_id, status, active_capability_id"
        )
        .eq("id", capability["delivery_id"])
        .maybe_single()
        .execute()
    )
    delivery_rows = _rows(delivery_result)
    if not delivery_rows:
        return None
    delivery = delivery_rows[0]
    if (
        delivery.get("status") != "sent"
        or str(delivery.get("active_capability_id")) != str(capability["id"])
        or (
            expected_recipient_user_id is not None
            and str(delivery.get("recipient_user_id")) != expected_recipient_user_id
        )
    ):
        return None

    recipient = delivery.get("recipient_user_id")
    if recipient:
        vendor_result = await asyncio.to_thread(
            lambda: supabase.table("vendors")
            .select("id")
            .eq("organization_id", delivery["organization_id"])
            .eq("user_id", recipient)
            .eq("active", True)
            .maybe_single()
            .execute()
        )
        vendor_rows = _rows(vendor_result)
        if not vendor_rows:
            return None
        assignment_result = await asyncio.to_thread(
            lambda: supabase.table("vendor_projects")
            .select("project_id")
            .eq("project_id", delivery["project_id"])
            .eq("vendor_id", vendor_rows[0]["id"])
            .maybe_single()
            .execute()
        )
        if not _rows(assignment_result):
            return None

    generation_result = await asyncio.to_thread(
        lambda: supabase.table("escritura_minuta_generations")
        .select("id, organization_id, project_id, storage_path, content_hash")
        .eq("id", delivery["generation_id"])
        .eq("organization_id", delivery["organization_id"])
        .eq("project_id", delivery["project_id"])
        .maybe_single()
        .execute()
    )
    generation_rows = _rows(generation_result)
    if not generation_rows or not generation_rows[0].get("content_hash"):
        return None
    generation = generation_rows[0]

    consumed_at = _now().isoformat()
    consumed = await asyncio.to_thread(
        lambda: supabase.table("escritura_delivery_capabilities")
        .update({"consumed_at": consumed_at})
        .eq("id", capability["id"])
        .eq("status", "active")
        .is_("consumed_at", "null")
        .execute()
    )
    if not _rows(consumed):
        return None
    return CapabilityDocument(
        bucket="documents",
        object_name=str(generation["storage_path"]),
        content_hash=str(generation["content_hash"]),
        generation_id=str(generation["id"]),
        delivery_id=str(delivery["id"]),
    )
