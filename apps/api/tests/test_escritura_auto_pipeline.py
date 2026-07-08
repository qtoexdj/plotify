"""SDD 017 T008: tests de la cascada de aprobación por excepción.

Feliz (exceptions_only) → completed sin actos humanos; every_sale → se
detiene en awaiting_review tras la revisión jurídica; blockers reales →
exception con causas humanizadas y notificación; reintento idempotente
(sobre un caso completed no duplica nada; sobre uno reanudado continúa desde
donde quedó); warning de proyecto ausente → exception; four-eyes +
exceptions_only → awaiting_review (research D8); abogado redactor faltante
en modo exceptions_only → exception.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from services import escritura_auto_pipeline as pipeline
from services import escritura_case_workflow

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "matriz"

ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_ID = "00000000-0000-4000-8000-000000000003"
CASE_ID = "00000000-0000-4000-8000-000000000004"
WARNING_ACK_USER_ID = "00000000-0000-4000-8000-000000000090"


def _load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def _snapshot_fixture() -> dict[str, Any]:
    return _load_fixture("teno_case_snapshot.json")


def _golden_clauses() -> list[dict[str, Any]]:
    return _load_fixture("golden_template_clauses.json")["clauses"]


# ─── Fake Supabase (mismo patrón genérico de test_matriz_endpoints.py) ───────


class FakeQuery:
    def __init__(self, store: "FakeStore", table_name: str):
        self.store = store
        self.table_name = table_name
        self.action = "select"
        self.payload: Any = None
        self.filters: list[tuple[str, object]] = []
        self.orderings: list[tuple[str, bool]] = []
        self.limit_count: int | None = None
        self.is_single = False

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

    def is_(self, column, value):
        self.filters.append((column, ("__is__", value)))
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
        self.is_single = True
        return self

    def single(self):
        self.is_single = True
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
            elif isinstance(expected, tuple) and expected[0] == "__is__":
                normalized = str(expected[1]).lower()
                if normalized == "null" and actual is not None:
                    return False
                if normalized != "null" and str(actual) != str(expected[1]):
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
                row = {"id": str(uuid.uuid4()), "created_at": "2026-07-08T00:00:00Z", **payload}
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
        if self.is_single:
            return SimpleNamespace(data=rows[0] if rows else None)
        return SimpleNamespace(data=rows)


class FakeStorageBucket:
    def __init__(self, store: "FakeStorage"):
        self.store = store

    def upload(self, path: str, file_bytes: bytes, options: dict[str, Any]):
        self.store.uploads.append({"path": path, "bytes": file_bytes, "options": options})
        return {"path": path}

    def create_signed_url(self, path: str, expires_in: int):
        return {"signedURL": f"https://storage.test/{path}?signed=1"}


class FakeStorage:
    def __init__(self):
        self.uploads: list[dict[str, Any]] = []

    def from_(self, _bucket: str) -> FakeStorageBucket:
        return FakeStorageBucket(self)


class FakeStore:
    def __init__(self):
        self.tables: dict[str, list[dict[str, Any]]] = {}
        self.storage = FakeStorage()

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)


class FakeTelegramClient:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    async def send_text(self, chat_id: str, text: str, reply_markup=None):
        self.sent.append((chat_id, text))
        return {"ok": True}


# ─── Seed helpers ─────────────────────────────────────────────────────────────


def _seed_org(store: FakeStore, *, policy: str = "every_sale") -> None:
    store.tables.setdefault("organizations", []).append(
        {"id": ORG_ID, "escritura_review_policy": policy}
    )


def _seed_project(
    store: FakeStore,
    *,
    warning_acknowledged: bool = True,
) -> None:
    row = {
        "id": PROJECT_ID,
        "organization_id": ORG_ID,
        "name": "Parcelación El Cóndor de Teno",
        "minuta_warning_acknowledged_by": WARNING_ACK_USER_ID if warning_acknowledged else None,
        "minuta_warning_acknowledged_at": (
            "2026-07-01T00:00:00Z" if warning_acknowledged else None
        ),
    }
    store.tables.setdefault("projects", []).append(row)


def _seed_abogado_redactor(store: FakeStore) -> None:
    for key in ("documento.abogado_redactor.nombre", "documento.abogado_redactor.rut"):
        store.tables.setdefault("variable_resolutions", []).append(
            {
                "id": str(uuid.uuid4()),
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "lot_id": None,
                "escritura_case_id": None,
                "variable_key": key,
                "value_text": "dato de prueba",
                "value_json": None,
                "state": "approved",
            }
        )


def _seed_case(
    store: FakeStore,
    *,
    legal_review_pending: bool = True,
    extra_readiness_gates: dict[str, Any] | None = None,
) -> dict[str, Any]:
    snapshot = _snapshot_fixture()
    readiness_gates: dict[str, Any] = {
        "title_verified": {
            "gate": "title_verified",
            "status": "ready",
            "blocking_variables": [],
            "warnings": [],
        }
    }
    if legal_review_pending:
        readiness_gates["legal_review_ready"] = {
            "gate": "legal_review_ready",
            "status": "blocked",
            "blocking_variables": ["revision_juridica.estado"],
            "warnings": [],
        }
    if extra_readiness_gates:
        readiness_gates.update(extra_readiness_gates)
    row = {
        "id": CASE_ID,
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "lot_id": LOT_ID,
        "case_status": snapshot["case_status"],
        "readiness_status": "ready",
        "readiness_gates": readiness_gates,
        "variable_snapshot": snapshot["variable_snapshot"],
        "evidence_snapshot": snapshot["evidence_snapshot"],
    }
    store.tables.setdefault("escritura_cases", []).append(row)
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
    status: str = "draft",
    version: int = 1,
    source_project_matriz_id: str | None = None,
) -> dict[str, Any]:
    order = [clause["clause_key"] for clause in store.tables["escritura_template_clauses"]]
    row = {
        "id": str(uuid.uuid4()),
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "escritura_case_id": case_row["id"],
        "template_id": template["id"],
        "snapshot_case_status": case_row["case_status"],
        "snapshot_hash": escritura_case_workflow._json_hash(case_row["variable_snapshot"]),
        "clause_order": order,
        "clause_overrides": {},
        "status": status,
        "version": version,
        "submitted_by": None,
        "submitted_at": None,
        "approved_by": None,
        "approved_at": None,
        "approval_origin": "human",
        "source_project_matriz_id": source_project_matriz_id,
    }
    store.tables.setdefault("escritura_matrices", []).append(row)
    return row


def _seed_happy_case(
    store: FakeStore, *, policy: str = "exceptions_only", status: str = "draft"
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Caso sin blockers reales, listo para que la cascada avance."""
    _seed_org(store, policy=policy)
    _seed_project(store)
    _seed_abogado_redactor(store)
    case_row = _seed_case(store, legal_review_pending=(status == "draft"))
    template = _seed_template(store)
    matrix = _seed_matrix(store, case_row=case_row, template=template, status=status)
    return case_row, template, matrix


