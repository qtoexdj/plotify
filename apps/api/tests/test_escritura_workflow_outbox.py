"""T073 RED contract for the durable escritura workflow worker."""

from __future__ import annotations

import asyncio
from dataclasses import asdict, replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.escritura_workflow_outbox import (
    AUTOMATIC_ESCRITURA_DEFERRED_NOT_IMPLEMENTED,
    HEARTBEAT_SECONDS,
    LEASE_SECONDS,
    MAX_ATTEMPTS,
    RETRY_BACKOFF_SECONDS,
    EscrituraWorkflowOutboxRepository,
    WorkflowOutboxItem,
    classify_outbox_error,
)
from workers.tasks import escritura_workflow_outbox as outbox_task


def _item(
    *,
    status: str = "processing",
    attempt_count: int = 0,
    lease_owner: str | None = "worker-a",
) -> WorkflowOutboxItem:
    return WorkflowOutboxItem(
        id="outbox-1",
        organization_id="org-1",
        aggregate_id="approval-1",
        operation_id="operation-1",
        event_fingerprint="sha256:outbox",
        payload={"schemaVersion": 1, "lotId": "lot-1"},
        status=status,  # type: ignore[arg-type]
        attempt_count=attempt_count,
        lease_owner=lease_owner,
        lease_expires_at="2026-07-24T12:01:00Z" if lease_owner else None,
        heartbeat_at="2026-07-24T12:00:00Z" if lease_owner else None,
    )


class FakeRpc:
    def __init__(self, client: "FakeOutboxClient", name: str, args: dict):
        self.client = client
        self.name = name
        self.args = args

    def execute(self):
        self.client.calls.append((self.name, self.args))
        response = self.client.responses.get(self.name)
        if callable(response):
            response = response(self.args)
        return SimpleNamespace(data=response)


class FakeOutboxClient:
    def __init__(self, responses: dict[str, object] | None = None):
        self.responses = responses or {}
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name: str, args: dict) -> FakeRpc:
        return FakeRpc(self, name, args)


@pytest.mark.asyncio
async def test_claim_is_skip_locked_with_60_second_lease_and_single_owner():
    claimed = _item()
    claim_count = 0

    def claim_once(_args):
        nonlocal claim_count
        claim_count += 1
        if claim_count == 1:
            return {"outcome": "claimed", "item": asdict(claimed)}
        return {"outcome": "idle", "item": None}

    repository = EscrituraWorkflowOutboxRepository(
        FakeOutboxClient({"claim_workflow_outbox": claim_once})
    )

    first, second = await asyncio.gather(
        repository.claim("worker-a"),
        repository.claim("worker-b"),
    )

    claimed_results = [result for result in (first, second) if result.item]
    assert len(claimed_results) == 1, (
        f"{AUTOMATIC_ESCRITURA_DEFERRED_NOT_IMPLEMENTED}: "
        "SKIP LOCKED debe entregar una fila a un solo worker"
    )
    assert LEASE_SECONDS == 60


@pytest.mark.asyncio
async def test_expired_lease_is_reclaimed_with_same_operation_and_fingerprint():
    repository = EscrituraWorkflowOutboxRepository(
        FakeOutboxClient(
            {
                "claim_workflow_outbox": {
                    "outcome": "claimed",
                    "item": asdict(replace(_item(), lease_owner="worker-b")),
                }
            }
        )
    )

    result = await repository.claim("worker-b")

    assert result.item is not None
    assert result.item.operation_id == "operation-1"
    assert result.item.event_fingerprint == "sha256:outbox"


@pytest.mark.asyncio
async def test_heartbeat_contract_is_15_seconds_inside_60_second_lease():
    repository = EscrituraWorkflowOutboxRepository(FakeOutboxClient())

    renewed = await repository.heartbeat("outbox-1", worker_id="worker-a")

    assert renewed.lease_owner == "worker-a"
    assert HEARTBEAT_SECONDS == 15
    assert HEARTBEAT_SECONDS < LEASE_SECONDS


@pytest.mark.parametrize(
    ("boundary", "hard_off"),
    [
        ("missing", False),
        ("read_error", False),
        ("off", False),
        ("hard_off", True),
    ],
)
@pytest.mark.asyncio
async def test_ineligible_rollout_defers_before_lease_attempt_or_dlq(
    boundary: str,
    hard_off: bool,
):
    deferred = replace(
        _item(status="deferred_feature_off", lease_owner=None),
        attempt_count=0,
    )
    repository = EscrituraWorkflowOutboxRepository(
        FakeOutboxClient(
            {
                "claim_workflow_outbox": {
                    "outcome": "deferred_feature_off",
                    "item": asdict(deferred),
                    "deferred_reason": boundary,
                    "control_fingerprint": "sha256:control",
                }
            }
        )
    )

    result = await repository.claim("worker-a", hard_off=hard_off)

    assert result.outcome == "deferred_feature_off"
    assert result.item is not None
    assert result.item.attempt_count == 0
    assert result.item.lease_owner is None
    assert result.item.status != "dead_letter"


