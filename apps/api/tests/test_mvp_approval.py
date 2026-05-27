"""MVP foundation fixtures for approval race behavior and reservation requests."""

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


def _make_mock_supabase(lot_state="disponible", has_pending=False, lot_org_id="org-a-uuid"):
    # Mock para lots
    lot_data = {
        "id": "lot-a-uuid",
        "estado": lot_state,
        "numero_lote": "42",
        "project_id": "project-a-uuid",
        "precio": 10_000_000,
        "valor_reserva": 500_000,
        "projects": {"organization_id": lot_org_id},
    }

    lots_query = MagicMock()
    lots_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[lot_data]
    )
    lots_query.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data=lot_data
    )

    # Mock para approval_requests
    pending_query_result = MagicMock(data=[{"id": "existing-pending-approval-uuid"}] if has_pending else [])
    insert_result = MagicMock(data=[{"id": "new-approval-uuid"}])

    approval_query = MagicMock()
    approval_query.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = pending_query_result
    approval_query.insert.return_value.execute.return_value = insert_result

    # Mock para profiles
    profiles_query = MagicMock()
    profiles_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])

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
    return supabase


async def test_request_reservation_available_lot_succeeds():
    """A request for a lot in available state with no prior pending approvals succeeds."""
    from fastapi.testclient import TestClient

    supabase = _make_mock_supabase(lot_state="disponible", has_pending=False)
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
            "/api/v1/approvals/request-reservation",
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
                    "valor_reserva": 500000,
                },
            },
        )

    assert response.status_code == 202
    assert response.json() == {
        "approval_id": "new-approval-uuid",
        "status": "pending",
        "message": "Solicitud enviada al administrador.",
    }


async def test_request_reservation_unavailable_lot_fails():
    """A request for a lot that is already reserved or sold fails with 409 conflict."""
    from fastapi.testclient import TestClient

    supabase = _make_mock_supabase(lot_state="reservado", has_pending=False)
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
            "/api/v1/approvals/request-reservation",
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
                    "valor_reserva": 500000,
                },
            },
        )

    assert response.status_code == 409
    assert "El lote no está disponible" in response.json()["detail"]


async def test_request_reservation_duplicate_pending_request_fails():
    """A request for a lot that already has a pending reservation request fails with 409 conflict."""
    from fastapi.testclient import TestClient

    supabase = _make_mock_supabase(lot_state="disponible", has_pending=True)
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
            "/api/v1/approvals/request-reservation",
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
                    "valor_reserva": 500000,
                },
            },
        )

    assert response.status_code == 409
    assert "Ya existe una solicitud de reserva pendiente" in response.json()["detail"]


async def test_admin_decision_second_channel_gets_already_processed_result():
    """Telegram and web-like decisions over the same approval must not both mutate."""
    from workers.tasks.approval_processor import process_admin_decision

    first_rpc = MagicMock(
        data={
            "success": True,
            "vendor_phone": None,
            "vendor_platform": "telegram",
            "vendor_name": "Vendedor",
            "lot_id": None,
        }
    )
    second_rpc = MagicMock(data={"success": False, "error": "already_processed"})

    supabase = MagicMock()
    supabase.rpc.return_value.execute.side_effect = [first_rpc, second_rpc]
    
    # Mock para la validación de tenant del approval_id
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"organization_id": "org-a-uuid"}]
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
        telegram_result = await process_admin_decision(
            {}, "org-a-uuid", "approval-1", "approve", "telegram-admin"
        )
        web_result = await process_admin_decision(
            {}, "org-a-uuid", "approval-1", "approve", "web-admin"
        )

    assert telegram_result == "SUCCESS"
    assert web_result == "RPC_FAILED: already_processed"
    assert supabase.rpc.call_count == 2


def test_tenant_pair_fixture_models_two_isolated_organizations(tenant_pair_fixtures):
    tenant_a = tenant_pair_fixtures["tenant_a"]
    tenant_b = tenant_pair_fixtures["tenant_b"]

    assert tenant_a["org_id"] != tenant_b["org_id"]
    assert tenant_a["project_id"] != tenant_b["project_id"]
    assert tenant_a["vendor_project"]["project_id"] == tenant_a["project_id"]
    assert tenant_b["vendor_project"]["vendor_id"] == tenant_b["vendor_id"]