def _patch_telegram(monkeypatch, client: FakeTelegramClient | None):
    async def fake_get_client(_org_id: str):
        return client

    monkeypatch.setattr(
        "integrations.telegram_client.get_telegram_client_for_org", fake_get_client
    )


def _patch_admin_with_telegram(monkeypatch, store: FakeStore, admin_id: str = "admin-1"):
    store.tables.setdefault("organization_members", []).append(
        {"organization_id": ORG_ID, "user_id": admin_id, "role": "admin"}
    )
    store.tables.setdefault("profiles", []).append(
        {"id": admin_id, "telegram_chat_id": "chat-1"}
    )


@pytest.fixture(autouse=True)
def _no_feature_gate(monkeypatch):
    monkeypatch.setattr(
        "api.v1.endpoints.legal_variables.ensure_legal_documents_feature_enabled",
        lambda **_kwargs: None,
    )


# ─── (a) Feliz exceptions_only → completed sin actos humanos ────────────────


class TestHappyPathExceptionsOnly:
    @pytest.mark.asyncio
    async def test_completes_without_any_human_action(self, monkeypatch):
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, FakeTelegramClient())
        case_row, _template, matrix = _seed_happy_case(store, policy="exceptions_only")

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="sale_validated",
            supabase=store,
        )

        assert result.outcome == "completed"
        assert result.generation_id is not None
        assert [s["step"] for s in result.steps] == [
            "submit",
            "legal_review",
            "approve",
            "generate",
        ]
        assert all(s["action"] == "executed" for s in result.steps)

        updated_matrix = store.tables["escritura_matrices"][0]
        assert updated_matrix["status"] == "approved"
        assert updated_matrix["approved_by"] is None
        assert updated_matrix["approval_origin"] == "system"

        decisions = store.tables["legal_review_decisions"]
        approve_decisions = [d for d in decisions if d["decision_type"] == "matriz_approved"]
        assert len(approve_decisions) == 1
        assert approve_decisions[0]["origin"] == "system"
        assert approve_decisions[0]["decided_by"] is None
        assert approve_decisions[0]["trigger"] == "sale_validated"

        generation = store.tables["escritura_minuta_generations"][0]
        assert generation["generated_by"] is None
        assert generation["warning_acknowledged_by"] == WARNING_ACK_USER_ID

        runs = store.tables["escritura_cascade_runs"]
        assert len(runs) == 1
        assert runs[0]["outcome"] == "completed"
        assert runs[0]["escritura_case_id"] == CASE_ID

    @pytest.mark.asyncio
    async def test_ignores_inherited_project_gate_for_sale_scoped_role(self, monkeypatch):
        """La matriz proyecto puede arrastrar un gate viejo que menciona
        variables de lote; esas variables se validan en el caso."""
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, FakeTelegramClient())
        _seed_org(store, policy="exceptions_only")
        _seed_project(store)
        _seed_abogado_redactor(store)
        case_row = _seed_case(
            store,
            legal_review_pending=True,
            extra_readiness_gates={
                "sii_verified": {
                    "gate": "sii_verified",
                    "status": "blocked",
                    "blocking_variables": ["lote.rol_tramite"],
                    "warnings": [],
                }
            },
        )
        template = _seed_template(store)
        _seed_matrix(
            store,
            case_row=case_row,
            template=template,
            status="draft",
            source_project_matriz_id=str(uuid.uuid4()),
        )

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="manual_retry",
            supabase=store,
        )

        assert result.outcome == "completed"


