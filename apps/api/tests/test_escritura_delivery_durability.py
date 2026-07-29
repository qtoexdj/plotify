"""SDD019 T075: recipient, delivery and capability durability RED contracts.

These tests deliberately describe the public service boundary required by
T084/T085.  Missing behavior must fail as a functional assertion, never as a
collection/import error.
"""

from __future__ import annotations

import base64
import inspect
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import pytest

from services import document_capabilities
from services import escritura_delivery

ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
GENERATION_ID = "00000000-0000-4000-8000-000000000003"
APPROVAL_ID = "00000000-0000-4000-8000-000000000004"
SELLER_USER_ID = "00000000-0000-4000-8000-000000000005"
OTHER_SELLER_USER_ID = "00000000-0000-4000-8000-000000000006"
ADMIN_USER_ID = "00000000-0000-4000-8000-000000000007"


def _required_callable(module: Any, name: str, marker: str) -> Callable[..., Any]:
    candidate = getattr(module, name, None)
    assert callable(candidate), f"{marker}: falta {module.__name__}.{name}"
    return candidate


def _approved_sale(*, vendor_id: str = "vendor-exact") -> dict[str, Any]:
    return {
        "id": APPROVAL_ID,
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "vendor_id": vendor_id,
        "request_type": "sale",
        "status": "approved",
        "approved_transition_version": 3,
    }


def _seller(*, vendor_id: str, user_id: str | None, active: bool = True) -> dict[str, Any]:
    return {
        "id": vendor_id,
        "organization_id": ORG_ID,
        "user_id": user_id,
        "active": active,
    }


def _snapshot(
    *,
    seller_user_id: str = SELLER_USER_ID,
    admins: tuple[str, ...] = (ADMIN_USER_ID,),
) -> dict[str, Any]:
    return {
        "approval_request_id": APPROVAL_ID,
        "approval_transition_version": 3,
        "seller_user_id": seller_user_id,
        "admin_user_ids": list(admins),
    }


def _web_delivery(**overrides: Any) -> dict[str, Any]:
    row = {
        "id": "delivery-web",
        "generation_id": GENERATION_ID,
        "recipient_user_id": SELLER_USER_ID,
        "recipient_role": "sale_vendor",
        "channel": "web",
        "required": True,
        "delivery_status": "available",
        "capability_status": "active",
        "available_at": "2026-07-24T12:00:00+00:00",
        "first_accessed_at": None,
        "active_capability_id": "capability-current",
    }
    row.update(overrides)
    return row


def test_recipient_snapshot_uses_exact_approved_sale_not_latest_request() -> None:
    build_snapshot = _required_callable(
        escritura_delivery,
        "build_recipient_snapshot",
        "DELIVERY_EXACT_SELLER_NOT_IMPLEMENTED",
    )
    exact = _approved_sale()
    newer_unrelated = {
        **_approved_sale(vendor_id="vendor-newer"),
        "id": "approval-newer",
        "status": "pending",
    }

    result = build_snapshot(
        approved_request=exact,
        sale_requests=[newer_unrelated, exact],
        vendors=[
            _seller(vendor_id="vendor-exact", user_id=SELLER_USER_ID),
            _seller(vendor_id="vendor-newer", user_id=OTHER_SELLER_USER_ID),
        ],
        active_admin_user_ids=[ADMIN_USER_ID],
    )

    assert result["approval_request_id"] == APPROVAL_ID
    assert result["seller_user_id"] == SELLER_USER_ID
    assert result["seller_user_id"] != OTHER_SELLER_USER_ID


def test_recipient_snapshot_blocks_approved_vendor_without_user_id() -> None:
    build_snapshot = _required_callable(
        escritura_delivery,
        "build_recipient_snapshot",
        "VENDOR_USER_LINK_REQUIRED",
    )

    with pytest.raises(Exception, match="VENDOR_USER_LINK_REQUIRED"):
        build_snapshot(
            approved_request=_approved_sale(),
            sale_requests=[_approved_sale()],
            vendors=[_seller(vendor_id="vendor-exact", user_id=None)],
            active_admin_user_ids=[ADMIN_USER_ID],
        )


def test_retry_keeps_frozen_admin_snapshot() -> None:
    build_obligations = _required_callable(
        escritura_delivery,
        "build_delivery_obligations",
        "DELIVERY_RECIPIENT_SNAPSHOT_NOT_IMPLEMENTED",
    )
    frozen = _snapshot(admins=(ADMIN_USER_ID,))

    obligations = build_obligations(
        generation_id=GENERATION_ID,
        recipient_snapshot=frozen,
        current_admin_user_ids=[ADMIN_USER_ID, "admin-added-later"],
        telegram_user_ids=[SELLER_USER_ID, ADMIN_USER_ID, "admin-added-later"],
    )

    recipients = {row["recipient_user_id"] for row in obligations}
    assert ADMIN_USER_ID in recipients
    assert "admin-added-later" not in recipients


