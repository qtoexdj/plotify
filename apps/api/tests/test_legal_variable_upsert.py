"""SDD 011 (A4) tests: upsert de variables de proyecto por clave.

Cubre el endpoint PUT /legal-variables/by-key y el servicio
``upsert_project_variable`` para el caso de crear una variable de autoría/manual
que el extractor no produce (p. ej. plano CBR, mandatario)."""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
USER_ID = "00000000-0000-4000-8000-000000000005"


def _client() -> TestClient:
    from api.deps import verify_internal_secret
    from api.v1.router import api_router

    app = FastAPI()

    async def bypass_secret() -> str:
        return "test"

    app.dependency_overrides[verify_internal_secret] = bypass_secret
    app.include_router(api_router, prefix="/api/v1")
    return TestClient(app, headers={"X-Internal-Secret": "test"})


# ─── Fake Supabase: soporta select/insert/single/delete para el upsert ───────


class _FakeResult:
    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeQuery:
    def __init__(self, store: dict[str, list[dict]], table: str) -> None:
        self._store = store
        self._table = table
        self._action = "select"
        self._payload: Any = None
        self._single = False

    def select(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def insert(self, payload: Any) -> "_FakeQuery":
        self._action = "insert"
        self._payload = payload
        return self

    def delete(self) -> "_FakeQuery":
        self._action = "delete"
        return self

    def eq(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def neq(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def is_(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def single(self) -> "_FakeQuery":
        self._single = True
        return self

    def maybe_single(self) -> "_FakeQuery":
        self._single = True
        return self

    def execute(self) -> _FakeResult:
        rows = self._store.setdefault(self._table, [])
        if self._action == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted: list[dict] = []
            for item in items:
                row = dict(item)
                row.setdefault("id", str(uuid.uuid4()))
                rows.append(row)
                inserted.append(row)
            return _FakeResult(inserted[0] if self._single else inserted)
        if self._action == "delete":
            return _FakeResult([])
        if self._single:
            return _FakeResult(dict(rows[0]) if rows else None)
        return _FakeResult([dict(row) for row in rows])


class _FakeSupabase:
    def __init__(self, tables: dict[str, list[dict]] | None = None) -> None:
        self._store = {name: list(rows) for name, rows in (tables or {}).items()}

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self._store, name)


def test_upsert_endpoint_delegates_to_service(monkeypatch):
    import api.v1.endpoints.legal_variables as endpoint
    from schemas.legal_variables import VariableReviewResponse

    review = VariableReviewResponse(
        variable_resolution_id="11111111-1111-4111-8111-111111111111",
        state="resolved",
        reviewed_by=USER_ID,
        reviewed_at=None,
        audit_event_id="22222222-2222-4222-8222-222222222222",
    )
    upsert = AsyncMock(return_value=review)
    monkeypatch.setattr(endpoint, "upsert_project_variable_service", upsert)

    client = _client()
    response = client.put(
        "/api/v1/legal-variables/by-key",
        params={"organization_id": ORG_ID, "project_id": PROJECT_ID},
        json={
            "variable_key": "sag.plano_cbr_numero",
            "value_text": "mil trescientos noventa y cuatro",
            "reviewed_by": USER_ID,
        },
    )

    assert response.status_code == 200
    assert response.json()["state"] == "resolved"
    upsert.assert_awaited_once()


def test_upsert_endpoint_rejects_unknown_key():
    client = _client()
    response = client.put(
        "/api/v1/legal-variables/by-key",
        params={"organization_id": ORG_ID, "project_id": PROJECT_ID},
        json={"variable_key": "not.a.real.key", "value_text": "x", "reviewed_by": USER_ID},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_upsert_creates_missing_manual_variable():
    from schemas.legal_variables import VariableUpsertRequest
    from services.legal_variable_resolution import upsert_project_variable

    fake = _FakeSupabase({"variable_resolutions": [], "legal_review_decisions": []})
    payload = VariableUpsertRequest(
        variable_key="sag.plano_cbr_numero",
        value_text="mil trescientos noventa y cuatro",
        reviewed_by=USER_ID,
    )
    result = await upsert_project_variable(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        payload=payload,
        supabase=fake,
    )

    assert result.state == "resolved"
    assert result.audit_event_id
    rows = fake._store["variable_resolutions"]
    assert len(rows) == 1
    row = rows[0]
    assert row["variable_key"] == "sag.plano_cbr_numero"
    assert row["variable_group"] == "sag"
    assert row["source_type"] == "manual"
    assert row["lot_id"] is None and row["escritura_case_id"] is None
    assert len(fake._store["legal_review_decisions"]) == 1


def test_bulk_approve_endpoint_delegates_to_service(monkeypatch):
    import api.v1.endpoints.legal_variables as endpoint
    from schemas.legal_variables import VariableBulkApproveResponse

    svc = AsyncMock(
        return_value=VariableBulkApproveResponse(
            approved_count=2,
            approved_keys=["sag.certificado_numero", "vendedor.nombre"],
            skipped_keys=["titulo.inscripciones[]"],
        )
    )
    monkeypatch.setattr(endpoint, "bulk_approve_project_variables_service", svc)

    client = _client()
    response = client.post(
        "/api/v1/legal-variables/bulk-approve",
        params={"organization_id": ORG_ID, "project_id": PROJECT_ID},
        json={"reviewed_by": USER_ID, "group": "sag"},
    )

    assert response.status_code == 200
    assert response.json()["approved_count"] == 2
    svc.assert_awaited_once()


@pytest.mark.asyncio
async def test_bulk_approve_approves_proposed_and_skips_conflict_or_empty(monkeypatch):
    import services.legal_variable_resolution as svc

    rows = [
        {"id": "1", "variable_key": "sag.certificado_numero", "variable_group": "sag", "state": "proposed", "value_text": "1468"},
        {"id": "2", "variable_key": "vendedor.nombre", "variable_group": "vendedor", "state": "proposed", "value_text": "Juan"},
        {"id": "3", "variable_key": "titulo.inscripciones[]", "variable_group": "titulo", "state": "conflict", "value_text": None, "value_json": [{}]},
        {"id": "4", "variable_key": "sag.oficina_sectorial", "variable_group": "sag", "state": "missing", "value_text": None},
        {"id": "5", "variable_key": "clausulas.rnda_declaracion", "variable_group": "clausulas", "state": "proposed", "value_text": None},
    ]

    async def fake_fetch(**_kw):
        return rows

    approve_mock = AsyncMock()
    monkeypatch.setattr(svc, "_fetch_project_variables_for_review", fake_fetch)
    monkeypatch.setattr(svc, "update_legal_variable", approve_mock)

    result = await svc.bulk_approve_project_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        reviewed_by=USER_ID,
        supabase=object(),
    )

    assert set(result.approved_keys) == {"sag.certificado_numero", "vendedor.nombre"}
    assert result.approved_count == 2
    assert "titulo.inscripciones[]" in result.skipped_keys  # conflicto: atención manual
    assert "clausulas.rnda_declaracion" in result.skipped_keys  # sin valor
    assert "sag.oficina_sectorial" not in result.skipped_keys  # missing: no es candidato
    assert approve_mock.await_count == 2


@pytest.mark.asyncio
async def test_bulk_approve_respects_group_filter(monkeypatch):
    import services.legal_variable_resolution as svc

    rows = [
        {"id": "1", "variable_key": "sag.certificado_numero", "variable_group": "sag", "state": "proposed", "value_text": "1468"},
        {"id": "2", "variable_key": "vendedor.nombre", "variable_group": "vendedor", "state": "proposed", "value_text": "Juan"},
    ]

    async def fake_fetch(**_kw):
        return rows

    monkeypatch.setattr(svc, "_fetch_project_variables_for_review", fake_fetch)
    monkeypatch.setattr(svc, "update_legal_variable", AsyncMock())

    result = await svc.bulk_approve_project_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        reviewed_by=USER_ID,
        group="sag",
        supabase=object(),
    )

    assert result.approved_keys == ["sag.certificado_numero"]