# ─── (b) every_sale → se detiene en awaiting_review ──────────────────────────


class TestEverySalePolicy:
    @pytest.mark.asyncio
    async def test_stops_at_awaiting_review_without_approving(self, monkeypatch):
        store = FakeStore()
        case_row, _template, matrix = _seed_happy_case(store, policy="every_sale")

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="sale_validated",
            supabase=store,
        )

        assert result.outcome == "awaiting_review"
        assert [s["step"] for s in result.steps] == ["submit", "legal_review"]
        assert result.steps[1]["detail"] == "pending_human"

        updated_matrix = store.tables["escritura_matrices"][0]
        assert updated_matrix["status"] == "legal_review_pending"
        assert updated_matrix["submitted_by"] is None
        assert not store.tables.get("escritura_minuta_generations")

    @pytest.mark.asyncio
    async def test_review_approved_trigger_resumes_and_completes(self, monkeypatch):
        """Una vez que un humano aprueba la revisión jurídica (fuera de esta
        cascada, vía submit_legal_review), reintentar con
        trigger='review_approved' retoma desde donde quedó y termina solo."""
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, FakeTelegramClient())
        _seed_org(store, policy="every_sale")
        _seed_project(store)
        _seed_abogado_redactor(store)
        # legal_review_ready ya satisfecho (un humano aprobó la revisión) y
        # el status ya avanzó a legal_review_pending en la corrida anterior.
        case_row = _seed_case(store, legal_review_pending=False)
        template = _seed_template(store)
        _seed_matrix(store, case_row=case_row, template=template, status="legal_review_pending")

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="review_approved",
            supabase=store,
        )

        assert result.outcome == "completed"
        assert [s["step"] for s in result.steps] == ["submit", "legal_review", "approve", "generate"]
        assert result.steps[0]["action"] == "skipped"
        assert result.steps[1]["detail"] == "already_approved"


# ─── (c) Blockers reales → exception con causas + notificación ─────────────


