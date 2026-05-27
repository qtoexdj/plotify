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


async def test_process_admin_decision_rejects_tenant_mismatch():
    """The admin decision worker must reject or fail safely if the database indicates a tenant mismatch."""
    from unittest.mock import AsyncMock, MagicMock, patch
    from workers.tasks.approval_processor import process_admin_decision

    rpc_result = MagicMock(data={"success": False, "error": "tenant_mismatch"})

    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = rpc_result

    # Simular que el approval pertenece a otra org (TENANT_MISMATCH)
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"organization_id": "org-other-uuid"}]
    )

    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()

    with (
        patch("workers.tasks.approval_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.approval_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
    ):
        result = await process_admin_decision(
            {}, "org-b-uuid", "approval-a-uuid", "approve", "telegram-admin"
        )

    assert result == "TENANT_MISMATCH"
    assert supabase.rpc.call_count == 0


def _make_approval_detail_supabase(org_id: str):
    from unittest.mock import MagicMock
    approval_data = {
        "id": "approval-1",
        "organization_id": org_id,
        "status": "pending",
    }

    query_mock = MagicMock()
    query_mock.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data=approval_data
    )

    supabase = MagicMock()
    supabase.table.return_value = query_mock
    return supabase


def test_get_approval_rejects_cross_tenant():
    """Un administrador extranjero no puede ver detalles de aprobación de otra organización."""
    from fastapi.testclient import TestClient

    supabase = _make_approval_detail_supabase(org_id="org-real")
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
        response = client.get(
            "/api/v1/approvals/approval-1?organization_id=org-attacker",
        )

    assert response.status_code == 403
    assert "organization_id no corresponde" in response.json()["detail"]


def test_decide_approval_rejects_cross_tenant():
    """Un administrador extranjero no puede decidir/mutar sobre una aprobación de otra organización."""
    from fastapi.testclient import TestClient

    supabase = _make_approval_detail_supabase(org_id="org-real")
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
            "/api/v1/approvals/approval-1/decide",
            json={
                "action": "approve",
                "organization_id": "org-attacker",
                "admin_id": "admin-1",
            },
        )

    assert response.status_code == 403
    assert "organization_id no corresponde" in response.json()["detail"]


def test_decide_reject_approval_rejects_cross_tenant():
    """Un administrador extranjero no puede decidir/rechazar/mutar sobre una aprobación de otra organización."""
    from fastapi.testclient import TestClient

    supabase = _make_approval_detail_supabase(org_id="org-real")
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
            "/api/v1/approvals/approval-1/decide",
            json={
                "action": "reject",
                "organization_id": "org-attacker",
                "admin_id": "admin-1",
            },
        )

    assert response.status_code == 403
    assert "organization_id no corresponde" in response.json()["detail"]



