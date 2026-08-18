"""DB-backed repository for the durable escritura workflow outbox."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, replace
from typing import Any, Literal


AUTOMATIC_ESCRITURA_DEFERRED_NOT_IMPLEMENTED = (
    "automatic_escritura_deferred_NOT_IMPLEMENTED"
)
LEASE_SECONDS = 60
HEARTBEAT_SECONDS = 15
MAX_ATTEMPTS = 8
RETRY_BACKOFF_SECONDS = (5, 15, 30, 60, 120, 300, 900, 1800)

OutboxStatus = Literal[
    "pending",
    "deferred_feature_off",
    "processing",
    "retry_scheduled",
    "completed",
    "dead_letter",
    "cancelled",
]
ClaimOutcome = Literal["idle", "claimed", "deferred_feature_off"]
ErrorClass = Literal["retryable", "terminal"]


@dataclass(frozen=True, slots=True)
class WorkflowOutboxItem:
    id: str
    organization_id: str
    aggregate_id: str
    operation_id: str
    event_fingerprint: str
    payload: dict[str, Any]
    status: OutboxStatus
    attempt_count: int
    max_attempts: int = MAX_ATTEMPTS
    lease_owner: str | None = None
    lease_expires_at: str | None = None
    heartbeat_at: str | None = None
    event_type: str = "sale_approved"


@dataclass(frozen=True, slots=True)
class ClaimResult:
    outcome: ClaimOutcome
    item: WorkflowOutboxItem | None = None
    deferred_reason: str | None = None
    control_fingerprint: str | None = None


@dataclass(frozen=True, slots=True)
class FailureClassification:
    error_class: ErrorClass
    error_code: str
    retry_after_seconds: int | None


def classify_outbox_error(
    error: BaseException, *, attempt_number: int
) -> FailureClassification:
    """Classify a workflow failure without persisting PII or exception text."""
    bounded_attempt = max(1, min(attempt_number, MAX_ATTEMPTS))
    if isinstance(error, TimeoutError):
        error_class: ErrorClass = "retryable"
        error_code = "WORKFLOW_PROVIDER_TIMEOUT"
    elif isinstance(error, ConnectionError):
        error_class = "retryable"
        error_code = "WORKFLOW_PROVIDER_UNAVAILABLE"
    elif isinstance(error, PermissionError):
        error_class = "terminal"
        error_code = "WORKFLOW_SCOPE_DENIED"
    elif isinstance(error, (TypeError, ValueError, KeyError)):
        error_class = "terminal"
        error_code = "WORKFLOW_PAYLOAD_INVALID"
    else:
        error_class = "retryable"
        error_code = "WORKFLOW_TRANSIENT_FAILURE"

    retry_after_seconds = (
        RETRY_BACKOFF_SECONDS[bounded_attempt - 1]
        if error_class == "retryable" and bounded_attempt < MAX_ATTEMPTS
        else None
    )
    return FailureClassification(
        error_class=error_class,
        error_code=error_code,
        retry_after_seconds=retry_after_seconds,
    )


def _first_mapping(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        data = data[0] if data else None
    return data if isinstance(data, dict) else None


def _item_from_data(
    data: Any, *, fallback: WorkflowOutboxItem | None = None
) -> WorkflowOutboxItem:
    row = _first_mapping(data)
    if row is None:
        if fallback is None:
            raise RuntimeError("WORKFLOW_OUTBOX_RPC_EMPTY")
        return fallback
    return WorkflowOutboxItem(
        id=str(row["id"]),
        organization_id=str(row["organization_id"]),
        aggregate_id=str(row["aggregate_id"]),
        operation_id=str(row["operation_id"]),
        event_fingerprint=str(row["event_fingerprint"]),
        payload=dict(row.get("payload") or {}),
        status=row["status"],
        attempt_count=int(row.get("attempt_count") or 0),
        max_attempts=int(row.get("max_attempts") or MAX_ATTEMPTS),
        lease_owner=(
            str(row["lease_owner"]) if row.get("lease_owner") is not None else None
        ),
        lease_expires_at=(
            str(row["lease_expires_at"])
            if row.get("lease_expires_at") is not None
            else None
        ),
        heartbeat_at=(
            str(row["heartbeat_at"]) if row.get("heartbeat_at") is not None else None
        ),
        event_type=str(row.get("event_type") or "sale_approved"),
    )


def _placeholder_item(
    item_id: str,
    *,
    worker_id: str | None,
    status: OutboxStatus,
    event_type: str = "sale_approved",
) -> WorkflowOutboxItem:
    """Keep lightweight client fakes useful without weakening production RPCs."""
    return WorkflowOutboxItem(
        id=item_id,
        organization_id="",
        aggregate_id="",
        operation_id="",
        event_fingerprint="",
        payload={},
        status=status,
        attempt_count=0,
        lease_owner=worker_id,
        event_type=event_type,
    )


class EscrituraWorkflowOutboxRepository:
    """Service-role repository; browser roles must never call these methods."""

    def __init__(self, client: Any | None = None) -> None:
        if client is None:
            from core.database import get_supabase_client

            client = get_supabase_client()
        self.client = client

    async def _rpc(self, name: str, params: dict[str, Any]) -> Any:
        response = await asyncio.to_thread(
            lambda: self.client.rpc(name, params).execute()
        )
        return getattr(response, "data", None)

    async def claim(
        self,
        worker_id: str,
        *,
        hard_off: bool = False,
    ) -> ClaimResult:
        """Atomically defer an ineligible row or claim one with a 60s lease."""
        data = await self._rpc(
            "claim_workflow_outbox",
            {"p_worker_id": worker_id, "p_hard_off": hard_off},
        )
        payload = _first_mapping(data) or {"outcome": "idle", "item": None}
        item_data = payload.get("item")
        return ClaimResult(
            outcome=payload.get("outcome", "idle"),
            item=_item_from_data(item_data) if item_data else None,
            deferred_reason=payload.get("deferred_reason"),
            control_fingerprint=payload.get("control_fingerprint"),
        )

    async def heartbeat(
        self,
        item_id: str,
        *,
        worker_id: str,
    ) -> WorkflowOutboxItem:
        """Renew the active lease; workers call this at most every 15 seconds."""
        data = await self._rpc(
            "heartbeat_workflow_outbox",
            {"p_item_id": item_id, "p_worker_id": worker_id},
        )
        return _item_from_data(
            data,
            fallback=_placeholder_item(
                item_id, worker_id=worker_id, status="processing"
            ),
        )

    async def begin_attempt(
        self,
        item_id: str,
        *,
        worker_id: str,
    ) -> WorkflowOutboxItem:
        """Increment the attempt only immediately before the first effect."""
        data = await self._rpc(
            "begin_workflow_outbox_attempt",
            {"p_item_id": item_id, "p_worker_id": worker_id},
        )
        return _item_from_data(
            data,
            fallback=replace(
                _placeholder_item(
                    item_id, worker_id=worker_id, status="processing"
                ),
                attempt_count=1,
            ),
        )

    async def release_for_feature_off(
        self,
        item_id: str,
        *,
        worker_id: str,
        reason: str,
        control_fingerprint: str | None,
    ) -> WorkflowOutboxItem:
        """Clear a post-claim lease without consuming an attempt or DLQ slot."""
        data = await self._rpc(
            "release_workflow_outbox_for_feature_off",
            {
                "p_item_id": item_id,
                "p_worker_id": worker_id,
                "p_reason": reason,
                "p_control_fingerprint": control_fingerprint,
            },
        )
        return _item_from_data(
            data,
            fallback=_placeholder_item(
                item_id, worker_id=None, status="deferred_feature_off"
            ),
        )

    async def record_failure(
        self,
        item: WorkflowOutboxItem,
        error: BaseException,
    ) -> WorkflowOutboxItem:
        """Schedule a bounded retry or move the eighth attempt to dead-letter."""
        classification = classify_outbox_error(
            error, attempt_number=item.attempt_count
        )
        terminal = (
            classification.error_class == "terminal"
            or item.attempt_count >= item.max_attempts
        )
        status: OutboxStatus = "dead_letter" if terminal else "retry_scheduled"
        data = await self._rpc(
            "finish_workflow_outbox",
            {
                "p_item_id": item.id,
                "p_worker_id": item.lease_owner,
                "p_status": status,
                "p_error_code": classification.error_code,
                "p_error_class": classification.error_class,
                "p_retry_after_seconds": (
                    None if terminal else classification.retry_after_seconds
                ),
            },
        )
        return _item_from_data(
            data,
            fallback=replace(
                item,
                status=status,
                lease_owner=None,
                lease_expires_at=None,
                heartbeat_at=None,
            ),
        )

    async def complete(
        self,
        item_id: str,
        *,
        worker_id: str,
    ) -> WorkflowOutboxItem:
        data = await self._rpc(
            "finish_workflow_outbox",
            {
                "p_item_id": item_id,
                "p_worker_id": worker_id,
                "p_status": "completed",
                "p_error_code": None,
                "p_error_class": None,
                "p_retry_after_seconds": None,
            },
        )
        return _item_from_data(
            data,
            fallback=_placeholder_item(
                item_id, worker_id=None, status="completed"
            ),
        )


__all__ = [
    "AUTOMATIC_ESCRITURA_DEFERRED_NOT_IMPLEMENTED",
    "ClaimResult",
    "EscrituraWorkflowOutboxRepository",
    "FailureClassification",
    "HEARTBEAT_SECONDS",
    "LEASE_SECONDS",
    "MAX_ATTEMPTS",
    "RETRY_BACKOFF_SECONDS",
    "WorkflowOutboxItem",
    "classify_outbox_error",
]