class TestRealBlockersException:
    @pytest.mark.asyncio
    async def test_blocked_gate_produces_exception_and_notifies(self, monkeypatch):
        store = FakeStore()
        telegram = FakeTelegramClient()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, telegram)
        _seed_org(store, policy="exceptions_only")
        _seed_project(store)
        case_row = _seed_case(
            store,
            legal_review_pending=False,
            extra_readiness_gates={
                "title_verified": {
                    "gate": "title_verified",
                    "status": "blocked",
                    "blocking_variables": ["titulo.clausula_primero_texto"],
                    "warnings": [],
                }
            },
        )
        template = _seed_template(store)
        _seed_matrix(store, case_row=case_row, template=template, status="draft")

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="sale_validated",
            supabase=store,
        )

        assert result.outcome == "exception"
        assert result.steps == []
        assert len(result.causes) == 1
        assert result.causes[0]["kind"] == "readiness_gate"
        assert result.causes[0]["gate"] == "title_verified"
        assert not store.tables.get("escritura_minuta_generations")

        # No se tocó el status de la matriz (nunca se llegó a someterla).
        assert store.tables["escritura_matrices"][0]["status"] == "draft"

        runs = store.tables["escritura_cascade_runs"]
        assert runs[0]["outcome"] == "exception"
        assert len(telegram.sent) == 1
        assert "chat-1" in telegram.sent[0]

    @pytest.mark.asyncio
    async def test_notification_failure_never_raises(self, monkeypatch):
        """Best-effort (D7): si Telegram no está configurado, la corrida
        igual queda registrada como exception, sin lanzar."""
        store = FakeStore()
        _patch_telegram(monkeypatch, None)
        _seed_org(store, policy="exceptions_only")
        _seed_project(store)
        case_row = _seed_case(
            store,
            legal_review_pending=False,
            extra_readiness_gates={
                "title_verified": {
                    "gate": "title_verified",
                    "status": "blocked",
                    "blocking_variables": ["titulo.clausula_primero_texto"],
                    "warnings": [],
                }
            },
        )
        template = _seed_template(store)
        _seed_matrix(store, case_row=case_row, template=template, status="draft")

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="sale_validated",
            supabase=store,
        )

        assert result.outcome == "exception"


# ─── (d)/(e) Idempotencia y reanudación ──────────────────────────────────────


