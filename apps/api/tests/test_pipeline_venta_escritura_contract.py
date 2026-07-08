"""SDD16 tests de contrato del camino venta→escritura.

T007: el payload de venta con cliente_nacionalidad/cliente_region/
cliente_comuna llega íntegro a approval_requests.payload (Pydantic no
descarta los campos nuevos).

T012: tras la aprobación (lot_records con los 3 campos, simulando el RPC
approve_sale/approve_reservation ya corrido — T002), correr
stage_operational_variables produce una fila comprador.nacionalidad con
valor en variable_resolutions.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _build_approvals_app():
    from fastapi import FastAPI

    from api.deps import verify_internal_secret
    from api.v1.endpoints.approvals import router as approvals_router
    from core.redis import get_arq_pool

    app = FastAPI()

    async def _bypass_auth():
        return "test-secret"

    async def _fake_arq_pool():
        redis = AsyncMock()
        redis.enqueue_job = AsyncMock()
        return redis

    app.dependency_overrides[verify_internal_secret] = _bypass_auth
    app.dependency_overrides[get_arq_pool] = _fake_arq_pool
    app.include_router(approvals_router, prefix="/api/v1/approvals")
    return app


def _make_mock_supabase(lot_state="reservado", lot_org_id="org-a-uuid"):
    lot_data = {
        "id": "lot-a-uuid",
        "estado": lot_state,
        "numero_lote": "42",
        "project_id": "project-a-uuid",
        "precio": 10_000_000,
        "projects": {"organization_id": lot_org_id},
    }

    lots_query = MagicMock()
    lots_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[lot_data]
    )
    lots_query.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data=lot_data
    )

    insert_result = MagicMock(data=[{"id": "new-approval-uuid"}])
    approval_query = MagicMock()
    approval_query.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[]
    )
    approval_query.insert.return_value.execute.return_value = insert_result

    profiles_query = MagicMock()
    profiles_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[]
    )

    def get_table_mock(table_name):
        if table_name == "lots":
            return lots_query
        elif table_name == "approval_requests":
            return approval_query
        elif table_name == "profiles":
            return profiles_query
        return MagicMock()

    supabase = MagicMock()
    supabase.table.side_effect = get_table_mock
    return supabase, approval_query


async def test_request_sale_payload_keeps_comprador_fields():
    """cliente_nacionalidad/cliente_region/cliente_comuna llegan a
    approval_requests.payload sin ser descartados por Pydantic (FR-003)."""
    from fastapi.testclient import TestClient

    supabase, approval_query = _make_mock_supabase(lot_state="reservado")
    client = TestClient(
        _build_approvals_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with (
        patch("api.v1.endpoints.approvals.get_supabase_client", return_value=supabase),
        patch("core.database.get_supabase_client", return_value=supabase),
        patch(
            "asyncio.to_thread",
            new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
        ),
    ):
        response = client.post(
            "/api/v1/approvals/request-sale",
            json={
                "lot_id": "lot-a-uuid",
                "organization_id": "org-a-uuid",
                "vendor_id": "vendor-a-uuid",
                "vendor_name": "Vendedor",
                "vendor_phone": "+56912345678",
                "vendor_platform": "telegram",
                "payload": {
                    "cliente_nombre": "Cliente Demo",
                    "cliente_run": "12.345.678-9",
                    "valor_final": 12_000_000,
                    "cliente_nacionalidad": "chilena",
                    "cliente_region": "Maule",
                    "cliente_comuna": "Teno",
                    "notaria": "Notaría de Teno",
                    "fecha_firma": "2026-07-15",
                },
            },
        )

    assert response.status_code == 202

    approval_query.insert.assert_called_once()
    inserted_request = approval_query.insert.call_args.args[0]
    payload = inserted_request["payload"]
    assert payload["cliente_nacionalidad"] == "chilena"
    assert payload["cliente_region"] == "Maule"
    assert payload["cliente_comuna"] == "Teno"
    assert payload["notaria"] == "Notaría de Teno"
    assert payload["fecha_firma"] == "2026-07-15"


# ─── T012: aprobar venta -> lot_records -> stage -> variable_resolutions ─────

ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_ID = "00000000-0000-4000-8000-000000000003"

# Simula lot_records tras approve_sale (T002): los 3 campos nuevos ya
# persistidos, como si el RPC hubiese corrido.
APPROVED_LOT_RECORD = {
    "id": "00000000-0000-4000-8000-000000000005",
    "lot_id": LOT_ID,
    "cliente_nombre": "Cliente Demo",
    "cliente_run": "12.345.678-9",
    "cliente_direccion": "Calle Falsa 123",
    "cliente_estado_civil": "soltero",
    "cliente_ocupacion": "ingeniero",
    "cliente_nacionalidad": "chilena",
    "valor": 12_000_000,
    "abono": None,
    "saldo": None,
    "firma_lugar": "Notaría de Teno",
    "firma_fecha": "2026-07-15",
}

APPROVED_LOT = {
    "id": LOT_ID,
    "project_id": PROJECT_ID,
    "numero_lote": "3",
    "estado": "vendido",
    "m2": 5000,
    "area_official_m2": 5000,
    "superficie_neta_m2": 4800,
    "boundaries_official": [],
    "servidumbre_m2": None,
    "servidumbre_ancho_m": None,
}


class _FakeTable:
    def __init__(self, supabase, name):
        self.supabase = supabase
        self.name = name
        self.operation = "select"
        self.payload = None

    def select(self, *_a):
        self.operation = "select"
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def eq(self, *_a):
        return self

    def neq(self, *_a):
        return self

    def is_(self, *_a):
        return self

    def in_(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return self.supabase.execute(self)


class _FakeSupabase:
    """Fake mínimo para stage_operational_variables: lots/lot_records/
    organization_payment_info/variable_resolutions."""

    def __init__(self):
        self.inserted: list[dict] = []

    def table(self, name):
        return _FakeTable(self, name)

    def execute(self, table: _FakeTable):
        if table.name == "lots":
            return MagicMock(data=APPROVED_LOT)
        if table.name == "lot_records":
            return MagicMock(data=[APPROVED_LOT_RECORD])
        if table.name == "organization_payment_info":
            # 0 filas: real supabase-py devuelve None, no un objeto con
            # .data = None (FR-001/T006).
            return None
        if table.name == "variable_resolutions":
            if table.operation == "select":
                return MagicMock(data=[])
            if table.operation == "update":
                return MagicMock(data=[])
            if table.operation == "insert":
                self.inserted.extend(table.payload)
                return MagicMock(
                    data=[
                        {**row, "id": f"var-{index}"}
                        for index, row in enumerate(table.payload)
                    ]
                )
        raise AssertionError(f"unexpected table {table.name}")


@pytest.mark.asyncio
async def test_approved_sale_stages_comprador_nacionalidad_variable():
    from services.escritura_operational_bridge import stage_operational_variables

    supabase = _FakeSupabase()

    with patch(
        "asyncio.to_thread",
        new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
    ):
        outcome = await stage_operational_variables(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            supabase=supabase,
        )

    assert "comprador.nacionalidad" in outcome.proposed
    staged = {row["variable_key"]: row for row in supabase.inserted}
    assert staged["comprador.nacionalidad"]["value_text"] == "chilena"
