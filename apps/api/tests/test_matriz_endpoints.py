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
from api.v1.endpoints import escritura_matrices, escritura_templates

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


def _variable_snapshot_with_alerts(alerts: list[dict[str, Any]]) -> dict[str, Any]:
    snapshot = json.loads(json.dumps(_snapshot_fixture()["variable_snapshot"]))
    titulo = snapshot.setdefault("titulo", {})
    titulo["alertas_resueltas"] = alerts
    return snapshot


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

    def in_(self, column, values):
        self.filters.append((column, ("__in__", {str(value) for value in values})))
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
            elif isinstance(expected, tuple) and expected[0] == "__in__":
                if str(actual) not in expected[1]:
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
        self.storage = FakeStorage()

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)


class FakeStorageBucket:
    def __init__(self, store: "FakeStorage"):
        self.store = store

    def upload(self, path: str, file_bytes: bytes, options: dict[str, Any]):
        self.store.uploads.append(
            {"path": path, "bytes": file_bytes, "options": options}
        )
        return {"path": path}

    def create_signed_url(self, path: str, expires_in: int):
        self.store.signed_urls.append({"path": path, "expires_in": expires_in})
        return {"signedURL": f"https://storage.test/{path}?signed=1"}


class FakeStorage:
    def __init__(self):
        self.uploads: list[dict[str, Any]] = []
        self.signed_urls: list[dict[str, Any]] = []

    def from_(self, _bucket: str) -> FakeStorageBucket:
        return FakeStorageBucket(self)


def _build_app(store: FakeStore, monkeypatch) -> FastAPI:
    monkeypatch.setattr("core.database.get_supabase_client", lambda: store)
    monkeypatch.setattr(
        "api.v1.endpoints.escritura_templates.get_supabase_client", lambda: store
    )
    monkeypatch.setattr(
        "api.v1.endpoints.legal_variables.ensure_legal_documents_feature_enabled",
        lambda **_kwargs: None,
    )
    app = FastAPI()
    app.dependency_overrides[verify_internal_secret] = lambda: None
    app.include_router(escritura_templates.router, prefix="/api/v1")
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
    status: str = "draft",
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
        "status": status,
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
        assert body["project_id"] == PROJECT_ID
        assert body["template"]["name"] == "Compraventa predio rustico"
        assert body["snapshot_stale"] is False
        assert body["version"] == 1
        assert body["resolution"]["missing_count"] == 0
        assert len(body["clauses"]) == len(_golden_clauses())
        assert body["clauses"][0]["resolved_content"]["type"] == "doc"
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


