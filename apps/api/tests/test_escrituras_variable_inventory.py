"""API/service tests for SDD 007 US2 legal variable inventory."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
VARIABLE_ID = "00000000-0000-4000-8000-000000000003"
DOCUMENT_ID = "00000000-0000-4000-8000-000000000004"
PAGE_ID = "00000000-0000-4000-8000-000000000005"
EVIDENCE_ID = "00000000-0000-4000-8000-000000000006"


def _client() -> TestClient:
    from api.deps import verify_internal_secret
    from api.v1.router import api_router

    app = FastAPI()

    async def bypass_secret() -> str:
        return "test"

    app.dependency_overrides[verify_internal_secret] = bypass_secret
    app.include_router(api_router, prefix="/api/v1")
    return TestClient(app, headers={"X-Internal-Secret": "test"})


def _inventory_response():
    from schemas.legal_variables import (
        DocumentEvidenceResponse,
        VariableInventoryResponse,
        VariableResolutionResponse,
    )

    evidence = DocumentEvidenceResponse.model_validate(
        {
            "id": EVIDENCE_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_resolution_id": VARIABLE_ID,
            "legal_document_id": DOCUMENT_ID,
            "legal_document_page_id": PAGE_ID,
            "snippet_hash": "a" * 64,
            "confidence": 0.92,
        }
    )
    variable = VariableResolutionResponse.model_validate(
        {
            "id": VARIABLE_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_key": "matriz.inscripcion_fojas",
            "variable_group": "matriz",
            "value_text": "4699",
            "state": "proposed",
            "source_type": "document",
            "confidence": 0.92,
            "approval_required": True,
            "evidence": [evidence],
        }
    )
    return VariableInventoryResponse(
        project_id=PROJECT_ID,
        groups={"matriz": [variable]},
        summary={
            "total": 1,
            "approved": 0,
            "proposed": 1,
            "missing": 0,
            "conflict": 0,
            "manual_review": 0,
        },
    )


def test_get_project_legal_variables_endpoint_returns_inventory(monkeypatch):
    import api.v1.endpoints.legal_variables as endpoint

    client = _client()
    get_inventory = AsyncMock(return_value=_inventory_response())
    monkeypatch.setattr(
        endpoint,
        "get_project_variable_inventory_service",
        get_inventory,
    )

    response = client.get(
        f"/api/v1/legal-variables/project/{PROJECT_ID}",
        params={
            "organization_id": ORG_ID,
            "state": "proposed",
            "group": "matriz",
            "include_evidence": "true",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["project_id"] == PROJECT_ID
    assert payload["groups"]["matriz"][0]["variable_key"] == "matriz.inscripcion_fojas"
    assert payload["groups"]["matriz"][0]["evidence"][0]["legal_document_page_id"] == PAGE_ID
    assert payload["summary"]["proposed"] == 1
    get_inventory.assert_awaited_once_with(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        lot_id=None,
        state="proposed",
        group="matriz",
        include_evidence=True,
    )


class FakeSupabaseTable:
    def __init__(self, supabase: "FakeSupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.filters: dict[str, object] = {}

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self.filters[str(column)] = value
        return self

    def neq(self, column, value):
        self.filters[f"{column}__neq"] = value
        return self

    def in_(self, *_args):
        return self

    def single(self):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        return self.supabase.execute(self)


class FakeSupabase:
    def table(self, name: str) -> FakeSupabaseTable:
        return FakeSupabaseTable(self, name)

    def execute(self, table: FakeSupabaseTable):
        now = datetime(2026, 6, 4, 12, 0, tzinfo=UTC)
        if table.name == "projects":
            return SimpleNamespace(data={"id": PROJECT_ID, "organization_id": ORG_ID})
        if table.name == "lots":
            if table.filters.get("id") == "00000000-0000-4000-8000-000000000099":
                return SimpleNamespace(data=[])
            return SimpleNamespace(data={"id": table.filters.get("id"), "project_id": PROJECT_ID})
        if table.name == "variable_resolutions":
            rows = [
                {
                    "id": VARIABLE_ID,
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "variable_key": "matriz.inscripcion_fojas",
                    "variable_group": "matriz",
                    "value_text": "4699",
                    "state": "proposed",
                    "source_type": "document",
                    "source_ref": {"document_type": "dominio_vigente"},
                    "confidence": 0.92,
                    "approval_required": True,
                    "created_at": now,
                    "updated_at": now,
                },
                {
                    "id": "00000000-0000-4000-8000-000000000007",
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "variable_key": "matriz.nombre_predio",
                    "variable_group": "matriz",
                    "value_text": None,
                    "state": "missing",
                    "source_type": "system",
                    "source_ref": {},
                    "confidence": None,
                    "approval_required": True,
                },
                {
                    "id": "00000000-0000-4000-8000-000000000008",
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "variable_key": "matriz.nombre_predio",
                    "variable_group": "matriz",
                    "value_text": None,
                    "state": "superseded",
                    "source_type": "system",
                    "source_ref": {},
                    "confidence": None,
                    "approval_required": True,
                },
            ]
            if table.filters.get("state__neq"):
                rows = [
                    row
                    for row in rows
                    if row.get("state") != table.filters["state__neq"]
                ]
            return SimpleNamespace(data=rows)
        if table.name == "document_evidence":
            return SimpleNamespace(
                data=[
                    {
                        "id": EVIDENCE_ID,
                        "organization_id": ORG_ID,
                        "project_id": PROJECT_ID,
                        "variable_resolution_id": VARIABLE_ID,
                        "legal_document_id": DOCUMENT_ID,
                        "legal_document_page_id": PAGE_ID,
                        "snippet": "inscrita a fojas 4699",
                        "snippet_hash": "b" * 64,
                        "confidence": 0.92,
                    }
                ]
            )
        return SimpleNamespace(data=[])


async def test_get_project_variable_inventory_groups_summary_and_evidence():
    from services.legal_variable_resolution import get_project_variable_inventory

    inventory = await get_project_variable_inventory(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        supabase=FakeSupabase(),
    )

    assert set(inventory.groups) == {"matriz"}
    assert [item.variable_key for item in inventory.groups["matriz"]] == [
        "matriz.inscripcion_fojas",
        "matriz.nombre_predio",
    ]
    assert inventory.summary == {
        "total": 2,
        "missing": 1,
        "proposed": 1,
        "resolved": 0,
        "approved": 0,
        "manual_review": 0,
        "conflict": 0,
        "derived": 0,
        "not_applicable": 0,
        "superseded": 0,
    }
    assert inventory.groups["matriz"][0].evidence[0].legal_document_page_id == PAGE_ID
    assert inventory.groups["matriz"][1].evidence == []


async def test_get_project_variable_inventory_rejects_lot_outside_project_scope():
    from services.legal_variable_resolution import (
        LegalVariableInventoryNotFoundError,
        get_project_variable_inventory,
    )

    with pytest.raises(LegalVariableInventoryNotFoundError):
        await get_project_variable_inventory(
            project_id=PROJECT_ID,
            organization_id=ORG_ID,
            lot_id="00000000-0000-4000-8000-000000000099",
            supabase=FakeSupabase(),
        )