class TestIdempotencyAndResume:
    @pytest.mark.asyncio
    async def test_retry_over_completed_case_has_no_effect(self, monkeypatch):
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, FakeTelegramClient())
        _seed_org(store, policy="exceptions_only")
        _seed_project(store)
        _seed_abogado_redactor(store)
        case_row = _seed_case(store, legal_review_pending=False)
        template = _seed_template(store)
        matrix = _seed_matrix(
            store, case_row=case_row, template=template, status="approved"
        )
        # Generación ya existente para este snapshot exacto.
        store.tables.setdefault("escritura_minuta_generations", []).append(
            {
                "id": str(uuid.uuid4()),
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "escritura_case_id": CASE_ID,
                "matriz_id": matrix["id"],
                "matriz_version": matrix["version"],
                "snapshot_hash": matrix["snapshot_hash"],
                "storage_path": "org/escritura-minutas/case/prev.docx",
                "generated_at": "2026-07-08T00:00:00Z",
            }
        )

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="manual_retry",
            supabase=store,
        )

        assert result.outcome == "completed"
        assert [s["action"] for s in result.steps] == ["skipped", "skipped", "skipped", "skipped"]
        assert len(store.tables["escritura_minuta_generations"]) == 1
        assert store.storage.uploads == []

    @pytest.mark.asyncio
    async def test_retry_over_completed_case_ignores_current_every_sale_policy(
        self, monkeypatch
    ):
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, FakeTelegramClient())
        _seed_org(store, policy="every_sale")
        _seed_project(store)
        _seed_abogado_redactor(store)
        case_row = _seed_case(store, legal_review_pending=True)
        template = _seed_template(store)
        matrix = _seed_matrix(
            store, case_row=case_row, template=template, status="approved"
        )
        generation_id = str(uuid.uuid4())
        store.tables.setdefault("escritura_minuta_generations", []).append(
            {
                "id": generation_id,
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "escritura_case_id": CASE_ID,
                "matriz_id": matrix["id"],
                "matriz_version": matrix["version"],
                "snapshot_hash": matrix["snapshot_hash"],
                "storage_path": "org/escritura-minutas/case/prev.docx",
                "generated_at": "2026-07-08T00:00:00Z",
            }
        )

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="manual_retry",
            supabase=store,
        )

        assert result.outcome == "completed"
        assert result.generation_id == generation_id
        assert result.steps[-1] == {
            "step": "generate",
            "action": "skipped",
            "detail": "already_generated",
        }
        assert len(store.tables["escritura_minuta_generations"]) == 1

    @pytest.mark.asyncio
    async def test_data_corrected_after_delivery_never_regenerates(self, monkeypatch):
        """FR-011: caso con minuta entregada + datos corregidos después →
        la cascada corta con CaseOutdatedError sin registrar corrida (la mesa
        sigue mostrando "entregada"), sin regenerar y sin notificar."""
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        telegram = FakeTelegramClient()
        _patch_telegram(monkeypatch, telegram)
        _seed_org(store, policy="exceptions_only")
        _seed_project(store)
        _seed_abogado_redactor(store)
        case_row = _seed_case(store, legal_review_pending=False)
        template = _seed_template(store)
        matrix = _seed_matrix(
            store, case_row=case_row, template=template, status="approved"
        )
        # La minuta se generó con los datos ANTERIORES del caso: su hash ya no
        # calza con el snapshot vigente.
        stale_hash = "hash-de-datos-anteriores"
        matrix["snapshot_hash"] = stale_hash
        store.tables.setdefault("escritura_minuta_generations", []).append(
            {
                "id": str(uuid.uuid4()),
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "escritura_case_id": CASE_ID,
                "matriz_id": matrix["id"],
                "matriz_version": matrix["version"],
                "snapshot_hash": stale_hash,
                "storage_path": "org/escritura-minutas/case/prev.docx",
                "generated_at": "2026-07-08T00:00:00Z",
            }
        )

        with pytest.raises(pipeline.CaseOutdatedError):
            await pipeline.run_case_cascade(
                organization_id=ORG_ID,
                escritura_case_id=CASE_ID,
                trigger="manual_retry",
                supabase=store,
            )

        assert len(store.tables["escritura_minuta_generations"]) == 1
        assert not store.tables.get("escritura_cascade_runs")
        assert store.storage.uploads == []
        assert telegram.sent == []

    @pytest.mark.asyncio
    async def test_policy_change_applies_to_in_course_case_on_retry(self, monkeypatch):
        """FR-003 (enmendado en la revisión SDD017): la cascada lee la
        política VIGENTE en cada corrida — un caso awaiting_review creado bajo
        every_sale completa solo al reintentar tras cambiar la organización a
        exceptions_only. Las corridas ya terminadas no cambian."""
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, FakeTelegramClient())
        _seed_org(store, policy="every_sale")
        _seed_project(store)
        _seed_abogado_redactor(store)
        case_row = _seed_case(store, legal_review_pending=True)
        template = _seed_template(store)
        _seed_matrix(store, case_row=case_row, template=template, status="draft")

        first = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="sale_validated",
            supabase=store,
        )
        assert first.outcome == "awaiting_review"

        store.tables["organizations"][0]["escritura_review_policy"] = "exceptions_only"

        second = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="manual_retry",
            supabase=store,
        )
        assert second.outcome == "completed"
        assert len(store.tables["escritura_minuta_generations"]) == 1


# ─── (f) Warning legal del proyecto ausente ──────────────────────────────────


class TestProjectWarningMissing:
    @pytest.mark.asyncio
    async def test_missing_warning_ack_blocks_generation_after_approval(self, monkeypatch):
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, FakeTelegramClient())
        _seed_org(store, policy="exceptions_only")
        _seed_project(store, warning_acknowledged=False)
        _seed_abogado_redactor(store)
        case_row = _seed_case(store, legal_review_pending=True)
        template = _seed_template(store)
        _seed_matrix(store, case_row=case_row, template=template, status="draft")

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="sale_validated",
            supabase=store,
        )

        assert result.outcome == "exception"
        assert result.causes[0]["kind"] == "project_warning_missing"
        # Llegó hasta aprobar la matriz antes de toparse con el aviso legal.
        assert [s["step"] for s in result.steps] == ["submit", "legal_review", "approve"]
        assert store.tables["escritura_matrices"][0]["status"] == "approved"
        assert not store.tables.get("escritura_minuta_generations")


# ─── Four-eyes + exceptions_only (research D8) ──────────────────────────────


class TestFourEyesInteraction:
    @pytest.mark.asyncio
    async def test_four_eyes_forces_awaiting_review_even_in_exceptions_only(self, monkeypatch):
        monkeypatch.setattr(
            "core.config.get_settings",
            lambda: SimpleNamespace(LEGAL_REVIEW_REQUIRE_DISTINCT_REVIEWER=True),
        )
        store = FakeStore()
        case_row, _template, matrix = _seed_happy_case(store, policy="exceptions_only")

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="sale_validated",
            supabase=store,
        )

        assert result.outcome == "awaiting_review"
        assert store.tables["escritura_matrices"][0]["status"] == "legal_review_pending"


