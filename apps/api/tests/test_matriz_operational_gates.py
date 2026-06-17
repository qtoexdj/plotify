"""SDD 008 T016: bridge integration — gates with Teno data + endpoint.

Verifies that the operational bridge output drives the SDD 007 readiness
gates (`party_verified`, `price_verified`, `geometry_verified`) with the
Teno fixture (SC-009), that case creation invokes the bridge before
snapshotting, and the `POST /escritura-cases/{id}/stage-operational`
contract.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services import escritura_operational_bridge as bridge
from services import escritura_readiness
from services.legal_variable_resolution import LegalVariableResolutionService

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "matriz"

ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_ID = "00000000-0000-4000-8000-000000000003"
CASE_ID = "00000000-0000-4000-8000-000000000004"
OTHER_ORG_ID = "00000000-0000-4000-8000-000000000099"


def _rows() -> dict:
    return json.loads(
        (FIXTURE_DIR / "teno_operational_rows.json").read_text(encoding="utf-8")
    )


def _staged_variable_rows(rows: dict, *, state_override: str | None = None) -> list[dict]:
    """Simulate the variable_resolutions rows the bridge stages for Teno."""
    service = LegalVariableResolutionService()
    mapped = bridge.map_operational_variables(
        lot=rows["lot"],
        lot_record=rows["lot_record"],
        payment_info=rows["organization_payment_info"],
    )
    staged = []
    for variable in mapped:
        classified = service.propose_variable(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            variable_key=variable.variable_key,
            value_text=variable.value_text,
            value_json=variable.value_json,
            source_type=variable.source_type,
            source_ref=variable.source_ref(),
            lot_id=LOT_ID,
            extractor_name=bridge.OPERATIONAL_BRIDGE_EXTRACTOR_NAME,
        )
        staged.append(
            {
                "id": f"var-{variable.variable_key}",
                "variable_key": variable.variable_key,
                "state": state_override or classified.classification,
                "value_text": variable.value_text,
                "value_json": variable.value_json,
                "source_type": variable.source_type,
                "source_ref": variable.source_ref(),
                "approval_required": True,
            }
        )
    return staged


def _gates_by_name(variables: list[dict]) -> dict[str, escritura_readiness.ReadinessGate]:
    readiness = escritura_readiness.calculate_escritura_readiness(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        lot_id=LOT_ID,
        variables=variables,
    )
    return {gate.gate: gate for gate in readiness.gates}


VENDEDOR_ROWS = [
    {
        "id": "var-vendedor-nombre",
        "variable_key": "vendedor.nombre",
        "state": "approved",
        "value_text": "JUAN DE DIOS GALAZ ABARCA",
        "value_json": None,
        "approval_required": True,
    },
    {
        "id": "var-vendedor-rut",
        "variable_key": "vendedor.rut",
        "state": "approved",
        "value_text": "4.606.955-2",
        "value_json": None,
        "approval_required": True,
    },
]


class TestOperationalGates:
    def test_staged_teno_proposals_unblock_party_price_geometry(self):
        variables = _staged_variable_rows(_rows()) + VENDEDOR_ROWS
        gates = _gates_by_name(variables)
        # SC-009: con propuestas staged los gates llegan a estado revisable
        # (needs_review por proposed), nunca blocked por falta de productor.
        assert gates["party_verified"].status == "needs_review"
        assert gates["price_verified"].status == "needs_review"
        assert gates["geometry_verified"].status == "needs_review"

    def test_approved_staged_values_turn_gates_ready(self):
        variables = _staged_variable_rows(_rows(), state_override="approved")
        variables += VENDEDOR_ROWS
        gates = _gates_by_name(variables)
        assert gates["party_verified"].status == "ready"
        assert gates["price_verified"].status == "ready"
        assert gates["geometry_verified"].status == "ready"

    def test_incomplete_sale_record_blocks_party_gate_with_cause(self):
        rows = _rows()
        rows["lot_record"] = rows["lot_record_incomplete"]
        # El RUT sí viene en la variante incompleta; quitamos el nombre para
        # bloquear el gate por dato del comprador.
        rows["lot_record"]["cliente_nombre"] = None
        variables = _staged_variable_rows(rows) + VENDEDOR_ROWS
        gates = _gates_by_name(variables)
        assert gates["party_verified"].status == "blocked"
        assert "comprador.nombre" in gates["party_verified"].blocking_variables

    def test_no_geometry_blocks_geometry_gate(self):
        rows = _rows()
        rows["lot"]["boundaries_official"] = []
        rows["lot"]["area_official_m2"] = None
        rows["lot"]["superficie_neta_m2"] = None
        variables = _staged_variable_rows(rows) + VENDEDOR_ROWS
        gates = _gates_by_name(variables)
        assert gates["geometry_verified"].status == "blocked"
        blocking = set(gates["geometry_verified"].blocking_variables)
        assert {"lote.superficie_m2", "lote.deslindes"} <= blocking


class TestCaseCreationInvokesBridge:
    @pytest.mark.asyncio
    async def test_snapshot_creation_stages_operational_first(self, monkeypatch):
        call_order: list[str] = []

        async def fake_stage(**kwargs):
            call_order.append("bridge")
            assert kwargs["organization_id"] == ORG_ID
            assert kwargs["project_id"] == PROJECT_ID
            assert kwargs["lot_id"] == LOT_ID
            return bridge.StageOperationalOutcome()

        async def fake_readiness(**_kwargs):
            call_order.append("readiness")
            return escritura_readiness.EscrituraReadiness(
                organization_id=ORG_ID,
                project_id=PROJECT_ID,
                lot_id=LOT_ID,
                readiness_status="ready",
                gates=(),
            )

        monkeypatch.setattr(bridge, "stage_operational_variables", fake_stage)
        monkeypatch.setattr(
            escritura_readiness, "get_escritura_readiness", fake_readiness
        )

        class FakeCaseTable:
            def __init__(self, store):
                self.store = store

            def select(self, *_a):
                return self

            def eq(self, *_a):
                return self

            def neq(self, *_a):
                return self

            def maybe_single(self):
                return self

            def insert(self, payload):
                self.store.append(payload)
                return self

            def update(self, payload):
                self.store.append(payload)
                return self

            def execute(self):
                data = self.store[-1] if self.store else None
                return SimpleNamespace(data=[data] if data else None)

        inserted: list[dict] = []

        class FakeClient:
            def table(self, name):
                assert name == "escritura_cases"
                return FakeCaseTable(inserted)

        await escritura_readiness.create_escritura_case_snapshot(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            supabase=FakeClient(),
        )
        assert call_order == ["bridge", "readiness"]

    @pytest.mark.asyncio
    async def test_stage_operational_flag_false_skips_bridge(self, monkeypatch):
        stage_mock = AsyncMock()
        monkeypatch.setattr(bridge, "stage_operational_variables", stage_mock)

        async def fake_readiness(**_kwargs):
            return escritura_readiness.EscrituraReadiness(
                organization_id=ORG_ID,
                project_id=PROJECT_ID,
                lot_id=LOT_ID,
                readiness_status="ready",
                gates=(),
            )

        monkeypatch.setattr(
            escritura_readiness, "get_escritura_readiness", fake_readiness
        )

        class FakeClient:
            def table(self, name):
                table = SimpleNamespace()

                def chain(*_a, **_k):
                    return table

                for method in (
                    "select",
                    "eq",
                    "neq",
                    "maybe_single",
                    "insert",
                    "update",
                ):
                    setattr(table, method, chain)
                table.execute = lambda: SimpleNamespace(data=None)
                return table

        await escritura_readiness.create_escritura_case_snapshot(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            stage_operational=False,
            supabase=FakeClient(),
        )
        stage_mock.assert_not_awaited()


# ─── Endpoint POST /escritura-cases/{id}/stage-operational ──────────────────


def _build_app():
    from fastapi import FastAPI

    from api.deps import verify_internal_secret
    from api.v1.endpoints.escritura_matrices import router

    app = FastAPI()
    app.dependency_overrides[verify_internal_secret] = lambda: None
    app.include_router(router, prefix="/api/v1")
    return app


def _client(app):
    from fastapi.testclient import TestClient

    return TestClient(app, headers={"X-Internal-Secret": "test-secret"})


class FakeCaseLookupClient:
    def __init__(self, case_row):
        self.case_row = case_row
        self.filters = []

    def table(self, name):
        assert name == "escritura_cases"
        return self

    def select(self, *_a):
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def maybe_single(self):
        return self

    def execute(self):
        for column, value in self.filters:
            if self.case_row is None or str(self.case_row.get(column)) != str(value):
                return SimpleNamespace(data=None)
        return SimpleNamespace(data=self.case_row)


class TestStageOperationalEndpoint:
    def _case_row(self):
        return {
            "id": CASE_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "lot_id": LOT_ID,
        }

    def test_endpoint_runs_bridge_and_refreshes_snapshot(self, monkeypatch):
        outcome = bridge.StageOperationalOutcome(
            proposed=("comprador.nombre",),
            skipped_same_hash=("lote.deslindes",),
            superseded=("transaccion.precio_numeros",),
            missing=("comprador.estado_civil",),
            protected=("comprador.rut",),
        )
        stage_mock = AsyncMock(return_value=outcome)
        snapshot_mock = AsyncMock(return_value={})
        monkeypatch.setattr(bridge, "stage_operational_variables", stage_mock)
        monkeypatch.setattr(
            escritura_readiness, "create_escritura_case_snapshot", snapshot_mock
        )
        monkeypatch.setattr(
            "core.database.get_supabase_client",
            lambda: FakeCaseLookupClient(self._case_row()),
        )
        monkeypatch.setattr(
            "api.v1.endpoints.legal_variables.ensure_legal_documents_feature_enabled",
            lambda **_kwargs: None,
        )

        response = _client(_build_app()).post(
            f"/api/v1/escritura-cases/{CASE_ID}/stage-operational",
            params={"organization_id": ORG_ID},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["proposed"] == ["comprador.nombre"]
        assert body["superseded"] == ["transaccion.precio_numeros"]
        assert body["missing"] == ["comprador.estado_civil"]
        assert body["protected"] == ["comprador.rut"]
        stage_mock.assert_awaited_once()
        # El snapshot del caso se refresca sin re-correr el puente.
        snapshot_mock.assert_awaited_once()
        assert snapshot_mock.await_args.kwargs["stage_operational"] is False

    def test_endpoint_404_for_other_org_case(self, monkeypatch):
        stage_mock = AsyncMock()
        monkeypatch.setattr(bridge, "stage_operational_variables", stage_mock)
        monkeypatch.setattr(
            "core.database.get_supabase_client",
            lambda: FakeCaseLookupClient(self._case_row()),
        )

        response = _client(_build_app()).post(
            f"/api/v1/escritura-cases/{CASE_ID}/stage-operational",
            params={"organization_id": OTHER_ORG_ID},
        )
        assert response.status_code == 404
        stage_mock.assert_not_awaited()
