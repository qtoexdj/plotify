"""SDD 009 US3 tests for the legal-titles API endpoints (T028)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from services import legal_title_analysis


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
OTHER_ORG_ID = "00000000-0000-4000-8000-000000000099"
OTHER_PROJECT_ID = "00000000-0000-4000-8000-000000000098"
USER_ID = "00000000-0000-4000-8000-000000000777"
DOC_1996_ID = "00000000-0000-4000-8000-000000000096"
DOC_2023_ID = "00000000-0000-4000-8000-000000002023"

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "titulo"


# ── Fake Supabase ──────────────────────────────────────────────────────


class FakeQuery:
    def __init__(self, store: dict, table_name: str):
        self._store = store
        self._table = table_name
        self._filters: list[tuple[str, str, object]] = []
        self._action = "select"
        self._payload: dict | None = None
        self._limit: int | None = None

    def select(self, *_args, **_kwargs):
        self._action = "select"
        return self

    def insert(self, payload):
        self._action = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._action = "update"
        self._payload = payload
        return self

    def eq(self, column, value):
        self._filters.append(("eq", column, value))
        return self

    def neq(self, column, value):
        self._filters.append(("neq", column, value))
        return self

    def in_(self, column, values):
        self._filters.append(("in", column, list(values)))
        return self

    def like(self, column, pattern):
        self._filters.append(("like", column, pattern))
        return self

    def gte(self, column, value):
        self._filters.append(("gte", column, value))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, count):
        self._limit = count
        return self

    def maybe_single(self):
        self._limit = 1
        return self

    def _matches(self, row: dict) -> bool:
        for op, column, value in self._filters:
            current = row.get(column)
            if op == "eq" and str(current) != str(value):
                return False
            if op == "neq" and str(current) == str(value):
                return False
            if op == "in" and str(current) not in {str(v) for v in value}:
                return False
            if op == "like" and not str(current).startswith(str(value).rstrip("%")):
                return False
            if op == "gte" and (current is None or str(current) < str(value)):
                return False
        return True

    def execute(self):
        rows = self._store.setdefault(self._table, [])
        if self._action == "insert":
            payload = dict(self._payload or {})
            payload.setdefault("id", str(uuid4()))
            payload.setdefault(
                "created_at", datetime.now(timezone.utc).isoformat()
            )
            rows.append(payload)
            return SimpleNamespace(data=[dict(payload)])
        matches = [row for row in rows if self._matches(row)]
        if self._action == "update":
            for row in matches:
                row.update(self._payload or {})
            return SimpleNamespace(data=[dict(row) for row in matches])
        if self._limit is not None:
            matches = matches[: self._limit]
        return SimpleNamespace(data=[dict(row) for row in matches])


class FakeSupabase:
    def __init__(self, *, seed_documents=None, store: dict | None = None):
        if seed_documents is not None:
            self.seed_documents = seed_documents
        self.store = store if store is not None else {}

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self.store, name)


# ── Fixtures ───────────────────────────────────────────────────────────


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def _fixture_document(name: str, document_id: str) -> dict:
    payload = _load_fixture(name)
    return {
        "id": document_id,
        "legal_document_id": document_id,
        "document_type": payload["document_type"],
        "filename": f"{name}.pdf",
        "version": 1,
        "pages": payload["pages"],
    }


@pytest.fixture
def title_documents() -> list[dict]:
    return [
        _fixture_document("teno_dominio_1996_pages.json", DOC_1996_ID),
        _fixture_document("teno_dominio_2023_pages.json", DOC_2023_ID),
    ]


def _analysis_row(**overrides) -> dict:
    row = {
        "id": str(uuid4()),
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "status": "proposed",
        "structure_type": "compra_derechos",
        "analysis_json": {},
        "narrative_comparecencia_generated": "Don Pedro Soto, chileno...",
        "narrative_comparecencia_edited": None,
        "narrative_primero_generated": "PRIMERO: Don Pedro Soto es dueño...",
        "narrative_primero_edited": None,
        "alerts": [],
        "verification_stats": {"verified_count": 10, "unverified_count": 0, "failures": []},
        "source_document_ids": [DOC_1996_ID, DOC_2023_ID],
        "source_content_hash": "hash-original",
        "extractor_name": legal_title_analysis.EXTRACTOR_NAME,
        "model_name": "gpt-4o",
        "prompt_version": legal_title_analysis.PROMPT_VERSION,
        "duration_ms": 1200,
        "failure_code": None,
        "approved_by": None,
        "approved_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    row.update(overrides)
    return row


def _source_hash(documents: list[dict]) -> str:
    normalized = legal_title_analysis._normalize_title_source_documents(
        documents,
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
    )
    return legal_title_analysis.compute_source_content_hash(normalized)


# ── App builder ────────────────────────────────────────────────────────


def _build_app(redis_mock=None):
    from fastapi import FastAPI

    from api.deps import verify_internal_secret
    from api.v1.endpoints.legal_titles import (
        get_optional_arq_pool,
        router as legal_titles_router,
    )

    app = FastAPI()

    async def _bypass_auth():
        return "test-secret"

    async def _fake_arq_pool():
        return redis_mock

    app.dependency_overrides[verify_internal_secret] = _bypass_auth
    app.dependency_overrides[get_optional_arq_pool] = _fake_arq_pool
    app.include_router(legal_titles_router, prefix="/api/v1")
    return app


def _client(app):
    from fastapi.testclient import TestClient

    return TestClient(app, headers={"X-Internal-Secret": "test-secret"})


@pytest.fixture
def redis_mock():
    redis = AsyncMock()
    redis.enqueue_job = AsyncMock()
    return redis


def _use_fake_supabase(monkeypatch: pytest.MonkeyPatch, fake: FakeSupabase) -> None:
    monkeypatch.setattr(
        legal_title_analysis, "_get_supabase_client", lambda: fake
    )


# ── GET /legal-titles/project/{project_id} ─────────────────────────────


class TestGetProjectTitleCase:
    def test_returns_active_analysis(self, monkeypatch, title_documents, redis_mock):
        row = _analysis_row()
        fake = FakeSupabase(
            seed_documents=title_documents,
            store={"title_analyses": [row]},
        )
        _use_fake_supabase(monkeypatch, fake)
        response = _client(_build_app(redis_mock)).get(
            f"/api/v1/legal-titles/project/{PROJECT_ID}",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 200
        data = response.json()["analysis"]
        assert data["id"] == row["id"]
        assert data["status"] == "proposed"
        assert data["narrative"]["primero"]["effective"] == row["narrative_primero_generated"]
        assert len(data["source_documents"]) == 2

    def test_404_when_no_title_documents(self, monkeypatch, redis_mock):
        fake = FakeSupabase(seed_documents=[])
        _use_fake_supabase(monkeypatch, fake)
        response = _client(_build_app(redis_mock)).get(
            f"/api/v1/legal-titles/project/{PROJECT_ID}",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 404

    def test_llm_disabled_when_documents_but_no_analysis(
        self, monkeypatch, title_documents, redis_mock
    ):
        fake = FakeSupabase(seed_documents=title_documents)
        _use_fake_supabase(monkeypatch, fake)
        monkeypatch.setattr(
            legal_title_analysis,
            "get_settings",
            lambda: SimpleNamespace(LEGAL_TITLE_AGENT_ENABLED=False),
        )
        response = _client(_build_app(redis_mock)).get(
            f"/api/v1/legal-titles/project/{PROJECT_ID}",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 200
        assert response.json()["analysis"]["status"] == "llm_disabled"

    def test_not_started_when_documents_but_no_current_analysis(
        self, monkeypatch, title_documents, redis_mock
    ):
        """Active title docs without a current analysis surface `not_started`
        (e.g. every run was superseded) instead of a misleading 404."""
        fake = FakeSupabase(seed_documents=title_documents)
        _use_fake_supabase(monkeypatch, fake)
        monkeypatch.setattr(
            legal_title_analysis,
            "get_settings",
            lambda: SimpleNamespace(LEGAL_TITLE_AGENT_ENABLED=True),
        )
        response = _client(_build_app(redis_mock)).get(
            f"/api/v1/legal-titles/project/{PROJECT_ID}",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 200
        data = response.json()["analysis"]
        assert data["status"] == "not_started"
        assert len(data["source_documents"]) == 2

    def test_cross_tenant_analysis_not_visible(
        self, monkeypatch, title_documents, redis_mock
    ):
        """An analysis belonging to another org must never leak into the response."""
        row = _analysis_row(organization_id=OTHER_ORG_ID, project_id=OTHER_PROJECT_ID)
        fake = FakeSupabase(
            seed_documents=title_documents,
            store={"title_analyses": [row]},
        )
        _use_fake_supabase(monkeypatch, fake)
        monkeypatch.setattr(
            legal_title_analysis,
            "get_settings",
            lambda: SimpleNamespace(LEGAL_TITLE_AGENT_ENABLED=True),
        )
        response = _client(_build_app(redis_mock)).get(
            f"/api/v1/legal-titles/project/{PROJECT_ID}",
            params={"organization_id": ORG_ID},
        )
        # Title docs exist but the only analysis row belongs to another tenant:
        # the response degrades to not_started without leaking the foreign run.
        assert response.status_code == 200
        data = response.json()["analysis"]
        assert data["status"] == "not_started"
        assert data["id"] != row["id"]
        assert data["structure_type"] is None
        assert data["alerts"] == []


# ── POST /legal-titles/project/{project_id}/reanalyze ──────────────────


class TestReanalyzeProjectTitle:
    def test_reanalyze_forces_rerun_even_with_existing_same_hash(
        self, monkeypatch, title_documents, redis_mock
    ):
        """SDD 011: 'Reanalizar' explícito SIEMPRE re-corre. El usuario pudo
        cambiar el modelo o el nivel de razonamiento (que no entran en el hash
        de contenido), así que no debe ser un no-op aunque exista un análisis
        con el mismo hash. La idempotencia por contenido queda para el camino
        automático (run_title_analysis)."""
        existing = _analysis_row(source_content_hash=_source_hash(title_documents))
        fake = FakeSupabase(
            seed_documents=title_documents,
            store={"title_analyses": [existing]},
        )
        _use_fake_supabase(monkeypatch, fake)
        response = _client(_build_app(redis_mock)).post(
            f"/api/v1/legal-titles/project/{PROJECT_ID}/reanalyze",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 202
        payload = response.json()
        assert payload["queued"] is True
        assert payload["status"] == "processing"
        assert payload["analysis_id"] != existing["id"]
        redis_mock.enqueue_job.assert_awaited_once()

    def test_409_when_analysis_already_processing(
        self, monkeypatch, title_documents, redis_mock
    ):
        processing = _analysis_row(status="processing", source_content_hash="other-hash")
        fake = FakeSupabase(
            seed_documents=title_documents,
            store={"title_analyses": [processing]},
        )
        _use_fake_supabase(monkeypatch, fake)
        response = _client(_build_app(redis_mock)).post(
            f"/api/v1/legal-titles/project/{PROJECT_ID}/reanalyze",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 409
        redis_mock.enqueue_job.assert_not_called()

    def test_stale_processing_run_is_treated_as_abandoned(
        self, monkeypatch, title_documents, redis_mock
    ):
        """SDD 011: una corrida 'processing' más vieja que el presupuesto del job
        es un zombie (worker caído/reiniciado a mitad de corrida). 'Reanalizar'
        debe re-correr en vez de quedar pegado en 409 para siempre."""
        from datetime import timedelta

        stale_ts = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        zombie = _analysis_row(
            status="processing",
            source_content_hash=_source_hash(title_documents),
            updated_at=stale_ts,
        )
        fake = FakeSupabase(
            seed_documents=title_documents,
            store={"title_analyses": [zombie]},
        )
        _use_fake_supabase(monkeypatch, fake)
        response = _client(_build_app(redis_mock)).post(
            f"/api/v1/legal-titles/project/{PROJECT_ID}/reanalyze",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 202
        payload = response.json()
        assert payload["queued"] is True
        assert payload["status"] == "processing"
        assert payload["analysis_id"] != zombie["id"]
        redis_mock.enqueue_job.assert_awaited_once()

    def test_422_when_no_title_documents(self, monkeypatch, redis_mock):
        fake = FakeSupabase(seed_documents=[])
        _use_fake_supabase(monkeypatch, fake)
        response = _client(_build_app(redis_mock)).post(
            f"/api/v1/legal-titles/project/{PROJECT_ID}/reanalyze",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 422

    def test_superseded_run_with_same_hash_does_not_satisfy_idempotency(
        self, monkeypatch, title_documents, redis_mock
    ):
        """Regression: superseded runs can share the hash of the next run
        (rollout, archive, interrupted reanalyze). They must not short-circuit
        the reanalyze into a no-op."""
        superseded = _analysis_row(
            status="superseded",
            source_content_hash=_source_hash(title_documents),
        )
        fake = FakeSupabase(
            seed_documents=title_documents,
            store={"title_analyses": [superseded]},
        )
        _use_fake_supabase(monkeypatch, fake)
        response = _client(_build_app(redis_mock)).post(
            f"/api/v1/legal-titles/project/{PROJECT_ID}/reanalyze",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 202
        payload = response.json()
        assert payload["queued"] is True
        assert payload["status"] == "processing"
        assert payload["analysis_id"] != superseded["id"]
        redis_mock.enqueue_job.assert_awaited_once()

    def test_queues_new_run_and_supersedes_previous(
        self, monkeypatch, title_documents, redis_mock
    ):
        previous = _analysis_row(source_content_hash="stale-hash")
        fake = FakeSupabase(
            seed_documents=title_documents,
            store={"title_analyses": [previous]},
        )
        _use_fake_supabase(monkeypatch, fake)
        response = _client(_build_app(redis_mock)).post(
            f"/api/v1/legal-titles/project/{PROJECT_ID}/reanalyze",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 202
        payload = response.json()
        assert payload["queued"] is True
        assert payload["status"] == "processing"
        redis_mock.enqueue_job.assert_awaited_once()
        job_name, job_payload = redis_mock.enqueue_job.await_args.args
        assert job_name == "analyze_project_title"
        assert job_payload["project_id"] == PROJECT_ID
        statuses = {
            row["id"]: row["status"] for row in fake.store["title_analyses"]
        }
        assert statuses[previous["id"]] == "superseded"
        assert statuses[payload["analysis_id"]] == "processing"


# ── PATCH /legal-titles/{analysis_id}/narrative ────────────────────────


class TestUpdateTitleNarrative:
    def _patch(self, client, analysis_id, **overrides):
        body = {
            "block": "primero",
            "edited_text": "PRIMERO: texto corregido por abogado.",
            "reason": "Ajuste de redacción notarial",
            "edited_by": USER_ID,
        }
        body.update(overrides)
        return client.patch(
            f"/api/v1/legal-titles/{analysis_id}/narrative",
            params={"organization_id": ORG_ID, "project_id": PROJECT_ID},
            json=body,
        )

    def test_edit_updates_block_and_writes_audit(
        self, monkeypatch, redis_mock
    ):
        row = _analysis_row()
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._patch(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 200
        narrative = response.json()
        assert narrative["primero"]["edited"] == "PRIMERO: texto corregido por abogado."
        assert narrative["primero"]["generated"] == row["narrative_primero_generated"]
        assert narrative["primero"]["effective"] == "PRIMERO: texto corregido por abogado."

        decisions = fake.store.get("legal_review_decisions", [])
        assert len(decisions) == 1
        decision = decisions[0]
        assert decision["decision_type"] == "title_block_edited"
        assert decision["title_analysis_id"] == row["id"]
        assert decision["reason"] == "Ajuste de redacción notarial"
        assert decision["decided_by"] == USER_ID
        assert decision["decision_payload"]["generated"] == row["narrative_primero_generated"]
        assert decision["decision_payload"]["edited"] == "PRIMERO: texto corregido por abogado."

    def test_409_when_analysis_approved(self, monkeypatch, redis_mock):
        row = _analysis_row(status="approved")
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._patch(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 409
        assert not fake.store.get("legal_review_decisions")

    def test_409_when_analysis_superseded(self, monkeypatch, redis_mock):
        row = _analysis_row(status="superseded")
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._patch(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 409

    def test_422_when_reason_empty(self, monkeypatch, redis_mock):
        row = _analysis_row()
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._patch(
            _client(_build_app(redis_mock)), row["id"], reason="   "
        )
        assert response.status_code == 422

    def test_403_cross_tenant(self, monkeypatch, redis_mock):
        row = _analysis_row(
            organization_id=OTHER_ORG_ID, project_id=OTHER_PROJECT_ID
        )
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._patch(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 403
        assert not fake.store.get("legal_review_decisions")

    def test_404_when_analysis_missing(self, monkeypatch, redis_mock):
        fake = FakeSupabase(store={"title_analyses": []})
        _use_fake_supabase(monkeypatch, fake)
        response = self._patch(_client(_build_app(redis_mock)), str(uuid4()))
        assert response.status_code == 404


# ── POST /legal-titles/{analysis_id}/approve ───────────────────────────


def _variable_row(variable_key: str, state: str) -> dict:
    return {
        "id": str(uuid4()),
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "variable_key": variable_key,
        "state": state,
    }


class TestApproveTitleCase:
    def _approve(self, client, analysis_id):
        return client.post(
            f"/api/v1/legal-titles/{analysis_id}/approve",
            params={"organization_id": ORG_ID, "project_id": PROJECT_ID},
            json={"approved_by": USER_ID},
        )

    def test_409_with_blocking_list(self, monkeypatch, redis_mock):
        row = _analysis_row(
            alerts=[{"tipo": "dl_3516", "detalle": "x", "resolution": "pending"}]
        )
        variables = [
            _variable_row("titulo.clausula_primero_texto", "manual_review"),
            _variable_row("matriz.rol_avaluo", "conflict"),
            _variable_row("titulo.estructura", "proposed"),
        ]
        fake = FakeSupabase(
            store={
                "title_analyses": [row],
                "variable_resolutions": variables,
            }
        )
        _use_fake_supabase(monkeypatch, fake)
        response = self._approve(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 409
        blocking = response.json()["detail"]["blocking"]
        kinds = {(item["kind"], item.get("key") or item.get("tipo")) for item in blocking}
        assert ("variable", "titulo.clausula_primero_texto") in kinds
        assert ("variable", "matriz.rol_avaluo") in kinds
        assert ("alert", "dl_3516") in kinds
        # Analysis must remain untouched.
        assert fake.store["title_analyses"][0]["status"] == "proposed"

    def test_409_when_status_not_approvable(self, monkeypatch, redis_mock):
        row = _analysis_row(status="failed")
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._approve(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 409

    def test_approves_case_variables_and_audit(self, monkeypatch, redis_mock):
        row = _analysis_row(
            alerts=[{"tipo": "dl_3516", "detalle": "x", "resolution": "acknowledged"}]
        )
        variables = [
            _variable_row("titulo.estructura", "proposed"),
            _variable_row("titulo.clausula_primero_texto", "proposed"),
            _variable_row("matriz.rol_avaluo", "approved"),
            _variable_row("vendedor.nombre", "manual_review"),  # not gating
        ]
        fake = FakeSupabase(
            store={
                "title_analyses": [row],
                "variable_resolutions": variables,
            }
        )
        _use_fake_supabase(monkeypatch, fake)
        response = self._approve(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "approved"
        assert data["approved_by"] == USER_ID

        states = {
            v["variable_key"]: v["state"]
            for v in fake.store["variable_resolutions"]
        }
        assert states["titulo.estructura"] == "approved"
        assert states["titulo.clausula_primero_texto"] == "approved"
        assert states["vendedor.nombre"] == "manual_review"

        decisions = fake.store.get("legal_review_decisions", [])
        assert len(decisions) == 1
        assert decisions[0]["decision_type"] == "title_case_approved"
        assert decisions[0]["decided_by"] == USER_ID

    def test_403_cross_tenant(self, monkeypatch, redis_mock):
        row = _analysis_row(
            organization_id=OTHER_ORG_ID, project_id=OTHER_PROJECT_ID
        )
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._approve(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 403
        assert fake.store["title_analyses"][0]["status"] == "proposed"


# ── POST /legal-titles/{analysis_id}/alerts/{alert_index}/resolve ──────


def _pending_alert(tipo: str = "dl_3516") -> dict:
    return {
        "tipo": tipo,
        "detalle": "Prohibición de cambio de destino DL 3.516",
        "evidence": {
            "legal_document_id": DOC_2023_ID,
            "page_number": 3,
            "snippet": "Conforme al Decreto Ley 3.516",
        },
        "resolution": "pending",
        "reason": None,
    }


class TestResolveTitleAlert:
    def _resolve(self, client, analysis_id, alert_index=0, **overrides):
        body = {
            "resolution": "clause_added",
            "reason": "Se incorporó la cláusula DL 3.516 a la minuta",
            "resolved_by": USER_ID,
        }
        body.update(overrides)
        return client.post(
            f"/api/v1/legal-titles/{analysis_id}/alerts/{alert_index}/resolve",
            params={"organization_id": ORG_ID, "project_id": PROJECT_ID},
            json=body,
        )

    def test_resolves_alert_and_writes_audit(self, monkeypatch, redis_mock):
        row = _analysis_row(alerts=[_pending_alert(), _pending_alert("derechos_aguas")])
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._resolve(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 200
        alert = response.json()
        assert alert["resolution"] == "clause_added"
        assert alert["reason"] == "Se incorporó la cláusula DL 3.516 a la minuta"

        stored = fake.store["title_analyses"][0]["alerts"]
        assert stored[0]["resolution"] == "clause_added"
        assert stored[1]["resolution"] == "pending"

        decisions = fake.store.get("legal_review_decisions", [])
        assert len(decisions) == 1
        assert decisions[0]["decision_type"] == "title_alert_resolved"
        assert decisions[0]["decision_payload"]["alert_index"] == 0
        assert decisions[0]["decision_payload"]["tipo"] == "dl_3516"
        assert decisions[0]["decided_by"] == USER_ID

    def test_404_when_alert_index_out_of_range(self, monkeypatch, redis_mock):
        row = _analysis_row(alerts=[_pending_alert()])
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._resolve(_client(_build_app(redis_mock)), row["id"], alert_index=5)
        assert response.status_code == 404

    def test_422_when_resolution_invalid_or_pending(self, monkeypatch, redis_mock):
        row = _analysis_row(alerts=[_pending_alert()])
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        client = _client(_build_app(redis_mock))
        assert self._resolve(client, row["id"], resolution="invalid").status_code == 422
        assert self._resolve(client, row["id"], resolution="pending").status_code == 422

    def test_409_when_analysis_approved(self, monkeypatch, redis_mock):
        row = _analysis_row(status="approved", alerts=[_pending_alert()])
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._resolve(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 409

    def test_403_cross_tenant(self, monkeypatch, redis_mock):
        row = _analysis_row(
            organization_id=OTHER_ORG_ID,
            project_id=OTHER_PROJECT_ID,
            alerts=[_pending_alert()],
        )
        fake = FakeSupabase(store={"title_analyses": [row]})
        _use_fake_supabase(monkeypatch, fake)
        response = self._resolve(_client(_build_app(redis_mock)), row["id"])
        assert response.status_code == 403

    def test_resolving_pending_alert_unblocks_approval(self, monkeypatch, redis_mock):
        """End-to-end: pending alert blocks approve; resolving it unblocks."""
        row = _analysis_row(alerts=[_pending_alert()])
        fake = FakeSupabase(
            store={
                "title_analyses": [row],
                "variable_resolutions": [
                    _variable_row("titulo.estructura", "proposed"),
                ],
            }
        )
        _use_fake_supabase(monkeypatch, fake)
        client = _client(_build_app(redis_mock))

        blocked = client.post(
            f"/api/v1/legal-titles/{row['id']}/approve",
            params={"organization_id": ORG_ID, "project_id": PROJECT_ID},
            json={"approved_by": USER_ID},
        )
        assert blocked.status_code == 409
        assert {item["kind"] for item in blocked.json()["detail"]["blocking"]} == {"alert"}

        assert self._resolve(client, row["id"]).status_code == 200

        approved = client.post(
            f"/api/v1/legal-titles/{row['id']}/approve",
            params={"organization_id": ORG_ID, "project_id": PROJECT_ID},
            json={"approved_by": USER_ID},
        )
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"


# ── T046: Feature-flag rollout and tenant regression ───────────────────


def _agent_settings(*, enabled: bool) -> SimpleNamespace:
    return SimpleNamespace(
        LEGAL_TITLE_AGENT_ENABLED=enabled,
        LEGAL_TITLE_AGENT_PROVIDER="openai",
        LEGAL_TITLE_AGENT_MODEL="gpt-4o",
        LEGAL_TITLE_AGENT_TIMEOUT_SECONDS=300,
        LEGAL_TITLE_AGENT_MAX_INPUT_CHARS=240_000,
        LEGAL_TITLE_AGENT_MAX_ITERATIONS=24,
        LEGAL_TITLE_AGENT_MAX_TOOL_CHARS=60_000,
    )


class TestFeatureFlagRollout:
    async def test_flag_off_persists_llm_disabled_and_never_calls_llm(
        self, monkeypatch, title_documents
    ):
        import agent_titulo.runner as title_agent_runner

        async def _fail_if_called(*_args, **_kwargs):
            raise AssertionError("agent must not run while the flag is off")

        monkeypatch.setattr(
            legal_title_analysis, "get_settings", lambda: _agent_settings(enabled=False)
        )
        monkeypatch.setattr(title_agent_runner, "run_title_agent", _fail_if_called)
        fake = FakeSupabase(seed_documents=title_documents)
        result = await legal_title_analysis.run_title_analysis(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            supabase=fake,
        )
        assert result.status == "llm_disabled"
        assert [row["status"] for row in fake.store["title_analyses"]] == ["llm_disabled"]

    async def test_enabling_flag_reanalyzes_previous_llm_disabled_run(
        self, monkeypatch, title_documents
    ):
        """Rollout: an llm_disabled run must not satisfy idempotency once the
        flag is enabled; the next run supersedes it and produces a proposal."""
        import json as _json

        import agent_titulo.runner as title_agent_runner
        from agent_titulo.runner import TitleAgentRunOutcome
        from schemas.legal_titles import TitleAgentResult, TitleAnalysis

        fake = FakeSupabase(seed_documents=title_documents)
        monkeypatch.setattr(
            legal_title_analysis, "get_settings", lambda: _agent_settings(enabled=False)
        )
        first = await legal_title_analysis.run_title_analysis(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            supabase=fake,
        )
        assert first.status == "llm_disabled"

        # Re-id the golden evidence to this test's document UUIDs so the
        # verifier finds the cited pages (status 'proposed' requires a clean
        # verification since the migration).
        golden_raw = (FIXTURE_DIR / "llm_response_golden.json").read_text(
            encoding="utf-8"
        )
        golden_raw = golden_raw.replace("doc_1996_id", DOC_1996_ID).replace(
            "doc_2023_id", DOC_2023_ID
        )
        golden_analysis = TitleAnalysis.model_validate(_json.loads(golden_raw))

        async def _fake_run_title_agent(*_args, **_kwargs):
            return TitleAgentRunOutcome(
                result=TitleAgentResult(analysis=golden_analysis),
                token_usage={"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
                llm_calls=1,
                available=True,
            )

        async def _noop_staging(*_args, **_kwargs):
            return None

        monkeypatch.setattr(
            legal_title_analysis, "get_settings", lambda: _agent_settings(enabled=True)
        )
        monkeypatch.setattr(title_agent_runner, "run_title_agent", _fake_run_title_agent)
        monkeypatch.setattr(
            legal_title_analysis, "stage_title_analysis_proposals", _noop_staging
        )
        second = await legal_title_analysis.run_title_analysis(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            supabase=fake,
        )
        assert second.status == "proposed"
        assert second.structure_type == "compra_derechos"
        statuses = sorted(row["status"] for row in fake.store["title_analyses"])
        assert statuses == ["proposed", "superseded"]


class TestTenantRegression:
    async def test_gather_excludes_documents_from_other_org_or_project(
        self, title_documents
    ):
        foreign_doc = {
            **_fixture_document("teno_dominio_2023_pages.json", str(uuid4())),
            "organization_id": OTHER_ORG_ID,
            "project_id": OTHER_PROJECT_ID,
        }
        gathered = await legal_title_analysis.gather_title_source_documents(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            supabase=SimpleNamespace(seed_documents=[*title_documents, foreign_doc]),
        )
        assert [doc["id"] for doc in gathered] == [DOC_1996_ID, DOC_2023_ID]

    def test_reanalyze_ignores_processing_run_of_other_org(
        self, monkeypatch, title_documents, redis_mock
    ):
        foreign_processing = _analysis_row(
            organization_id=OTHER_ORG_ID,
            project_id=OTHER_PROJECT_ID,
            status="processing",
            source_content_hash="foreign-hash",
        )
        fake = FakeSupabase(
            seed_documents=title_documents,
            store={"title_analyses": [foreign_processing]},
        )
        _use_fake_supabase(monkeypatch, fake)
        response = _client(_build_app(redis_mock)).post(
            f"/api/v1/legal-titles/project/{PROJECT_ID}/reanalyze",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 202
        assert response.json()["queued"] is True
        # The other tenant's run must remain untouched (not superseded).
        foreign_rows = [
            row
            for row in fake.store["title_analyses"]
            if row["organization_id"] == OTHER_ORG_ID
        ]
        assert [row["status"] for row in foreign_rows] == ["processing"]

    def test_approve_does_not_read_or_mutate_other_org_variables(
        self, monkeypatch, redis_mock
    ):
        row = _analysis_row()
        foreign_blocking = {
            **_variable_row("titulo.estructura", "manual_review"),
            "organization_id": OTHER_ORG_ID,
            "project_id": OTHER_PROJECT_ID,
        }
        foreign_proposed = {
            **_variable_row("titulo.clausula_primero_texto", "proposed"),
            "organization_id": OTHER_ORG_ID,
            "project_id": OTHER_PROJECT_ID,
        }
        own_proposed = _variable_row("titulo.estructura", "proposed")
        fake = FakeSupabase(
            store={
                "title_analyses": [row],
                "variable_resolutions": [
                    foreign_blocking,
                    foreign_proposed,
                    own_proposed,
                ],
            }
        )
        _use_fake_supabase(monkeypatch, fake)
        response = _client(_build_app(redis_mock)).post(
            f"/api/v1/legal-titles/{row['id']}/approve",
            params={"organization_id": ORG_ID, "project_id": PROJECT_ID},
            json={"approved_by": USER_ID},
        )
        # The other org's manual_review variable must not block approval...
        assert response.status_code == 200
        states = {v["id"]: v["state"] for v in fake.store["variable_resolutions"]}
        # ...and approval must only mutate this org's variables.
        assert states[own_proposed["id"]] == "approved"
        assert states[foreign_blocking["id"]] == "manual_review"
        assert states[foreign_proposed["id"]] == "proposed"