# ─── Abogado redactor faltante bloquea la auto-aprobación de revisión ───────


class TestMissingAbogadoRedactor:
    @pytest.mark.asyncio
    async def test_missing_abogado_redactor_is_exception_not_silent_skip(self, monkeypatch):
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, FakeTelegramClient())
        _seed_org(store, policy="exceptions_only")
        _seed_project(store)
        # Sin _seed_abogado_redactor(): las claves quedan "missing".
        case_row = _seed_case(store, legal_review_pending=True)
        template = _seed_template(store)
        _seed_matrix(store, case_row=case_row, template=template, status="draft")

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="sale_validated",
            supabase=store,
        )

        assert result.outcome == "exception"
        keys = {cause["key"] for cause in result.causes}
        assert keys == {
            "documento.abogado_redactor.nombre",
            "documento.abogado_redactor.rut",
        }
        assert store.tables["escritura_matrices"][0]["status"] == "legal_review_pending"


# ─── Rechazo de la revisión jurídica (FR-004) ────────────────────────────────


class TestLegalReviewRejected:
    @pytest.mark.asyncio
    async def test_rejected_review_is_exception_not_awaiting_review(self, monkeypatch):
        """SDD 017: 'rechazada' tiene tanto valor como 'aprobada' para el
        chequeo genérico de blockers — sin el caso especial en el gate
        (escritura_readiness._evaluate_variable_gate), un rechazo se veía
        como 'ready' y la cascada habría avanzado a aprobar igual. Un
        rechazo es una decisión humana negativa: nunca awaiting_review
        (reintentar solo no cambia nada), siempre exception con el motivo."""
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, FakeTelegramClient())
        _seed_org(store, policy="every_sale")
        _seed_project(store)
        case_row = _seed_case(store, legal_review_pending=True)
        case_row["variable_snapshot"]["revision_juridica.estado"]["value_text"] = "rechazada"
        store.tables.setdefault("legal_review_decisions", []).append(
            {
                "id": str(uuid.uuid4()),
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "escritura_case_id": CASE_ID,
                "decision_type": "reject_case",
                "decision_status": "rejected",
                "reason": "Falta corregir la cláusula de servidumbre.",
                "decided_by": "abogado-1",
                "decided_at": "2026-07-08T00:00:00Z",
            }
        )
        template = _seed_template(store)
        _seed_matrix(
            store, case_row=case_row, template=template, status="legal_review_pending"
        )

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="review_approved",
            supabase=store,
        )

        assert result.outcome == "exception"
        assert result.causes[0]["kind"] == "legal_review_rejected"
        assert "servidumbre" in result.causes[0]["description"]
        assert result.steps[0] == {
            "step": "submit",
            "action": "skipped",
            "detail": "legal_review_pending",
        }
        assert result.steps[1]["detail"] == "rejected"
        # La matriz sigue en legal_review_pending: el rechazo no la toca.
        assert store.tables["escritura_matrices"][0]["status"] == "legal_review_pending"
        assert not store.tables.get("escritura_minuta_generations")

    @pytest.mark.asyncio
    async def test_rejected_review_is_exception_even_in_exceptions_only(self, monkeypatch):
        """El rechazo bloquea la cascada sin importar la política — no es un
        checkpoint que 'exceptions_only' pueda saltarse, es una decisión ya
        tomada por un humano."""
        store = FakeStore()
        _patch_admin_with_telegram(monkeypatch, store)
        _patch_telegram(monkeypatch, FakeTelegramClient())
        _seed_org(store, policy="exceptions_only")
        _seed_project(store)
        _seed_abogado_redactor(store)
        case_row = _seed_case(store, legal_review_pending=True)
        case_row["variable_snapshot"]["revision_juridica.estado"]["value_text"] = "rechazada"
        template = _seed_template(store)
        _seed_matrix(
            store, case_row=case_row, template=template, status="legal_review_pending"
        )

        result = await pipeline.run_case_cascade(
            organization_id=ORG_ID,
            escritura_case_id=CASE_ID,
            trigger="manual_retry",
            supabase=store,
        )

        assert result.outcome == "exception"
        assert result.causes[0]["kind"] == "legal_review_rejected"
