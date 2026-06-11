"""SDD 008 T020 tests: case-bound matriz GET/PUT endpoints."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.deps import verify_internal_secret
from api.v1.endpoints import escritura_matrices

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "matriz"

ORG_ID = "00000000-0000-4000-8000-000000000001"
OTHER_ORG_ID = "00000000-0000-4000-8000-000000000099"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_ID = "00000000-0000-4000-8000-000000000003"
CASE_ID = "00000000-0000-4000-8000-000000000004"


def _load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def _snapshot_fixture() -> dict[str, Any]:
    return _load_fixture("teno_case_snapshot.json")


def _golden_clauses() -> list[dict[str, Any]]:
    return _load_fixture("golden_template_clauses.json")["clauses"]


class FakeQuery:
    def __init__(self, store: "FakeStore", table_name: str):
        self.store = store
        self.table_name = table_name
        self.action = "select"
        self.payload: Any = None
        self.filters: list[tuple[str, object]] = []
        self.orderings: list[tuple[str, bool]] = []
        self.limit_count: int | None = None
        self.single = False

    def select(self, *_args):
        return self

    def insert(self, payload):
        self.action = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.action = "update"
        self.payload = payload
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def neq(self, column, value):
        self.filters.append((column, ("__neq__", value)))
        return self

    def order(self, column, desc=False):
        self.orderings.append((column, bool(desc)))
        return self

    def limit(self, count):
        self.limit_count = int(count)
        return self

    def maybe_single(self):
        self.single = True
        return self

    def _matches(self, row: dict[str, Any]) -> bool:
        for column, expected in self.filters:
            actual = row.get(column)
            if isinstance(expected, tuple) and expected[0] == "__neq__":
                if str(actual) == str(expected[1]):
                    return False
            elif str(actual) != str(expected):
                return False
        return True

    def _matched_rows(self) -> list[dict[str, Any]]:
        rows = [
            row
            for row in self.store.tables.setdefault(self.table_name, [])
            if self._matches(row)
        ]
        for column, desc in reversed(self.orderings):
            rows.sort(key=lambda row: str(row.get(column) or ""), reverse=desc)
        if self.limit_count is not None:
            rows = rows[: self.limit_count]
        return rows

    def execute(self):
        table = self.store.tables.setdefault(self.table_name, [])
        if self.action == "insert":
            payloads = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for payload in payloads:
                row = {"id": str(uuid.uuid4()), **payload}
                table.append(row)
                inserted.append(row)
            return SimpleNamespace(data=inserted)
        if self.action == "update":
            updated = []
            for row in table:
                if self._matches(row):
                    row.update(self.payload)
                    updated.append(row)
            return SimpleNamespace(data=updated)
        rows = self._matched_rows()
        if self.single:
            return SimpleNamespace(data=rows[0] if rows else None)
        return SimpleNamespace(data=rows)


class FakeStore:
    def __init__(self):
        self.tables: dict[str, list[dict[str, Any]]] = {}

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)


def _build_app(store: FakeStore, monkeypatch) -> FastAPI:
    monkeypatch.setattr("core.database.get_supabase_client", lambda: store)
    monkeypatch.setattr(
        "api.v1.endpoints.legal_variables.ensure_legal_documents_feature_enabled",
        lambda **_kwargs: None,
    )
    app = FastAPI()
    app.dependency_overrides[verify_internal_secret] = lambda: None
    app.include_router(escritura_matrices.router, prefix="/api/v1")
    return app


def _client(app: FastAPI) -> TestClient:
    return TestClient(app, headers={"X-Internal-Secret": "test-secret"})


def _seed_case(
    store: FakeStore,
    *,
    variable_snapshot: dict[str, Any] | None = None,
    readiness_gates: dict[str, Any] | None = None,
) -> dict[str, Any]:
    snapshot = _snapshot_fixture()
    row = {
        "id": CASE_ID,
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "lot_id": LOT_ID,
        "case_status": snapshot["case_status"],
        "readiness_status": "ready",
        "readiness_gates": readiness_gates
        or {
            "title_verified": {
                "gate": "title_verified",
                "status": "ready",
                "blocking_variables": [],
                "warnings": [],
            }
        },
        "variable_snapshot": variable_snapshot or snapshot["variable_snapshot"],
        "evidence_snapshot": snapshot["evidence_snapshot"],
    }
    store.tables.setdefault("escritura_cases", []).append(row)
    store.tables.setdefault("projects", []).append(
        {
            "id": PROJECT_ID,
            "organization_id": ORG_ID,
            "name": "Parcelación El Cóndor de Teno",
        }
    )
    return row


def _seed_template(store: FakeStore) -> dict[str, Any]:
    template = {
        "id": str(uuid.uuid4()),
        "organization_id": ORG_ID,
        "name": "Compraventa predio rustico",
        "document_type": "compraventa",
        "version": 1,
        "status": "published",
        "published_at": "2026-06-10T00:00:00Z",
        "published_by": None,
        "created_at": "2026-06-10T00:00:00Z",
        "updated_at": "2026-06-10T00:00:00Z",
    }
    store.tables.setdefault("escritura_templates", []).append(template)
    for clause in _golden_clauses():
        store.tables.setdefault("escritura_template_clauses", []).append(
            {
                "id": str(uuid.uuid4()),
                "organization_id": ORG_ID,
                "template_id": template["id"],
                **{
                    key: clause[key]
                    for key in (
                        "clause_key",
                        "title",
                        "position",
                        "fixed_position",
                        "content_json",
                        "condition_key",
                        "condition_mode",
                        "alert_tipo",
                    )
                },
            }
        )
    return template


def _seed_matrix(
    store: FakeStore,
    *,
    case_row: dict[str, Any],
    template: dict[str, Any],
    snapshot_hash: str | None = None,
    version: int = 1,
    clause_order: list[str] | None = None,
    clause_overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    order = clause_order or [
        clause["clause_key"] for clause in store.tables["escritura_template_clauses"]
    ]
    row = {
        "id": str(uuid.uuid4()),
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "escritura_case_id": case_row["id"],
        "template_id": template["id"],
        "snapshot_case_status": case_row["case_status"],
        "snapshot_hash": snapshot_hash
        or escritura_matrices._json_hash(case_row["variable_snapshot"]),
        "clause_order": order,
        "clause_overrides": clause_overrides or {},
        "status": "draft",
        "version": version,
        "submitted_by": None,
        "submitted_at": None,
        "approved_by": None,
        "approved_at": None,
        "created_at": "2026-06-10T00:00:00Z",
        "updated_at": "2026-06-10T00:00:00Z",
    }
    store.tables.setdefault("escritura_matrices", []).append(row)
    return row


class TestGetCaseMatriz:
    def test_get_lazy_creates_matrix_from_published_template(self, monkeypatch):
        store = FakeStore()
        _seed_template(store)
        _seed_case(store)
        response = _client(_build_app(store, monkeypatch)).get(
            f"/api/v1/escritura-matrices/case/{CASE_ID}",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 200
        body = response.json()["matriz"]
        assert len(store.tables["escritura_matrices"]) == 1
        assert body["template"]["name"] == "Compraventa predio rustico"
        assert body["snapshot_stale"] is False
        assert body["version"] == 1
        assert body["resolution"]["missing_count"] == 0
        assert len(body["clauses"]) == len(_golden_clauses())
        token = next(
            token
            for token in body["resolution"]["tokens"]
            if token["variableKey"] == "comprador.nombre"
        )
        assert token["status"] == "resolved"

    def test_get_marks_snapshot_stale_without_mutating_matrix(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(store, case_row=case_row, template=template, snapshot_hash="old")
        response = _client(_build_app(store, monkeypatch)).get(
            f"/api/v1/escritura-matrices/case/{CASE_ID}",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 200
        body = response.json()["matriz"]
        assert body["id"] == matrix["id"]
        assert body["snapshot_stale"] is True
        assert body["approval_blockers"][0]["kind"] == "snapshot_stale"
        assert store.tables["escritura_matrices"][0]["snapshot_hash"] == "old"


class TestSaveMatriz:
    def test_put_saves_order_and_overrides_with_cas(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(store, case_row=case_row, template=template)
        response = _client(_build_app(store, monkeypatch)).put(
            f"/api/v1/escritura-matrices/{matrix['id']}",
            params={"organization_id": ORG_ID},
            json={
                "version": 1,
                "clause_order": ["compraventa", "comparecencia"],
                "clause_overrides": {
                    "gravamenes": {"disabled": True},
                    "comparecencia": {"title": "COMPARECENCIA EDITADA"},
                },
            },
        )
        assert response.status_code == 200
        body = response.json()["matriz"]
        assert body["version"] == 2
        assert body["clause_order"] == ["compraventa", "comparecencia"]
        assert [clause["clause_key"] for clause in body["clauses"][:2]] == [
            "compraventa",
            "comparecencia",
        ]
        assert body["clauses"][1]["title"] == "COMPARECENCIA EDITADA"
        gravamenes = next(
            clause for clause in body["clauses"] if clause["clause_key"] == "gravamenes"
        )
        assert gravamenes["disabled"] is True
        assert store.tables["escritura_matrices"][0]["version"] == 2

    def test_put_returns_409_on_version_conflict(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(store, case_row=case_row, template=template, version=3)
        response = _client(_build_app(store, monkeypatch)).put(
            f"/api/v1/escritura-matrices/{matrix['id']}",
            params={"organization_id": ORG_ID},
            json={"version": 2, "clause_order": [], "clause_overrides": {}},
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "version_conflict"
        assert response.json()["detail"]["current_version"] == 3

    def test_put_returns_409_when_snapshot_is_stale(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(store, case_row=case_row, template=template, snapshot_hash="old")
        response = _client(_build_app(store, monkeypatch)).put(
            f"/api/v1/escritura-matrices/{matrix['id']}",
            params={"organization_id": ORG_ID},
            json={"version": 1, "clause_order": [], "clause_overrides": {}},
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "snapshot_stale"

    def test_put_is_scoped_to_organization(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(store, case_row=case_row, template=template)
        response = _client(_build_app(store, monkeypatch)).put(
            f"/api/v1/escritura-matrices/{matrix['id']}",
            params={"organization_id": OTHER_ORG_ID},
            json={"version": 1, "clause_order": [], "clause_overrides": {}},
        )
        assert response.status_code == 404
