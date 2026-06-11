"""SDD 008 T017 tests: template library endpoints (list/create/clone,
clause upsert with catalog validation, publish immutability)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "matriz"

ORG_ID = "00000000-0000-4000-8000-000000000001"
OTHER_ORG_ID = "00000000-0000-4000-8000-000000000099"
USER_ID = "00000000-0000-4000-8000-000000000777"


def _golden() -> dict:
    return json.loads(
        (FIXTURE_DIR / "golden_template_clauses.json").read_text(encoding="utf-8")
    )


# ─── Fake Supabase con filtrado real en memoria ──────────────────────────────


class FakeQuery:
    def __init__(self, store: "FakeStore", table: str):
        self.store = store
        self.table_name = table
        self.action = "select"
        self.payload = None
        self.filters: list[tuple[str, object]] = []
        self.single = False

    def select(self, *_a):
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

    def in_(self, column, values):
        self.filters.append((column, ("__in__", [str(v) for v in values])))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def _matches(self, row: dict) -> bool:
        for column, expected in self.filters:
            value = row.get(column)
            if isinstance(expected, tuple) and expected[0] == "__in__":
                if str(value) not in expected[1]:
                    return False
            elif str(value) != str(expected):
                return False
        return True

    def execute(self):
        rows = self.store.tables.setdefault(self.table_name, [])
        if self.action == "insert":
            payloads = (
                self.payload if isinstance(self.payload, list) else [self.payload]
            )
            inserted = []
            for payload in payloads:
                row = {"id": str(uuid.uuid4()), **payload}
                rows.append(row)
                inserted.append(row)
            return SimpleNamespace(data=inserted)
        if self.action == "update":
            updated = []
            for row in rows:
                if self._matches(row):
                    row.update(self.payload)
                    updated.append(row)
            return SimpleNamespace(data=updated)
        matched = [row for row in rows if self._matches(row)]
        if self.single:
            return SimpleNamespace(data=matched[0] if matched else None)
        return SimpleNamespace(data=matched)


class FakeStore:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)


# ─── App harness ─────────────────────────────────────────────────────────────


def _build_app(store: FakeStore, monkeypatch):
    from fastapi import FastAPI

    from api.deps import verify_internal_secret
    from api.v1.endpoints import escritura_templates

    monkeypatch.setattr(escritura_templates, "get_supabase_client", lambda: store)
    app = FastAPI()
    app.dependency_overrides[verify_internal_secret] = lambda: None
    app.include_router(escritura_templates.router, prefix="/api/v1")
    return app


def _client(app):
    from fastapi.testclient import TestClient

    return TestClient(app, headers={"X-Internal-Secret": "test-secret"})


def _seed_template(store: FakeStore, *, status="draft", org_id=ORG_ID, name="Compraventa") -> dict:
    template = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "name": name,
        "document_type": "compraventa",
        "version": 1,
        "status": status,
        "published_at": None,
        "published_by": None,
        "created_at": "2026-06-10T00:00:00Z",
        "updated_at": "2026-06-10T00:00:00Z",
    }
    store.tables.setdefault("escritura_templates", []).append(template)
    return template


def _seed_clauses_from_golden(store: FakeStore, template: dict, count: int | None = None):
    clauses = _golden()["clauses"]
    if count is not None:
        clauses = clauses[:count]
    for clause in clauses:
        store.tables.setdefault("escritura_template_clauses", []).append(
            {
                "id": str(uuid.uuid4()),
                "organization_id": template["organization_id"],
                "template_id": template["id"],
                **{k: clause[k] for k in (
                    "clause_key",
                    "title",
                    "position",
                    "fixed_position",
                    "content_json",
                    "condition_key",
                    "condition_mode",
                    "alert_tipo",
                )},
            }
        )


VALID_CLAUSE_BODY = {
    "title": "CLÁUSULA DE PRUEBA",
    "position": 30,
    "fixed_position": False,
    "content_json": {
        "schema_version": 1,
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "El comprador "},
                    {
                        "type": "variable_token",
                        "attrs": {"variableKey": "comprador.nombre", "label": "Comprador"},
                    },
                ],
            }
        ],
    },
}


class TestTemplateLibrary:
    def test_list_returns_templates_with_clause_count(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        _seed_clauses_from_golden(store, template, count=3)
        client = _client(_build_app(store, monkeypatch))
        response = client.get(
            "/api/v1/escritura-templates", params={"organization_id": ORG_ID}
        )
        assert response.status_code == 200
        templates = response.json()["templates"]
        assert len(templates) == 1
        assert templates[0]["clause_count"] == 3

    def test_list_is_tenant_scoped(self, monkeypatch):
        store = FakeStore()
        _seed_template(store, org_id=OTHER_ORG_ID)
        client = _client(_build_app(store, monkeypatch))
        response = client.get(
            "/api/v1/escritura-templates", params={"organization_id": ORG_ID}
        )
        assert response.status_code == 200
        assert response.json()["templates"] == []

    def test_create_assigns_next_version_per_name(self, monkeypatch):
        store = FakeStore()
        _seed_template(store, status="published")
        client = _client(_build_app(store, monkeypatch))
        response = client.post(
            "/api/v1/escritura-templates",
            params={"organization_id": ORG_ID},
            json={"name": "Compraventa", "document_type": "compraventa"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["version"] == 2
        assert body["status"] == "draft"

    def test_clone_copies_clauses_into_new_draft(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store, status="published")
        _seed_clauses_from_golden(store, template, count=5)
        client = _client(_build_app(store, monkeypatch))
        response = client.post(
            "/api/v1/escritura-templates",
            params={"organization_id": ORG_ID},
            json={
                "name": "Compraventa",
                "document_type": "compraventa",
                "clone_from_template_id": template["id"],
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["version"] == 2
        assert body["clause_count"] == 5
        assert {c["clause_key"] for c in body["clauses"]} == {
            "comparecencia",
            "antecedentes_dominio",
            "subdivision_sag_plano",
            "individualizacion_lote",
            "compraventa",
        }


class TestClauseUpsert:
    def test_upsert_valid_clause_in_draft(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        client = _client(_build_app(store, monkeypatch))
        response = client.put(
            f"/api/v1/escritura-templates/{template['id']}/clauses/prueba",
            params={"organization_id": ORG_ID},
            json=VALID_CLAUSE_BODY,
        )
        assert response.status_code == 200
        clauses = response.json()["clauses"]
        assert [c["clause_key"] for c in clauses] == ["prueba"]

    def test_upsert_replaces_existing_clause(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        client = _client(_build_app(store, monkeypatch))
        client.put(
            f"/api/v1/escritura-templates/{template['id']}/clauses/prueba",
            params={"organization_id": ORG_ID},
            json=VALID_CLAUSE_BODY,
        )
        response = client.put(
            f"/api/v1/escritura-templates/{template['id']}/clauses/prueba",
            params={"organization_id": ORG_ID},
            json={**VALID_CLAUSE_BODY, "title": "TÍTULO NUEVO"},
        )
        assert response.status_code == 200
        clauses = response.json()["clauses"]
        assert len(clauses) == 1
        assert clauses[0]["title"] == "TÍTULO NUEVO"

    def test_unknown_key_rejected_with_422(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        client = _client(_build_app(store, monkeypatch))
        body = json.loads(json.dumps(VALID_CLAUSE_BODY))
        body["content_json"]["content"][0]["content"][1]["attrs"]["variableKey"] = (
            "clave.inexistente"
        )
        response = client.put(
            f"/api/v1/escritura-templates/{template['id']}/clauses/prueba",
            params={"organization_id": ORG_ID},
            json=body,
        )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "invalid_keys"
        assert detail["invalid_keys"][0]["key"] == "clave.inexistente"

    def test_removed_key_returns_suggested_migration(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        client = _client(_build_app(store, monkeypatch))
        body = json.loads(json.dumps(VALID_CLAUSE_BODY))
        body["content_json"]["content"][0]["content"][1]["attrs"]["variableKey"] = (
            "matriz.inscripcion_fojas"
        )
        response = client.put(
            f"/api/v1/escritura-templates/{template['id']}/clauses/prueba",
            params={"organization_id": ORG_ID},
            json=body,
        )
        assert response.status_code == 422
        invalid = response.json()["detail"]["invalid_keys"][0]
        assert invalid["reason"] == "removed_key"
        assert invalid["suggested_migration"] == "titulo.inscripciones[]"

    def test_upsert_on_published_template_conflicts(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store, status="published")
        client = _client(_build_app(store, monkeypatch))
        response = client.put(
            f"/api/v1/escritura-templates/{template['id']}/clauses/prueba",
            params={"organization_id": ORG_ID},
            json=VALID_CLAUSE_BODY,
        )
        assert response.status_code == 409


class TestPublish:
    def test_publish_full_golden_template(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        _seed_clauses_from_golden(store, template)
        client = _client(_build_app(store, monkeypatch))
        response = client.post(
            f"/api/v1/escritura-templates/{template['id']}/publish",
            params={"organization_id": ORG_ID},
            json={"published_by": USER_ID},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "published"
        assert body["clause_count"] == 21

    def test_publish_retires_previous_published_version(self, monkeypatch):
        store = FakeStore()
        previous = _seed_template(store, status="published")
        draft = _seed_template(store)
        draft["version"] = 2
        _seed_clauses_from_golden(store, draft, count=3)
        client = _client(_build_app(store, monkeypatch))
        response = client.post(
            f"/api/v1/escritura-templates/{draft['id']}/publish",
            params={"organization_id": ORG_ID},
            json={"published_by": USER_ID},
        )
        assert response.status_code == 200
        assert previous["status"] == "retired"

    def test_publish_without_clauses_conflicts(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        client = _client(_build_app(store, monkeypatch))
        response = client.post(
            f"/api/v1/escritura-templates/{template['id']}/publish",
            params={"organization_id": ORG_ID},
            json={"published_by": USER_ID},
        )
        assert response.status_code == 409

    def test_publish_with_empty_clause_conflicts(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store)
        store.tables.setdefault("escritura_template_clauses", []).append(
            {
                "id": str(uuid.uuid4()),
                "organization_id": ORG_ID,
                "template_id": template["id"],
                "clause_key": "vacia",
                "title": "VACÍA",
                "position": 1,
                "fixed_position": False,
                "content_json": {"schema_version": 1, "type": "doc", "content": []},
                "condition_key": None,
                "condition_mode": None,
                "alert_tipo": None,
            }
        )
        client = _client(_build_app(store, monkeypatch))
        response = client.post(
            f"/api/v1/escritura-templates/{template['id']}/publish",
            params={"organization_id": ORG_ID},
            json={"published_by": USER_ID},
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "publish_blocked"

    def test_published_template_cannot_republish(self, monkeypatch):
        store = FakeStore()
        template = _seed_template(store, status="published")
        _seed_clauses_from_golden(store, template, count=2)
        client = _client(_build_app(store, monkeypatch))
        response = client.post(
            f"/api/v1/escritura-templates/{template['id']}/publish",
            params={"organization_id": ORG_ID},
            json={"published_by": USER_ID},
        )
        assert response.status_code == 409


class TestSeedScript:
    @pytest.mark.asyncio
    async def test_seed_publishes_golden_template_v1(self):
        from scripts.seed_matriz_template import seed_template

        store = FakeStore()
        summary = await seed_template(
            organization_id=ORG_ID, published_by=USER_ID, supabase=store
        )
        assert summary["status"] == "seeded"
        assert summary["version"] == 1
        assert summary["clause_count"] == 21
        templates = store.tables["escritura_templates"]
        assert templates[0]["status"] == "published"
        clauses = store.tables["escritura_template_clauses"]
        keys = {clause["clause_key"] for clause in clauses}
        assert "antecedentes_dominio" in keys
        assert "titulos_inscripciones" in keys

    @pytest.mark.asyncio
    async def test_seed_is_idempotent_per_org(self):
        from scripts.seed_matriz_template import seed_template

        store = FakeStore()
        await seed_template(
            organization_id=ORG_ID, published_by=USER_ID, supabase=store
        )
        again = await seed_template(
            organization_id=ORG_ID, published_by=USER_ID, supabase=store
        )
        assert again["status"] == "skipped"
        assert again["reason"] == "already_published"
        assert len(store.tables["escritura_templates"]) == 1
