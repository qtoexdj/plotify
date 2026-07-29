"""T073 RED contract for immutable Meta/Telegram operation identity."""

from __future__ import annotations

import inspect

import pytest

from core.webhook_security import provider_event_key
from services.idempotency_operations import (
    OperationIdentity,
    canonical_request_hash,
    decide_replay,
)
from services.reservations import create_reservation_request_service
from workers.tasks.approval_processor import execute_admin_decision_db


MARKER = "automatic_escritura_deferred_NOT_IMPLEMENTED"


@pytest.mark.parametrize(
    ("provider", "account", "event"),
    [
        ("meta", "whatsapp-business-1", "wamid-1"),
        ("telegram", "bot-1", "update-1"),
    ],
)
def test_provider_identity_is_stable_and_account_scoped(
    provider: str,
    account: str,
    event: str,
):
    identity = provider_event_key(provider, account, event)

    assert identity == provider_event_key(provider, account, event)
    assert identity != provider_event_key(provider, f"{account}-other", event)


def test_same_provider_key_replays_same_payload_after_crash():
    operation_key = provider_event_key("meta", "account-1", "wamid-1")
    request_hash = canonical_request_hash({"messageId": "wamid-1", "action": "sale"})
    existing = OperationIdentity(operation_key, request_hash, "org-1")
    incoming = OperationIdentity(operation_key, request_hash, "org-1")

    assert decide_replay(existing, incoming) == "replay"


def test_same_provider_key_with_different_payload_is_conflict():
    operation_key = provider_event_key("telegram", "bot-1", "update-1")
    existing = OperationIdentity(
        operation_key,
        canonical_request_hash({"action": "approve", "approvalId": "approval-1"}),
        "org-1",
    )
    conflicting = OperationIdentity(
        operation_key,
        canonical_request_hash({"action": "reject", "approvalId": "approval-1"}),
        "org-1",
    )

    assert decide_replay(existing, conflicting) == "conflict"


def test_operation_id_propagates_from_reservation_to_approval_and_outbox():
    reservation_parameters = inspect.signature(
        create_reservation_request_service
    ).parameters
    approval_parameters = inspect.signature(execute_admin_decision_db).parameters
    missing = []
    if "operation_id" not in reservation_parameters:
        missing.append("reservation.operation_id")
    if "operation_id" not in approval_parameters:
        missing.append("approval.operation_id")

    assert not missing, (
        f"{MARKER}: identidad del proveedor no llega al outbox: {', '.join(missing)}"
    )