def test_delivery_obligations_are_unique_per_generation_recipient_channel() -> None:
    build_obligations = _required_callable(
        escritura_delivery,
        "build_delivery_obligations",
        "DELIVERY_CHANNEL_UNIQUENESS_NOT_IMPLEMENTED",
    )
    obligations = build_obligations(
        generation_id=GENERATION_ID,
        recipient_snapshot=_snapshot(),
        current_admin_user_ids=[ADMIN_USER_ID],
        telegram_user_ids=[SELLER_USER_ID, SELLER_USER_ID, ADMIN_USER_ID],
    )

    keys = [
        (row["generation_id"], row["recipient_user_id"], row["channel"])
        for row in obligations
    ]
    assert len(keys) == len(set(keys))
    seller_web = [
        row
        for row in obligations
        if row["recipient_user_id"] == SELLER_USER_ID and row["channel"] == "web"
    ]
    assert len(seller_web) == 1
    assert seller_web[0]["required"] is True


def test_authenticated_web_history_survives_capability_expiry() -> None:
    summarize = _required_callable(
        escritura_delivery,
        "summarize_delivery_state",
        "DELIVERY_STATUS_AXES_NOT_IMPLEMENTED",
    )
    expired = _web_delivery(
        capability_status="expired",
        active_capability_id=None,
        first_accessed_at="2026-07-24T12:05:00+00:00",
    )

    state = summarize([expired])

    assert state["authenticated_web_available"] is True
    assert state["historically_delivered"] is True
    assert state["capability_status"] == "expired"
    assert state["current_capability_access"] is False


def test_capability_tokens_use_256_bit_csprng_and_unique_hashes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_sizes: list[int] = []
    counter = 0

    def deterministic_token_bytes(size: int) -> bytes:
        nonlocal counter
        requested_sizes.append(size)
        counter += 1
        return counter.to_bytes(size, "big")

    monkeypatch.setattr(document_capabilities.secrets, "token_bytes", deterministic_token_bytes)

    plaintexts = [document_capabilities._token() for _ in range(32)]
    decoded = [
        base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        for token in plaintexts
    ]
    hashes = [document_capabilities.capability_hash(token) for token in plaintexts]

    assert requested_sizes == [32] * 32
    assert all(len(raw) == 32 for raw in decoded)
    assert len(plaintexts) == len(set(plaintexts))
    assert len(hashes) == len(set(hashes))
    assert all(token not in digest for token, digest in zip(plaintexts, hashes, strict=True))


def test_capability_issue_contract_is_idempotent_and_plaintext_once() -> None:
    signature = inspect.signature(document_capabilities.issue_delivery_capability)

    assert "operation_id" in signature.parameters, (
        "CAPABILITY_PLAINTEXT_ONCE_NOT_IMPLEMENTED: "
        "la emisión no tiene identidad durable para impedir revelar el plaintext en replay"
    )
    assert "effective_rollout" in signature.parameters, (
        "DOCUMENT_CAPABILITIES_CONTROL_NOT_ENFORCED: "
        "la emisión no recibe la resolución persistida+hard-off"
    )


@pytest.mark.asyncio
async def test_atomic_rotation_race_leaves_one_active_and_denies_previous() -> None:
    rotate = _required_callable(
        document_capabilities,
        "renew_delivery_capability",
        "CAPABILITY_ROTATION_RACE_NOT_IMPLEMENTED",
    )
    repository = object()

    result = await rotate(
        repository,
        delivery_id="delivery-web",
        organization_id=ORG_ID,
        recipient_user_id=SELLER_USER_ID,
        operation_ids=("rotation-a", "rotation-b"),
        previous_token="legacy-plaintext",
    )

    assert result["active_count"] == 1
    assert result["previous_token_allowed"] is False
    assert result["replayed_plaintexts"] == []


@pytest.mark.parametrize(
    ("change", "expected_code"),
    [
        ({"artifact_sha256": "sha256:changed"}, "SEM_ARTIFACT_HASH_MISMATCH"),
        ({"semantic_status": "failed"}, "CAPABILITY_INVALID"),
        ({"legal_approval_active": False}, "CAPABILITY_INVALID"),
    ],
)
def test_capability_access_revalidates_checksum_and_legal_authority(
    change: dict[str, Any],
    expected_code: str,
) -> None:
    authorize = _required_callable(
        document_capabilities,
        "authorize_capability_access",
        "CAPABILITY_CHECKSUM_LEGAL_REVALIDATION_NOT_IMPLEMENTED",
    )
    context = {
        "token_status": "active",
        "delivery_status": "available",
        "semantic_status": "passed",
        "generation_status": "ready",
        "artifact_sha256": "sha256:expected",
        "stored_object_sha256": "sha256:expected",
        "legal_approval_active": True,
        "membership_active": True,
        "assignment_active": True,
        **change,
    }

    result = authorize(context)

    assert result["allowed"] is False
    assert result["code"] == expected_code
    assert result["bytes_streamed"] == 0


