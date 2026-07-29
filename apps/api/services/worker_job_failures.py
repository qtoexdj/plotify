"""Public reliability contract for ARQ jobs not backed by workflow_outbox.

T073 keeps this scaffold importable while deliberately RED. T081 supplies the
classified retry and durable redacted dead-letter implementation.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, NoReturn

from arq import Retry


WORKER_RETRY_NOT_IMPLEMENTED = "WORKER_RETRY_NOT_IMPLEMENTED"
GENERAL_JOB_BACKOFF_SECONDS = (5, 15, 30, 60, 120, 300)

FailureDisposition = Literal["retry_scheduled", "dead_letter"]


@dataclass(frozen=True, slots=True)
class WorkerFailure:
    operation_id: str
    queue_name: str
    task_name: str
    job_id: str
    payload_fingerprint: str
    error_code: str
    error_class: str
    disposition: FailureDisposition
    attempt_count: int
    max_attempts: int
    next_attempt_seconds: int | None


def classify_worker_exception(
    error: BaseException,
    *,
    attempt_number: int,
    max_attempts: int,
) -> tuple[FailureDisposition, str, int | None]:
    """Return disposition, redacted stable code and retry delay."""
    if isinstance(error, (PermissionError, ValueError, TypeError, KeyError)):
        return "dead_letter", (
            "TENANT_MISMATCH" if isinstance(error, PermissionError) else "PAYLOAD_INVALID"
        ), None
    if isinstance(error, TimeoutError):
        error_code = "TIMEOUT"
    elif isinstance(error, ConnectionError):
        error_code = "CONNECTION_ERROR"
    else:
        error_code = "UNEXPECTED_ERROR"
    if attempt_number >= max_attempts:
        return "dead_letter", error_code, None
    index = max(0, min(attempt_number - 1, len(GENERAL_JOB_BACKOFF_SECONDS) - 1))
    return "retry_scheduled", error_code, GENERAL_JOB_BACKOFF_SECONDS[index]


async def persist_worker_failure(
    failure: WorkerFailure,
    *,
    client: Any | None = None,
) -> WorkerFailure:
    """Persist identifiers and hashes only, never job payload or stack text."""
    if client is None:
        from core.database import get_supabase_client

        client = get_supabase_client()
    payload = {
        "operation_id": failure.operation_id,
        "queue_name": failure.queue_name,
        "task_name": failure.task_name,
        "job_id": failure.job_id,
        "payload_fingerprint": failure.payload_fingerprint,
        "error_code": failure.error_code,
        "error_class": failure.error_class,
        "status": failure.disposition,
        "attempt_count": failure.attempt_count,
        "max_attempts": failure.max_attempts,
        "next_attempt_at": (
            None
            if failure.next_attempt_seconds is None
            else (datetime.now(UTC) + timedelta(seconds=failure.next_attempt_seconds)).isoformat()
        ),
    }
    await asyncio.to_thread(
        lambda: client.table("worker_job_failures").insert(payload).execute()
    )
    return failure


async def handle_worker_exception(
    ctx: dict[str, Any],
    error: BaseException,
    *,
    operation_id: str,
    task_name: str,
    payload: Any,
    client: Any | None = None,
) -> NoReturn:
    """Persist failure and raise ``arq.Retry`` when another attempt is due."""
    attempt_count = max(1, int(ctx.get("job_try") or 1))
    max_attempts = max(1, int(ctx.get("max_tries") or 3))
    disposition, error_code, delay = classify_worker_exception(
        error, attempt_number=attempt_count, max_attempts=max_attempts
    )
    canonical_payload = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), default=str
    )
    failure = WorkerFailure(
        operation_id=str(operation_id),
        queue_name=str(ctx.get("queue_name") or "arq:default"),
        task_name=task_name,
        job_id=str(ctx.get("job_id") or "unknown"),
        payload_fingerprint="sha256:"
        + hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest(),
        error_code=error_code,
        error_class="terminal" if disposition == "dead_letter" else "retryable",
        disposition=disposition,
        attempt_count=attempt_count,
        max_attempts=max_attempts,
        next_attempt_seconds=delay,
    )
    await persist_worker_failure(failure, client=client)
    ctx["job_outcome"] = False
    if disposition == "retry_scheduled":
        raise Retry(defer=delay)
    raise error


def require_explicit_job_outcome(ctx: dict[str, Any]) -> bool:
    """Read only a documented explicit outcome; absence is never success."""
    outcome = ctx.get("job_outcome")
    if not isinstance(outcome, bool):
        raise RuntimeError(WORKER_RETRY_NOT_IMPLEMENTED)
    return outcome


__all__ = [
    "GENERAL_JOB_BACKOFF_SECONDS",
    "WORKER_RETRY_NOT_IMPLEMENTED",
    "WorkerFailure",
    "classify_worker_exception",
    "handle_worker_exception",
    "persist_worker_failure",
    "require_explicit_job_outcome",
]
