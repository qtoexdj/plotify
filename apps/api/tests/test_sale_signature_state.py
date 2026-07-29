"""SDD019 T076 RED contracts for truthful state and external signature evidence."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from uuid import UUID

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from api.v1.endpoints import escritura_signatures
from schemas.escritura_signatures import EscrituraSignatureRequest

CASE_ID = UUID("00000000-0000-4000-8000-000000000001")
GENERATION_ID = UUID("00000000-0000-4000-8000-000000000002")
EVIDENCE_ID = UUID("00000000-0000-4000-8000-000000000003")
ACTOR_ID = UUID("00000000-0000-4000-8000-000000000004")
SERVER_NOW = datetime(2026, 7, 24, 15, 0, tzinfo=timezone.utc)
OPERATION_KEY = "-".join(("signature", "operation", "1"))


def _required_callable(name: str, marker: str) -> Callable[..., Any]:
    candidate = getattr(escritura_signatures, name, None)
    assert callable(candidate), f"{marker}: falta escritura_signatures.{name}"
    return candidate


def _request(**overrides: Any) -> EscrituraSignatureRequest:
    value: dict[str, Any] = {
        "generationId": str(GENERATION_ID),
        "evidenceFileId": str(EVIDENCE_ID),
        "signedAt": (SERVER_NOW - timedelta(minutes=1)).isoformat(),
        "reason": "Constancia de escritura firmada",
        "operationKey": OPERATION_KEY,
    }
    value.update(overrides)
    return EscrituraSignatureRequest.model_validate(value)


def _ready_context(**overrides: Any) -> dict[str, Any]:
    value = {
        "case_id": str(CASE_ID),
        "organization_id": "org-a",
        "project_id": "project-a",
        "stage": "espera_firma_escritura",
        "generation_id": str(GENERATION_ID),
        "generation_status": "ready",
        "semantic_status": "passed",
        "generation_ready_at": (SERVER_NOW - timedelta(hours=2)).isoformat(),
        "approval_finalized_at": (SERVER_NOW - timedelta(hours=1)).isoformat(),
        "evidence_file_id": str(EVIDENCE_ID),
        "evidence_category": "escritura_signature_evidence",
        "evidence_case_id": str(CASE_ID),
        "evidence_generation_id": str(GENERATION_ID),
        "evidence_project_id": "project-a",
        "evidence_private": True,
        "evidence_accepted": True,
        "evidence_consumed_at": None,
        "actor_user_id": str(ACTOR_ID),
        "actor_authorized": True,
        "server_now": SERVER_NOW.isoformat(),
    }
    value.update(overrides)
    return value


def test_signature_request_requires_opaque_evidence_and_operation_key() -> None:
    request = _request()

    assert request.evidence_file_id == EVIDENCE_ID
    assert request.operation_key == OPERATION_KEY
    projected = request.model_dump(by_alias=True, mode="json")
    assert "storagePath" not in projected
    assert "bucket" not in projected
    assert "url" not in projected

    with pytest.raises(ValidationError):
        EscrituraSignatureRequest.model_validate(
            {
                "generationId": str(GENERATION_ID),
                "evidenceFileId": str(EVIDENCE_ID),
                "signedAt": SERVER_NOW.isoformat(),
                "reason": "Firma",
                "operationKey": "",
            }
        )


@pytest.mark.parametrize(
    "context_change",
    [
        {"evidence_case_id": "other-case"},
        {"evidence_generation_id": "other-generation"},
        {"evidence_project_id": "other-project"},
        {"evidence_category": "generic_document"},
        {"evidence_private": False},
        {"evidence_accepted": False},
        {"evidence_consumed_at": SERVER_NOW.isoformat()},
    ],
)
def test_signature_requires_private_evidence_bound_to_exact_case_and_generation(
    context_change: dict[str, Any],
) -> None:
    validate = _required_callable(
        "validate_signature_evidence",
        "SIGNATURE_SCOPE_MISMATCH",
    )

    result = validate(_ready_context(**context_change), _request())

    assert result["allowed"] is False, "SIGNATURE_SCOPE_MISMATCH"
    assert result["code"] in {
        "SIGNATURE_SCOPE_MISMATCH",
        "SIGNATURE_EVIDENCE_ALREADY_USED",
    }
    assert result["signature_status"] == "awaiting"


@pytest.mark.parametrize(
    "context_change",
    [
        {"actor_authorized": False},
        {"generation_status": "failed"},
        {"semantic_status": "failed"},
        {"stage": "document_ready"},
    ],
)
def test_signature_requires_authorized_actor_ready_generation_and_waiting_stage(
    context_change: dict[str, Any],
) -> None:
    validate = _required_callable(
        "validate_signature_evidence",
        "SIGNATURE_SCOPE_MISMATCH",
    )

    result = validate(_ready_context(**context_change), _request())

    assert result["allowed"] is False
    assert result["signature_status"] == "awaiting"
    assert result["stage"] != "escritura_firmada"


@pytest.mark.parametrize(
    "signed_at",
    [
        SERVER_NOW + timedelta(minutes=5, seconds=1),
        SERVER_NOW - timedelta(hours=1, minutes=5, seconds=1),
    ],
)
def test_signature_time_is_bounded_by_readiness_and_server_clock(
    signed_at: datetime,
) -> None:
    validate = _required_callable(
        "validate_signature_evidence",
        "SIGNATURE_SCOPE_MISMATCH",
    )

    result = validate(
        _ready_context(),
        _request(signedAt=signed_at.isoformat()),
    )

    assert result["allowed"] is False
    assert result["code"] == "SIGNATURE_TIME_INVALID"
    assert result["signature_status"] == "awaiting"


@pytest.mark.parametrize(
    "event",
    [
        {"kind": "generation_ready"},
        {"kind": "delivery_available"},
        {"kind": "telegram_sent"},
        {"kind": "document_downloaded"},
    ],
)
def test_generation_delivery_telegram_and_download_never_imply_signature(
    event: dict[str, str],
) -> None:
    derive = _required_callable(
        "derive_signature_status",
        "SIGNATURE_ROUTE_NOT_IMPLEMENTED",
    )

    state = derive(
        current_stage="espera_firma_escritura",
        signature_events=[],
        unrelated_events=[event],
    )

    assert state == {
        "signature_status": "awaiting",
        "stage": "espera_firma_escritura",
        "signed_at": None,
    }


@pytest.mark.asyncio
async def test_route_keeps_state_awaiting_until_guarded_rpc_exists() -> None:
    with pytest.raises(HTTPException) as raised:
        await escritura_signatures.record_escritura_signature(
            CASE_ID,
            _request(),
            ACTOR_ID,
            "signature-operation-1",
        )

    assert raised.value.status_code == 201, (
        "SIGNATURE_SCOPE_MISMATCH: el scaffold aún no registra evidencia exacta"
    )


def test_replay_and_race_require_one_event_and_one_evidence_consumption() -> None:
    record = _required_callable(
        "record_signature_idempotently",
        "SIGNATURE_SCOPE_MISMATCH",
    )

    result = record(
        context=_ready_context(),
        request=_request(),
        concurrent_attempts=20,
    )

    assert result["event_count"] == 1
    assert result["evidence_consumption_count"] == 1
    assert result["audit_count"] == 1
    assert result["stage"] == "escritura_firmada"
    assert result["replay_event_id"] == result["event_id"]
    assert result["payload_conflict_code"] == "IDEMPOTENCY_CONFLICT"
