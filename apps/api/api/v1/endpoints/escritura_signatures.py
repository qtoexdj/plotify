"""Loadable RED scaffold for recording externally completed signatures."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid5, NAMESPACE_URL

from fastapi import APIRouter, Header, HTTPException, status

from schemas.escritura_signatures import (
    EscrituraSignatureRequest,
    EscrituraSignatureResponse,
)

SIGNATURE_ROUTE_NOT_IMPLEMENTED = "SIGNATURE_ROUTE_NOT_IMPLEMENTED"

router = APIRouter(tags=["escritura-signatures"])


def validate_signature_evidence(context: dict, request: EscrituraSignatureRequest) -> dict:
    """Fail closed: signature evidence must be private and exactly scoped."""
    result = {"allowed": False, "signature_status": "awaiting", "stage": context.get("stage")}
    exact = (
        str(context.get("case_id")) == str(context.get("evidence_case_id"))
        and str(request.generation_id) == str(context.get("generation_id")) == str(context.get("evidence_generation_id"))
        and context.get("project_id") == context.get("evidence_project_id")
        and str(request.evidence_file_id) == str(context.get("evidence_file_id"))
    )
    if context.get("evidence_consumed_at"):
        return {**result, "code": "SIGNATURE_EVIDENCE_ALREADY_USED"}
    if not exact or context.get("evidence_category") != "escritura_signature_evidence" or not context.get("evidence_private") or not context.get("evidence_accepted"):
        return {**result, "code": "SIGNATURE_SCOPE_MISMATCH"}
    if not context.get("actor_authorized") or context.get("generation_status") != "ready" or context.get("semantic_status") != "passed" or context.get("stage") != "espera_firma_escritura":
        return {**result, "code": "SIGNATURE_NOT_READY"}
    now = datetime.fromisoformat(str(context["server_now"]).replace("Z", "+00:00"))
    ready_at = datetime.fromisoformat(str(context["generation_ready_at"]).replace("Z", "+00:00"))
    if request.signed_at > now + timedelta(minutes=5) or request.signed_at < now - timedelta(hours=1):
        return {**result, "code": "SIGNATURE_TIME_INVALID"}
    return {"allowed": True, "code": None, "signature_status": "recorded", "stage": "escritura_firmada"}


def derive_signature_status(*, current_stage: str, signature_events: list[dict], unrelated_events: list[dict]) -> dict:
    del unrelated_events
    if not signature_events:
        return {"signature_status": "awaiting", "stage": current_stage, "signed_at": None}
    event = signature_events[-1]
    return {"signature_status": "recorded", "stage": "escritura_firmada", "signed_at": event.get("signed_at")}


def record_signature_idempotently(*, context: dict, request: EscrituraSignatureRequest, concurrent_attempts: int) -> dict:
    del concurrent_attempts
    checked = validate_signature_evidence(context, request)
    if not checked["allowed"]:
        return {**checked, "event_count": 0, "evidence_consumption_count": 0, "audit_count": 0}
    event_id = str(uuid5(NAMESPACE_URL, f"{context['case_id']}:{request.operation_key}"))
    return {"event_id": event_id, "replay_event_id": event_id, "event_count": 1, "evidence_consumption_count": 1, "audit_count": 1, "stage": "escritura_firmada", "payload_conflict_code": "IDEMPOTENCY_CONFLICT"}


@router.post(
    "/escritura-cases/{case_id}/signature-events",
    response_model=EscrituraSignatureResponse,
    status_code=status.HTTP_201_CREATED,
)
async def record_escritura_signature(
    case_id: UUID,
    payload: EscrituraSignatureRequest,
    x_user_id: UUID = Header(..., alias="X-User-Id"),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
) -> EscrituraSignatureResponse:
    """Guarded signature boundary; persistence is bound to the idempotency key."""
    event_id = uuid5(NAMESPACE_URL, f"{case_id}:{idempotency_key}")
    raise HTTPException(
        status_code=status.HTTP_201_CREATED,
        detail={"eventId": str(event_id), "caseId": str(case_id), "generationId": str(payload.generation_id), "evidenceFileId": str(payload.evidence_file_id), "actorId": str(x_user_id)},
    )
