"""SDD 007 US3 tests for legal variable review and audit decisions."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest


ORG_ID = "00000000-0000-4000-8000-000000000001"
OTHER_ORG_ID = "00000000-0000-4000-8000-000000000099"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
OTHER_PROJECT_ID = "00000000-0000-4000-8000-000000000098"
LOT_ID = "00000000-0000-4000-8000-000000000003"
VARIABLE_ID = "00000000-0000-4000-8000-000000000004"
USER_ID = "00000000-0000-4000-8000-000000000005"
AUDIT_ID = "00000000-0000-4000-8000-000000000006"


def _client() -> TestClient:
    from api.deps import verify_internal_secret
    from api.v1.router import api_router

    app = FastAPI()

    async def bypass_secret() -> str:
        return "test"

    app.dependency_overrides[verify_internal_secret] = bypass_secret
    app.include_router(api_router, prefix="/api/v1")
    return TestClient(app, headers={"X-Internal-Secret": "test"})


def _review_response(state: str = "approved"):
    from schemas.legal_variables import VariableReviewResponse

    return VariableReviewResponse(
        variable_resolution_id=VARIABLE_ID,
        state=state,
        reviewed_by=USER_ID,
        reviewed_at=datetime(2026, 6, 4, 12, 0, tzinfo=UTC),
        audit_event_id=AUDIT_ID,
    )


def test_patch_legal_variable_endpoint_delegates_review_service(monkeypatch):
    import api.v1.endpoints.legal_variables as endpoint

    client = _client()
    update_variable = AsyncMock(return_value=_review_response())
    monkeypatch.setattr(endpoint, "update_legal_variable_service", update_variable)

    response = client.patch(
        f"/api/v1/legal-variables/{VARIABLE_ID}",
        params={"organization_id": ORG_ID, "project_id": PROJECT_ID},
        json={
            "action": "approve",
            "state": "approved",
            "reviewed_by": USER_ID,
            "correction_reason": "Validado contra dominio vigente pagina 2",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["variable_resolution_id"] == VARIABLE_ID
    assert payload["state"] == "approved"
    assert payload["reviewed_by"] == USER_ID
    assert payload["audit_event_id"] == AUDIT_ID
    update_variable.assert_awaited_once()
    assert update_variable.call_args.kwargs["variable_resolution_id"] == VARIABLE_ID
    assert update_variable.call_args.kwargs["organization_id"] == ORG_ID
    assert update_variable.call_args.kwargs["project_id"] == PROJECT_ID
    assert update_variable.call_args.kwargs["payload"].action == "approve"


class FakeSupabaseTable:
    def __init__(self, supabase: "FakeSupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.filters: dict[str, object] = {}
        self.update_payload: dict[str, object] | None = None
        self.insert_payload: dict[str, object] | None = None

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self.filters[str(column)] = value
        return self

    def single(self):
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def insert(self, payload):
        self.insert_payload = payload
        return self

    def execute(self):
        return self.supabase.execute(self)


class FakeSupabase:
    def __init__(
        self,
        variable_state: str = "proposed",
        organization_id: str = ORG_ID,
        audit_should_fail: bool = False,
    ):
        self.variable_state = variable_state
        self.organization_id = organization_id
        self.audit_should_fail = audit_should_fail
        self.variable_updates: list[dict[str, object]] = []
        self.review_decisions: list[dict[str, object]] = []

    def table(self, name: str) -> FakeSupabaseTable:
        return FakeSupabaseTable(self, name)

    def execute(self, table: FakeSupabaseTable):
        if table.name == "variable_resolutions" and table.update_payload is None:
            return SimpleNamespace(data=self._variable_row())
        if table.name == "variable_resolutions" and table.update_payload is not None:
            self.variable_updates.append(table.update_payload)
            return SimpleNamespace(data={**self._variable_row(), **table.update_payload})
        if table.name == "legal_review_decisions":
            assert table.insert_payload is not None
            if self.audit_should_fail:
                raise RuntimeError("audit insert failed")
            self.review_decisions.append(table.insert_payload)
            return SimpleNamespace(data={**table.insert_payload, "id": AUDIT_ID})
        return SimpleNamespace(data=[])

    def _variable_row(self) -> dict[str, object]:
        return {
            "id": VARIABLE_ID,
            "organization_id": self.organization_id,
            "project_id": PROJECT_ID,
            "lot_id": LOT_ID,
            "escritura_case_id": None,
            "variable_key": "matriz.inscripcion_fojas",
            "variable_group": "matriz",
            "value_text": "4698",
            "value_json": None,
            "state": self.variable_state,
            "source_type": "document",
            "source_ref": {"document_type": "dominio_vigente"},
            "confidence": 0.92,
            "approval_required": True,
        }


async def test_edit_variable_persists_manual_value_and_audit_decision():
    from schemas.legal_variables import VariableUpdateRequest
    from services.legal_variable_resolution import update_legal_variable

    supabase = FakeSupabase(variable_state="manual_review")
    response = await update_legal_variable(
        variable_resolution_id=VARIABLE_ID,
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        payload=VariableUpdateRequest.model_validate(
            {
                "action": "edit",
                "value_text": "4699",
                "state": "resolved",
                "reviewed_by": USER_ID,
                "correction_reason": "OCR confundio 8 por 9",
            }
        ),
        supabase=supabase,
    )

    assert response.state == "resolved"
    assert response.audit_event_id == AUDIT_ID
    assert supabase.variable_updates[0]["value_text"] == "4699"
    assert supabase.variable_updates[0]["state"] == "resolved"
    assert supabase.variable_updates[0]["source_type"] == "manual"
    assert supabase.variable_updates[0]["correction_reason"] == "OCR confundio 8 por 9"
    assert supabase.review_decisions[0]["decision_type"] == "manual_override"
    assert supabase.review_decisions[0]["variable_resolution_id"] == VARIABLE_ID
    assert supabase.review_decisions[0]["reason"] == "OCR confundio 8 por 9"


async def test_edit_variable_rejects_proposed_target_state():
    from schemas.legal_variables import VariableUpdateRequest
    from services.legal_variable_resolution import (
        LegalVariableResolutionError,
        update_legal_variable,
    )

    supabase = FakeSupabase(variable_state="manual_review")
    with pytest.raises(LegalVariableResolutionError):
        await update_legal_variable(
            variable_resolution_id=VARIABLE_ID,
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            payload=VariableUpdateRequest.model_validate(
                {
                    "action": "edit",
                    "value_text": "4699",
                    "state": "proposed",
                    "reviewed_by": USER_ID,
                    "correction_reason": "OCR confundio 8 por 9",
                }
            ),
            supabase=supabase,
        )

    assert supabase.variable_updates == []
    assert supabase.review_decisions == []


async def test_edit_variable_rejects_blank_text_without_json_value():
    from schemas.legal_variables import VariableUpdateRequest
    from services.legal_variable_resolution import (
        LegalVariableResolutionError,
        update_legal_variable,
    )

    supabase = FakeSupabase(variable_state="manual_review")
    with pytest.raises(LegalVariableResolutionError):
        await update_legal_variable(
            variable_resolution_id=VARIABLE_ID,
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            payload=VariableUpdateRequest.model_validate(
                {
                    "action": "edit",
                    "value_text": "   ",
                    "state": "resolved",
                    "reviewed_by": USER_ID,
                    "correction_reason": "OCR sin valor util",
                }
            ),
            supabase=supabase,
        )

    assert supabase.variable_updates == []
    assert supabase.review_decisions == []


async def test_approve_variable_persists_review_fields_and_audit_decision():
    from schemas.legal_variables import VariableUpdateRequest
    from services.legal_variable_resolution import update_legal_variable

    supabase = FakeSupabase(variable_state="resolved")
    response = await update_legal_variable(
        variable_resolution_id=VARIABLE_ID,
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        payload=VariableUpdateRequest.model_validate(
            {
                "action": "approve",
                "state": "approved",
                "reviewed_by": USER_ID,
                "correction_reason": "Validado contra dominio vigente pagina 2",
            }
        ),
        supabase=supabase,
    )

    assert response.state == "approved"
    assert supabase.variable_updates[0]["state"] == "approved"
    assert supabase.variable_updates[0]["reviewed_by"] == USER_ID
    assert supabase.review_decisions[0]["decision_type"] == "approve_variable"
    assert supabase.review_decisions[0]["decision_status"] == "approved"
    assert supabase.review_decisions[0]["decided_by"] == USER_ID


async def test_mark_not_applicable_persists_legal_review_source_and_audit_decision():
    from schemas.legal_variables import VariableUpdateRequest
    from services.legal_variable_resolution import update_legal_variable

    supabase = FakeSupabase(variable_state="missing")
    response = await update_legal_variable(
        variable_resolution_id=VARIABLE_ID,
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        payload=VariableUpdateRequest.model_validate(
            {
                "action": "mark_not_applicable",
                "state": "not_applicable",
                "reviewed_by": USER_ID,
                "correction_reason": "No aplica a compraventa entre personas naturales",
            }
        ),
        supabase=supabase,
    )

    assert response.state == "not_applicable"
    assert supabase.variable_updates[0]["state"] == "not_applicable"
    assert supabase.variable_updates[0]["value_text"] is None
    assert supabase.variable_updates[0]["value_json"] is None
    assert supabase.variable_updates[0]["source_type"] == "legal_review"
    assert supabase.review_decisions[0]["decision_type"] == "mark_not_applicable"
    assert supabase.review_decisions[0]["reason"] == (
        "No aplica a compraventa entre personas naturales"
    )


async def test_review_rejects_cross_tenant_variable_before_mutating():
    from schemas.legal_variables import VariableUpdateRequest
    from services.legal_variable_resolution import (
        LegalVariableInventoryScopeError,
        update_legal_variable,
    )

    supabase = FakeSupabase(organization_id=OTHER_ORG_ID)
    with pytest.raises(LegalVariableInventoryScopeError):
        await update_legal_variable(
            variable_resolution_id=VARIABLE_ID,
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            payload=VariableUpdateRequest.model_validate(
                {
                    "action": "approve",
                    "reviewed_by": USER_ID,
                }
            ),
            supabase=supabase,
        )

    assert supabase.variable_updates == []
    assert supabase.review_decisions == []


async def test_review_rejects_cross_project_variable_before_mutating():
    from schemas.legal_variables import VariableUpdateRequest
    from services.legal_variable_resolution import (
        LegalVariableInventoryScopeError,
        update_legal_variable,
    )

    supabase = FakeSupabase()
    with pytest.raises(LegalVariableInventoryScopeError):
        await update_legal_variable(
            variable_resolution_id=VARIABLE_ID,
            organization_id=ORG_ID,
            project_id=OTHER_PROJECT_ID,
            payload=VariableUpdateRequest.model_validate(
                {
                    "action": "approve",
                    "reviewed_by": USER_ID,
                }
            ),
            supabase=supabase,
        )

    assert supabase.variable_updates == []
    assert supabase.review_decisions == []


async def test_review_rejects_invalid_state_transition_without_audit():
    from schemas.legal_variables import VariableUpdateRequest
    from services.legal_variable_resolution import (
        LegalVariableResolutionError,
        update_legal_variable,
    )

    supabase = FakeSupabase(variable_state="missing")
    with pytest.raises(LegalVariableResolutionError):
        await update_legal_variable(
            variable_resolution_id=VARIABLE_ID,
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            payload=VariableUpdateRequest.model_validate(
                {
                    "action": "approve",
                    "reviewed_by": USER_ID,
                }
            ),
            supabase=supabase,
        )

    assert supabase.variable_updates == []
    assert supabase.review_decisions == []


async def test_review_rolls_back_variable_update_when_audit_insert_fails():
    from schemas.legal_variables import VariableUpdateRequest
    from services.legal_variable_resolution import (
        LegalVariableAuditError,
        update_legal_variable,
    )

    supabase = FakeSupabase(variable_state="resolved", audit_should_fail=True)
    with pytest.raises(LegalVariableAuditError):
        await update_legal_variable(
            variable_resolution_id=VARIABLE_ID,
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            payload=VariableUpdateRequest.model_validate(
                {
                    "action": "approve",
                    "reviewed_by": USER_ID,
                    "correction_reason": "Validado contra dominio vigente pagina 2",
                }
            ),
            supabase=supabase,
        )

    assert supabase.review_decisions == []
    assert supabase.variable_updates[0]["state"] == "approved"
    assert supabase.variable_updates[1]["state"] == "resolved"
    assert supabase.variable_updates[1]["value_text"] == "4698"
    assert supabase.variable_updates[1]["reviewed_by"] is None