def test_telegram_failure_is_partial_and_retries_same_obligation() -> None:
    summarize = _required_callable(
        escritura_delivery,
        "summarize_delivery_state",
        "TELEGRAM_PARTIAL_DELIVERY_NOT_IMPLEMENTED",
    )
    deliveries = [
        _web_delivery(),
        {
            **_web_delivery(
                id="delivery-telegram",
                channel="telegram",
                required=False,
                delivery_status="retry_scheduled",
                capability_status="none",
                active_capability_id=None,
                available_at=None,
            ),
            "attempt_count": 2,
            "next_attempt_at": "2026-07-24T12:10:00+00:00",
        },
    ]

    state = summarize(deliveries)

    assert state["delivery_status"] == "partial"
    assert state["historically_delivered"] is True
    assert state["retry_delivery_ids"] == ["delivery-telegram"]


def test_membership_loss_revokes_access_without_erasing_history() -> None:
    authorize = _required_callable(
        document_capabilities,
        "authorize_capability_access",
        "CAPABILITY_MEMBERSHIP_REVOKE_NOT_IMPLEMENTED",
    )
    result = authorize(
        {
            "token_status": "active",
            "delivery_status": "available",
            "semantic_status": "passed",
            "generation_status": "ready",
            "artifact_sha256": "sha256:expected",
            "stored_object_sha256": "sha256:expected",
            "legal_approval_active": True,
            "membership_active": False,
            "assignment_active": False,
            "available_at": "2026-07-24T12:00:00+00:00",
        }
    )

    assert result["allowed"] is False
    assert result["capability_status"] == "revoked"
    assert result["available_at"] == "2026-07-24T12:00:00+00:00"


def test_recipient_reassignment_requires_admin_operation_and_audit() -> None:
    reassign = _required_callable(
        escritura_delivery,
        "reassign_delivery_recipient",
        "DELIVERY_REASSIGNMENT_AUDIT_NOT_IMPLEMENTED",
    )
    original = _snapshot()

    result = reassign(
        recipient_snapshot=original,
        old_recipient_user_id=SELLER_USER_ID,
        new_recipient_user_id=OTHER_SELLER_USER_ID,
        actor_user_id=ADMIN_USER_ID,
        operation_id="reassignment-operation",
        reason="Cambio de vendedor responsable",
    )

    assert result["original_snapshot"] == original
    assert result["replacement_recipient_user_id"] == OTHER_SELLER_USER_ID
    assert result["previous_capability_status"] == "revoked"
    assert result["audit"]["operation_id"] == "reassignment-operation"
    assert result["audit"]["actor_user_id"] == ADMIN_USER_ID


@pytest.mark.parametrize(
    ("recipient_status", "replacement_verified", "expected_code"),
    [
        ("ambiguous", False, "LEGACY_CAPABILITY_RECIPIENT_AMBIGUOUS"),
        ("inactive", False, "LEGACY_CAPABILITY_RECIPIENT_INACTIVE"),
        ("unreachable", False, "LEGACY_CAPABILITY_RECIPIENT_UNREACHABLE"),
        ("exact_active", False, "LEGACY_CAPABILITY_REPLACEMENT_UNVERIFIED"),
    ],
)
def test_legacy_plaintext_cutover_keeps_unsafe_rows_as_blockers(
    recipient_status: str,
    replacement_verified: bool,
    expected_code: str,
) -> None:
    plan_cutover = _required_callable(
        document_capabilities,
        "plan_legacy_link_cutover",
        "LEGACY_CAPABILITY_RECIPIENT_AMBIGUOUS",
    )

    result = plan_cutover(
        delivery={
            **_web_delivery(),
            "link_token": "legacy-secret-never-project",
            "recipient_status": recipient_status,
        },
        persisted_control_mode="off",
        hard_off=True,
        authenticated_replacement_verified=replacement_verified,
        replacement_generation_id=GENERATION_ID,
    )

    assert result["ready"] is False
    assert result["finding"]["blocking"] is True
    assert result["finding"]["code"] == expected_code
    assert "legacy-secret-never-project" not in repr(result)
    assert result["issue_hash_capability"] is False
    assert result["revoke_legacy"] is False
    assert result["null_link_token"] is False


def test_legacy_cutover_revokes_then_nulls_only_after_exact_replacement() -> None:
    execute_cutover = _required_callable(
        document_capabilities,
        "execute_legacy_link_cutover",
        "LEGACY_CAPABILITY_CUTOVER_NOT_IMPLEMENTED",
    )
    now = datetime.now(timezone.utc)

    result = execute_cutover(
        plan={
            "fingerprint": "sha256:approved-plan",
            "recipient_status": "exact_active",
            "authenticated_replacement_verified": True,
            "replacement_generation_id": GENERATION_ID,
            "replacement_verified_at": now.isoformat(),
        },
        persisted_control_mode="off",
        hard_off=True,
        actor_user_id=ADMIN_USER_ID,
        operation_id="legacy-cutover-operation",
    )

    assert result["steps"] == [
        "authenticated_replacement_verified",
        "legacy_link_revoked",
        "legacy_link_token_nulled",
        "audit_committed",
    ]
    assert result["issue_hash_capability"] is False
    assert result["active_capability_id"] is None
    assert result["link_token"] is None
    assert result["audit"]["operation_id"] == "legacy-cutover-operation"
    assert datetime.fromisoformat(result["audit"]["created_at"]) <= now + timedelta(minutes=1)