class TestTenantRegression:
    def test_new_resources_are_scoped_by_org_and_project(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(store, case_row=case_row, template=template, status="approved")
        generation = {
            "id": "00000000-0000-4000-8000-000000000011",
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "escritura_case_id": CASE_ID,
            "matriz_id": matrix["id"],
            "matriz_version": 1,
            "template_id": template["id"],
            "snapshot_hash": matrix["snapshot_hash"],
            "resolution_manifest": {"tokens": [], "blocks": [], "missing_count": 0},
            "content_hash": "content",
            "storage_path": f"{ORG_ID}/escritura-minutas/{CASE_ID}/doc.docx",
            "warning_acknowledged_by": "00000000-0000-4000-8000-000000000010",
            "warning_acknowledged_at": "2026-06-10T00:00:00Z",
            "generated_by": "00000000-0000-4000-8000-000000000010",
            "generated_at": "2026-06-10T00:00:00Z",
        }
        store.tables["escritura_minuta_generations"] = [generation]

        other_project_id = "00000000-0000-4000-8000-000000000098"
        other_case_id = "00000000-0000-4000-8000-000000000097"
        other_template = {**template, "id": str(uuid.uuid4()), "organization_id": OTHER_ORG_ID}
        other_clause = {
            **store.tables["escritura_template_clauses"][0],
            "id": str(uuid.uuid4()),
            "organization_id": OTHER_ORG_ID,
            "template_id": other_template["id"],
        }
        other_case = {
            **case_row,
            "id": other_case_id,
            "organization_id": OTHER_ORG_ID,
            "project_id": other_project_id,
        }
        other_matrix = {
            **matrix,
            "id": str(uuid.uuid4()),
            "organization_id": OTHER_ORG_ID,
            "project_id": other_project_id,
            "escritura_case_id": other_case_id,
            "template_id": other_template["id"],
        }
        other_generation = {
            **generation,
            "id": str(uuid.uuid4()),
            "organization_id": OTHER_ORG_ID,
            "project_id": other_project_id,
            "escritura_case_id": other_case_id,
            "matriz_id": other_matrix["id"],
            "template_id": other_template["id"],
            "storage_path": f"{OTHER_ORG_ID}/escritura-minutas/{other_case_id}/doc.docx",
        }
        rogue_project_generation = {
            **generation,
            "id": str(uuid.uuid4()),
            "project_id": other_project_id,
            "storage_path": f"{ORG_ID}/escritura-minutas/{CASE_ID}/rogue.docx",
        }
        rogue_project_matrix = {
            **matrix,
            "id": str(uuid.uuid4()),
            "project_id": other_project_id,
        }

        store.tables["escritura_templates"].append(other_template)
        store.tables["escritura_template_clauses"].append(other_clause)
        store.tables["escritura_cases"].append(other_case)
        store.tables["projects"].append(
            {"id": other_project_id, "organization_id": OTHER_ORG_ID, "name": "Otro proyecto"}
        )
        store.tables["escritura_matrices"].extend([other_matrix, rogue_project_matrix])
        store.tables["escritura_minuta_generations"].extend(
            [other_generation, rogue_project_generation]
        )

        client = _client(_build_app(store, monkeypatch))

        other_template_response = client.get(
            f"/api/v1/escritura-templates/{other_template['id']}",
            params={"organization_id": ORG_ID},
        )
        assert other_template_response.status_code == 404

        clause_attempt = client.put(
            f"/api/v1/escritura-templates/{other_template['id']}/clauses/rogue",
            params={"organization_id": ORG_ID},
            json={
                "title": "ROGUE",
                "position": 0,
                "fixed_position": False,
                "content_json": {"schema_version": 1, "type": "doc", "content": []},
            },
        )
        assert clause_attempt.status_code == 404
        assert not [
            clause
            for clause in store.tables["escritura_template_clauses"]
            if clause["clause_key"] == "rogue"
        ]

        other_case_response = client.get(
            f"/api/v1/escritura-matrices/case/{other_case_id}",
            params={"organization_id": ORG_ID},
        )
        assert other_case_response.status_code == 404

        rogue_matrix_response = client.put(
            f"/api/v1/escritura-matrices/{rogue_project_matrix['id']}",
            params={"organization_id": ORG_ID},
            json={"version": 1, "clause_order": [], "clause_overrides": {}},
        )
        assert rogue_matrix_response.status_code == 404

        generations_response = client.get(
            f"/api/v1/escritura-matrices/case/{CASE_ID}/generations",
            params={"organization_id": ORG_ID},
        )
        assert generations_response.status_code == 200
        returned_ids = {row["id"] for row in generations_response.json()["generations"]}
        assert generation["id"] in returned_ids
        assert other_generation["id"] not in returned_ids
        assert rogue_project_generation["id"] not in returned_ids


class TestMatrizReviewWorkflow:
    def test_submit_moves_draft_to_review_and_audits_decision(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(store, case_row=case_row, template=template)

        response = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/submit",
            params={"organization_id": ORG_ID},
            json={"submitted_by": "00000000-0000-4000-8000-000000000020"},
        )

        assert response.status_code == 200
        body = response.json()["matriz"]
        assert body["status"] == "legal_review_pending"
        assert body["version"] == 2
        updated = store.tables["escritura_matrices"][0]
        assert updated["submitted_by"] == "00000000-0000-4000-8000-000000000020"
        assert store.tables["legal_review_decisions"][0]["decision_type"] == "matriz_submitted"

    def test_approve_requires_pending_status_and_distinct_reviewer(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(
            store, case_row=case_row, template=template, status="legal_review_pending"
        )
        matrix["submitted_by"] = "00000000-0000-4000-8000-000000000020"

        same_user = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/approve",
            params={"organization_id": ORG_ID},
            json={"approved_by": "00000000-0000-4000-8000-000000000020"},
        )
        assert same_user.status_code == 403
        assert same_user.json()["detail"]["code"] == "reviewer_not_authorized"

        approved = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/approve",
            params={"organization_id": ORG_ID},
            json={"approved_by": "00000000-0000-4000-8000-000000000021"},
        )

        assert approved.status_code == 200
        body = approved.json()["matriz"]
        assert body["status"] == "approved"
        assert body["version"] == 2
        assert store.tables["escritura_matrices"][0]["approved_by"] == "00000000-0000-4000-8000-000000000021"
        assert store.tables["legal_review_decisions"][0]["decision_type"] == "matriz_approved"
        assert store.tables["legal_review_decisions"][0]["decision_status"] == "approved"

    def test_reject_returns_pending_matrix_to_draft_and_audits_reason(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(
            store, case_row=case_row, template=template, status="legal_review_pending"
        )
        matrix["submitted_by"] = "00000000-0000-4000-8000-000000000020"

        response = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/reject",
            params={"organization_id": ORG_ID},
            json={
                "rejected_by": "00000000-0000-4000-8000-000000000021",
                "reason": "Ajustar cláusula de pago.",
            },
        )

        assert response.status_code == 200
        body = response.json()["matriz"]
        assert body["status"] == "draft"
        assert body["version"] == 2
        updated = store.tables["escritura_matrices"][0]
        assert updated["submitted_by"] is None
        assert store.tables["legal_review_decisions"][0]["decision_type"] == "matriz_rejected"
        assert store.tables["legal_review_decisions"][0]["reason"] == "Ajustar cláusula de pago."

    def test_approved_matrix_is_locked_for_editor_saves(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(store, case_row=case_row, template=template, status="approved")

        response = _client(_build_app(store, monkeypatch)).put(
            f"/api/v1/escritura-matrices/{matrix['id']}",
            params={"organization_id": ORG_ID},
            json={"version": 1, "clause_order": [], "clause_overrides": {}},
        )

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "matriz_approved_locked"

    def test_get_supersedes_approved_matrix_when_snapshot_hash_changes(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        changed_snapshot = _snapshot_fixture()["variable_snapshot"]
        changed_snapshot["comprador.nombre"]["value_text"] = "Comprador corregido"
        case_row = _seed_case(store, variable_snapshot=changed_snapshot)
        matrix = _seed_matrix(
            store,
            case_row=case_row,
            template=template,
            status="approved",
            snapshot_hash="old",
        )
        matrix["approved_by"] = "00000000-0000-4000-8000-000000000021"
        matrix["approved_at"] = "2026-06-10T00:00:00Z"

        response = _client(_build_app(store, monkeypatch)).get(
            f"/api/v1/escritura-matrices/case/{CASE_ID}",
            params={"organization_id": ORG_ID},
        )

        assert response.status_code == 200
        body = response.json()["matriz"]
        assert body["status"] == "draft"
        assert body["snapshot_stale"] is False
        assert body["version"] == 2
        updated = store.tables["escritura_matrices"][0]
        assert updated["snapshot_hash"] == escritura_matrices._json_hash(changed_snapshot)
        assert updated["approved_by"] is None

    def test_put_and_generate_detect_snapshot_divergence(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(
            store, case_row=case_row, template=template, status="approved", snapshot_hash="old"
        )

        generate = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/generate",
            params={"organization_id": ORG_ID},
            json={
                "warning_acknowledged": True,
                "generated_by": "00000000-0000-4000-8000-000000000010",
            },
        )
        save = _client(_build_app(store, monkeypatch)).put(
            f"/api/v1/escritura-matrices/{matrix['id']}",
            params={"organization_id": ORG_ID},
            json={"version": 1, "clause_order": [], "clause_overrides": {}},
        )

        assert generate.status_code == 409
        assert generate.json()["detail"]["code"] == "snapshot_stale"
        assert save.status_code == 409
        assert save.json()["detail"]["code"] == "snapshot_stale"


class TestAlertClauseContract:
    def test_get_blocks_clause_added_alert_without_active_clause(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(
            store,
            variable_snapshot=_variable_snapshot_with_alerts(
                [
                    {
                        "tipo": "derechos_aguas",
                        "resolution": "clause_added",
                        "reason": "Agregar reserva expresa de derechos de aguas.",
                    }
                ]
            ),
        )
        _seed_matrix(store, case_row=case_row, template=template)

        response = _client(_build_app(store, monkeypatch)).get(
            f"/api/v1/escritura-matrices/case/{CASE_ID}",
            params={"organization_id": ORG_ID},
        )

        assert response.status_code == 200
        blockers = response.json()["matriz"]["approval_blockers"]
        blocker = next(
            blocker
            for blocker in blockers
            if blocker["kind"] == "alert_clause_missing"
            and blocker["alert_tipo"] == "derechos_aguas"
        )
        assert blocker["required_clause"] == "Water-rights clause (included or expressly reserved)"
        assert blocker["fix_url"] == "/documentos/plantillas"
        assert blocker["message"] == "Agregar reserva expresa de derechos de aguas."

    def test_get_accepts_clause_added_alert_when_active_clause_has_alert_tipo(
        self, monkeypatch
    ):
        store = FakeStore()
        template = _seed_template(store)
        store.tables["escritura_template_clauses"][0]["alert_tipo"] = "derechos_aguas"
        case_row = _seed_case(
            store,
            variable_snapshot=_variable_snapshot_with_alerts(
                [{"tipo": "derechos_aguas", "resolution": "clause_added"}]
            ),
        )
        _seed_matrix(store, case_row=case_row, template=template)

        response = _client(_build_app(store, monkeypatch)).get(
            f"/api/v1/escritura-matrices/case/{CASE_ID}",
            params={"organization_id": ORG_ID},
        )

        assert response.status_code == 200
        blockers = response.json()["matriz"]["approval_blockers"]
        assert not [
            blocker
            for blocker in blockers
            if blocker["kind"] == "alert_clause_missing"
            and blocker["alert_tipo"] == "derechos_aguas"
        ]

    def test_get_surfaces_dismissed_alert_reason(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(
            store,
            variable_snapshot=_variable_snapshot_with_alerts(
                [
                    {
                        "tipo": "derechos_aguas",
                        "resolution": "dismissed_with_reason",
                        "reason": "El predio no incluye derechos de aguas.",
                    }
                ]
            ),
        )
        _seed_matrix(store, case_row=case_row, template=template)

        response = _client(_build_app(store, monkeypatch)).get(
            f"/api/v1/escritura-matrices/case/{CASE_ID}",
            params={"organization_id": ORG_ID},
        )

        assert response.status_code == 200
        assert response.json()["matriz"]["dismissed_alerts"] == [
            {
                "tipo": "derechos_aguas",
                "reason": "El predio no incluye derechos de aguas.",
            }
        ]

    def test_generate_blocks_clause_added_alert_without_active_clause(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(
            store,
            variable_snapshot=_variable_snapshot_with_alerts(
                [{"tipo": "derechos_aguas", "resolution": "clause_added"}]
            ),
        )
        matrix = _seed_matrix(
            store, case_row=case_row, template=template, status="approved"
        )

        response = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/generate",
            params={"organization_id": ORG_ID},
            json={
                "warning_acknowledged": True,
                "generated_by": "00000000-0000-4000-8000-000000000010",
            },
        )

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "alert_clause_missing"
        assert detail["blocking"][0]["alert_tipo"] == "derechos_aguas"
        assert store.storage.uploads == []


class TestGenerateMinuta:
    def test_generate_requires_warning_ack(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(
            store, case_row=case_row, template=template, status="approved"
        )
        response = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/generate",
            params={"organization_id": ORG_ID},
            json={
                "warning_acknowledged": False,
                "generated_by": "00000000-0000-4000-8000-000000000010",
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "warning_required"
        assert store.storage.uploads == []
        assert store.tables.get("escritura_minuta_generations") is None

    def test_generate_requires_approved_matrix(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(store, case_row=case_row, template=template)
        response = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/generate",
            params={"organization_id": ORG_ID},
            json={
                "warning_acknowledged": True,
                "generated_by": "00000000-0000-4000-8000-000000000010",
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "matriz_not_approved"

    def test_generate_returns_409_when_snapshot_is_stale(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(
            store,
            case_row=case_row,
            template=template,
            status="approved",
            snapshot_hash="old",
        )
        response = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/generate",
            params={"organization_id": ORG_ID},
            json={
                "warning_acknowledged": True,
                "generated_by": "00000000-0000-4000-8000-000000000010",
            },
        )

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "snapshot_stale"

    def test_generate_blocks_current_readiness_gate_failures(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(
            store,
            readiness_gates={
                "title_verified": {
                    "gate": "title_verified",
                    "status": "blocked",
                    "blocking_variables": ["titulo.clausula_primero_texto"],
                    "warnings": [],
                }
            },
        )
        matrix = _seed_matrix(
            store, case_row=case_row, template=template, status="approved"
        )
        response = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/generate",
            params={"organization_id": ORG_ID},
            json={
                "warning_acknowledged": True,
                "generated_by": "00000000-0000-4000-8000-000000000010",
            },
        )

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "readiness_blocked"
        assert detail["blocking"] == [
            {
                "kind": "readiness_gate",
                "gate": "title_verified",
                "cause": "titulo.clausula_primero_texto",
                "fix_url": f"/projects/{PROJECT_ID}?tab=legal",
            }
        ]
        assert store.storage.uploads == []
        assert store.tables.get("escritura_minuta_generations") is None

    def test_generate_persists_docx_generation_and_signed_url(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        case_row = _seed_case(store)
        matrix = _seed_matrix(
            store, case_row=case_row, template=template, status="approved"
        )
        response = _client(_build_app(store, monkeypatch)).post(
            f"/api/v1/escritura-matrices/{matrix['id']}/generate",
            params={"organization_id": ORG_ID},
            json={
                "warning_acknowledged": True,
                "generated_by": "00000000-0000-4000-8000-000000000010",
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["matriz_id"] == matrix["id"]
        assert body["matriz_version"] == matrix["version"]
        assert body["content_hash"]
        assert body["download_url"].startswith("https://storage.test/")
        assert len(store.storage.uploads) == 1
        assert store.storage.uploads[0]["bytes"].startswith(b"PK")
        inserted = store.tables["escritura_minuta_generations"][0]
        assert inserted["resolution_manifest"]["missing_count"] == 0
        assert inserted["warning_acknowledged_by"] == "00000000-0000-4000-8000-000000000010"

    def test_list_case_generations_returns_signed_urls(self, monkeypatch):
        store = FakeStore()
        _seed_case(store)
        store.tables["escritura_minuta_generations"] = [
            {
                "id": "00000000-0000-4000-8000-000000000011",
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "escritura_case_id": CASE_ID,
                "matriz_id": "00000000-0000-4000-8000-000000000012",
                "matriz_version": 4,
                "template_id": "00000000-0000-4000-8000-000000000013",
                "snapshot_hash": "hash",
                "resolution_manifest": {"tokens": [], "blocks": [], "missing_count": 0},
                "content_hash": "content",
                "storage_path": f"{ORG_ID}/escritura-minutas/{CASE_ID}/doc.docx",
                "warning_acknowledged_by": "00000000-0000-4000-8000-000000000010",
                "warning_acknowledged_at": "2026-06-10T00:00:00Z",
                "generated_by": "00000000-0000-4000-8000-000000000010",
                "generated_at": "2026-06-10T00:00:00Z",
            }
        ]

        response = _client(_build_app(store, monkeypatch)).get(
            f"/api/v1/escritura-matrices/case/{CASE_ID}/generations",
            params={"organization_id": ORG_ID},
        )

        assert response.status_code == 200
        generation = response.json()["generations"][0]
        assert generation["download_url"].startswith("https://storage.test/")
        assert store.storage.signed_urls[0]["expires_in"] == 604800
