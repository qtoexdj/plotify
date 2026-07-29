"""ARQ consumer for the durable sale-to-escritura workflow obligation."""

from __future__ import annotations

import asyncio
import inspect
import os
from typing import Any

from core.release_flags import parse_hard_off
from services.escritura_workflow_outbox import (
    HEARTBEAT_SECONDS,
    EscrituraWorkflowOutboxRepository,
    WorkflowOutboxItem,
)


async def _resolve_before_effect(
    repository: EscrituraWorkflowOutboxRepository,
    item: WorkflowOutboxItem,
    *,
    hard_off: bool,
) -> bool:
    """Fail closed when the control changes after the atomic claim."""
    if hard_off:
        return False
    project_id = item.payload.get("project_id") or item.payload.get("projectId")
    try:
        response = await asyncio.to_thread(
            lambda: repository.client.rpc(
                "resolve_feature_rollout",
                {
                    "p_feature_key": "automatic_escritura",
                    "p_organization_id": item.organization_id,
                    "p_project_id": project_id,
                },
            ).execute()
        )
    except Exception:
        return False
    data = getattr(response, "data", None)
    if isinstance(data, list):
        data = data[0] if data else False
    if isinstance(data, dict):
        data = next(iter(data.values()), False)
    return data is True


async def _heartbeat_until_done(
    repository: EscrituraWorkflowOutboxRepository,
    item_id: str,
    worker_id: str,
) -> None:
    while True:
        await asyncio.sleep(HEARTBEAT_SECONDS)
        await repository.heartbeat(item_id, worker_id=worker_id)


async def process_escritura_workflow_outbox(
    ctx: dict[str, Any],
    outbox_id: str | None = None,
    *,
    worker_id: str = "escritura-workflow",
) -> dict[str, Any]:
    """Claim one due row; ARQ is only a wakeup and execution host."""
    del outbox_id  # The DB claim selects the next due, lock-safe obligation.
    repository = ctx.get("escritura_workflow_outbox_repository")
    if repository is None:
        repository = EscrituraWorkflowOutboxRepository()
    hard_off = ctx.get("automatic_escritura_hard_off")
    if not isinstance(hard_off, bool):
        hard_off = parse_hard_off(os.getenv("PLOTIFY_HARD_OFF_AUTOMATIC_ESCRITURA"))

    claim = await repository.claim(worker_id, hard_off=hard_off)
    if claim.outcome != "claimed" or claim.item is None:
        ctx["job_outcome"] = True
        return {"status": claim.outcome, "outboxId": None}

    item = claim.item
    if not await _resolve_before_effect(repository, item, hard_off=hard_off):
        released = await repository.release_for_feature_off(
            item.id,
            worker_id=worker_id,
            reason="hard_off" if hard_off else "control_off",
            control_fingerprint=None,
        )
        ctx["job_outcome"] = True
        return {"status": released.status, "outboxId": item.id}

    heartbeat_task = asyncio.create_task(
        _heartbeat_until_done(repository, item.id, worker_id)
    )
    try:
        attempted = await repository.begin_attempt(item.id, worker_id=worker_id)
        from services.escritura_auto_pipeline import run_case_cascade

        arguments = {
            "organization_id": attempted.organization_id,
            "escritura_case_id": attempted.payload.get("escritura_case_id")
            or attempted.payload.get("escrituraCaseId"),
            "trigger": "workflow_outbox",
            "workflow_outbox_id": attempted.id,
            "automatic_escritura_hard_off": hard_off,
        }
        supported = inspect.signature(run_case_cascade).parameters
        result = await run_case_cascade(
            **{key: value for key, value in arguments.items() if key in supported}
        )
        completed = await repository.complete(attempted.id, worker_id=worker_id)
        ctx["job_outcome"] = True
        return {
            "status": completed.status,
            "outboxId": attempted.id,
            "cascadeOutcome": getattr(result, "outcome", None),
        }
    except Exception as error:
        failed = await repository.record_failure(item, error)
        ctx["job_outcome"] = failed.status == "retry_scheduled"
        return {"status": failed.status, "outboxId": item.id}
    finally:
        heartbeat_task.cancel()
        await asyncio.gather(heartbeat_task, return_exceptions=True)
