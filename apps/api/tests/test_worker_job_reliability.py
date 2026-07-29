"""T073 RED contract for ARQ jobs not backed by workflow_outbox."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from arq import Retry

from services.worker_job_failures import (
    WORKER_RETRY_NOT_IMPLEMENTED,
    WorkerFailure,
    classify_worker_exception,
    handle_worker_exception,
    persist_worker_failure,
    require_explicit_job_outcome,
)


class FakeInsert:
    def __init__(self, client: "FakeFailureClient"):
        self.client = client

    def insert(self, payload):
        self.client.inserted.append(payload)
        return self

    def execute(self):
        return SimpleNamespace(data=self.client.inserted[-1:])


class FakeFailureClient:
    def __init__(self):
        self.inserted: list[dict] = []

    def table(self, table_name: str):
        assert table_name == "worker_job_failures"
        return FakeInsert(self)


def _ctx(*, attempt: int = 1, max_tries: int = 3) -> dict:
    return {
        "job_id": "job-1",
        "job_try": attempt,
        "max_tries": max_tries,
        "queue_name": "arq:queue",
    }


def test_transient_exception_is_classified_for_explicit_retry():
    disposition, code, delay = classify_worker_exception(
        TimeoutError("provider timeout"),
        attempt_number=1,
        max_attempts=3,
    )

    assert disposition == "retry_scheduled"
    assert code == "TIMEOUT"
    assert delay is not None and delay > 0


@pytest.mark.asyncio
async def test_normal_exception_persists_failure_and_raises_arq_retry():
    client = FakeFailureClient()

    with pytest.raises(Retry):
        await handle_worker_exception(
            _ctx(),
            TimeoutError("phone=+56911111111"),
            operation_id="operation-1",
            task_name="notify_admin_approval",
            payload={"phone": "+56911111111", "text": "private"},
            client=client,
        )

    assert len(client.inserted) == 1
    assert client.inserted[0]["status"] == "retry_scheduled"


@pytest.mark.asyncio
async def test_terminal_or_last_attempt_is_durable_and_redacted():
    client = FakeFailureClient()
    failure = WorkerFailure(
        operation_id="operation-1",
        queue_name="arq:queue",
        task_name="notify_admin_approval",
        job_id="job-1",
        payload_fingerprint="sha256:payload",
        error_code="TENANT_MISMATCH",
        error_class="terminal",
        disposition="dead_letter",
        attempt_count=3,
        max_attempts=3,
        next_attempt_seconds=None,
    )

    stored = await persist_worker_failure(failure, client=client)

    assert stored.disposition == "dead_letter"
    serialized = repr(client.inserted)
    for secret in ("+56911111111", "private", "Traceback", "password"):
        assert secret not in serialized, f"{WORKER_RETRY_NOT_IMPLEMENTED}: PII en DLQ"


def test_missing_arq_outcome_is_never_fabricated_as_success():
    with pytest.raises(
        RuntimeError,
        match=WORKER_RETRY_NOT_IMPLEMENTED,
    ):
        require_explicit_job_outcome({"job_id": "job-1"})


def test_on_job_end_without_explicit_outcome_cannot_silently_return():
    worker_source = (
        Path(__file__).resolve().parents[1] / "workers" / "main_worker.py"
    ).read_text()

    assert 'ctx.get("success", True)' not in worker_source, (
        f"{WORKER_RETRY_NOT_IMPLEMENTED}: "
        "on_job_end trató la ausencia de resultado como éxito"
    )
