"""SDD16 tests de contrato del camino venta→escritura.

T007: el payload de venta con cliente_nacionalidad/cliente_region/
cliente_comuna llega íntegro a approval_requests.payload (Pydantic no
descarta los campos nuevos).
"""

from unittest.mock import AsyncMock, MagicMock, patch


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