@pytest.mark.parametrize("mode", ["projects", "on"])
@pytest.mark.asyncio
async def test_project_or_global_on_claims_eligible_row(mode: str):
    repository = EscrituraWorkflowOutboxRepository(
        FakeOutboxClient(
            {
                "claim_workflow_outbox": {
                    "outcome": "claimed",
                    "item": asdict(_item()),
                    "resolved_mode": mode,
                }
            }
        )
    )

    result = await repository.claim("worker-a")

    assert result.outcome == "claimed"
    assert result.item is not None
    assert result.item.lease_owner == "worker-a"
    assert result.item.attempt_count == 0


@pytest.mark.asyncio
async def test_control_flip_after_claim_releases_without_consuming_attempt():
    repository = EscrituraWorkflowOutboxRepository(FakeOutboxClient())

    released = await repository.release_for_feature_off(
        "outbox-1",
        worker_id="worker-a",
        reason="hard_off",
        control_fingerprint="sha256:new-control",
    )

    assert released.status == "deferred_feature_off"
    assert released.attempt_count == 0
    assert released.lease_owner is None


@pytest.mark.parametrize(
    ("error", "expected_class"),
    [
        (TimeoutError("provider timeout"), "retryable"),
        (ConnectionError("storage unavailable"), "retryable"),
        (ValueError("immutable payload corrupt"), "terminal"),
        (PermissionError("tenant mismatch"), "terminal"),
    ],
)
def test_errors_are_classified_without_persisting_exception_text(
    error: Exception,
    expected_class: str,
):
    classification = classify_outbox_error(error, attempt_number=1)

    assert classification.error_class == expected_class
    assert str(error) not in classification.error_code


@pytest.mark.asyncio
async def test_retry_backoff_is_bounded_and_eighth_attempt_dead_letters():
    repository = EscrituraWorkflowOutboxRepository(FakeOutboxClient())

    retry = await repository.record_failure(
        _item(attempt_count=1),
        TimeoutError("temporary"),
    )
    dead_letter = await repository.record_failure(
        _item(attempt_count=MAX_ATTEMPTS),
        TimeoutError("still unavailable"),
    )

    assert RETRY_BACKOFF_SECONDS == (5, 15, 30, 60, 120, 300, 900, 1800)
    assert retry.status == "retry_scheduled"
    assert dead_letter.status == "dead_letter"
    assert dead_letter.attempt_count == 8


class FakeWorkflowWorkerRepository:
    def __init__(self, item: WorkflowOutboxItem):
        self.item = item
        self.claim = AsyncMock(return_value=SimpleNamespace(outcome="claimed", item=item))
        self.begin_attempt = AsyncMock(return_value=item)
        self.complete = AsyncMock(return_value=replace(item, status="completed"))
        self.release_for_feature_off = AsyncMock(
            return_value=replace(
                item,
                status="deferred_feature_off",
                lease_owner=None,
                lease_expires_at=None,
                heartbeat_at=None,
            )
        )
        self.record_failure = AsyncMock(
            return_value=replace(
                item,
                status="retry_scheduled",
                lease_owner=None,
                lease_expires_at=None,
                heartbeat_at=None,
            )
        )


@pytest.mark.asyncio
async def test_worker_rechecks_control_after_claim_before_consuming_attempt(monkeypatch):
    repository = FakeWorkflowWorkerRepository(_item())
    monkeypatch.setattr(outbox_task, "_resolve_before_effect", AsyncMock(return_value=False))

    result = await outbox_task.process_escritura_workflow_outbox(
        {
            "escritura_workflow_outbox_repository": repository,
            "automatic_escritura_hard_off": True,
        }
    )

    assert result["status"] == "deferred_feature_off"
    repository.begin_attempt.assert_not_awaited()
    repository.release_for_feature_off.assert_awaited_once()


@pytest.mark.asyncio
async def test_worker_completes_after_durable_attempt(monkeypatch):
    item = replace(
        _item(), payload={"escritura_case_id": "case-1", "project_id": "project-1"}
    )
    repository = FakeWorkflowWorkerRepository(item)
    cascade = AsyncMock(return_value=SimpleNamespace(outcome="completed"))
    monkeypatch.setattr(outbox_task, "_resolve_before_effect", AsyncMock(return_value=True))
    from services import escritura_auto_pipeline

    monkeypatch.setattr(escritura_auto_pipeline, "run_case_cascade", cascade)

    result = await outbox_task.process_escritura_workflow_outbox(
        {
            "escritura_workflow_outbox_repository": repository,
            "automatic_escritura_hard_off": False,
        }
    )

    assert result["status"] == "completed"
    repository.begin_attempt.assert_awaited_once_with(item.id, worker_id="escritura-workflow")
    repository.complete.assert_awaited_once_with(item.id, worker_id="escritura-workflow")


@pytest.mark.asyncio
async def test_worker_persists_durable_retry_when_cascade_fails(monkeypatch):
    repository = FakeWorkflowWorkerRepository(
        replace(_item(), payload={"escritura_case_id": "case-1"})
    )
    monkeypatch.setattr(outbox_task, "_resolve_before_effect", AsyncMock(return_value=True))
    from services import escritura_auto_pipeline

    monkeypatch.setattr(
        escritura_auto_pipeline,
        "run_case_cascade",
        AsyncMock(side_effect=TimeoutError("provider timeout")),
    )

    result = await outbox_task.process_escritura_workflow_outbox(
        {
            "escritura_workflow_outbox_repository": repository,
            "automatic_escritura_hard_off": False,
        }
    )

    assert result["status"] == "retry_scheduled"
    repository.record_failure.assert_awaited_once()
