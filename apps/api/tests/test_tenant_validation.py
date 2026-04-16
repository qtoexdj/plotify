"""Regression tests for service-role tenant validation."""

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


def _make_approval_supabase(lot_org_id: str):
    lot_result = MagicMock()
    lot_result.data = [
        {
            "id": "lot-1",
            "estado": "disponible",
            "numero_lote": "42",
            "project_id": "project-1",
            "precio": 10_000_000,
            "valor_reserva": 500_000,
            "projects": {"organization_id": lot_org_id},
        }
    ]

    lots_query = MagicMock()
    lots_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = lot_result
    lots_query.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data=lot_result.data[0]
    )

    supabase = MagicMock()
    supabase.table.return_value = lots_query
    return supabase


def test_request_reservation_rejects_cross_tenant_organization_id():
    from fastapi.testclient import TestClient

    supabase = _make_approval_supabase(lot_org_id="org-real")
    client = TestClient(
        _build_approvals_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with (
        patch("api.v1.endpoints.approvals.get_supabase_client", return_value=supabase),
        patch(
            "asyncio.to_thread",
            new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
        ),
    ):
        response = client.post(
            "/api/v1/approvals/request-reservation",
            json={
                "lot_id": "lot-1",
                "organization_id": "org-attacker",
                "vendor_id": "vendor-1",
                "vendor_name": "Vendedor",
                "vendor_phone": "+56912345678",
                "vendor_platform": "telegram",
                "payload": {
                    "cliente_nombre": "Cliente Demo",
                    "cliente_run": "12.345.678-9",
                    "valor_reserva": 500000,
                },
            },
        )

    assert response.status_code == 403
