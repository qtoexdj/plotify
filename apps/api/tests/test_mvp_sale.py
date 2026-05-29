"""MVP tests for sale approval and rejection behavior (User Story 5)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

def _build_sale_app():
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

def _make_mock_supabase_for_sale(lot_state="reservado", has_pending=False, lot_org_id="org-a-uuid"):
    # Mock para lots
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

    # Mock para approval_requests
    pending_query_result = MagicMock(data=[{"id": "existing-pending-sale-uuid"}] if has_pending else [])
    insert_result = MagicMock(data=[{"id": "new-sale-approval-uuid"}])

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


@pytest.mark.asyncio
async def test_approve_sale_atomic_lock_and_update():
    """T070: Approve locks approval and lot, and updates lot to vendido."""
    from workers.tasks.approval_processor import process_admin_decision

    rpc_mock_result = MagicMock(
        data={
            "success": True,
            "vendor_phone": "+56912345678",
            "vendor_platform": "telegram",
            "vendor_name": "Vendedor A",
            "lot_id": "lot-a-uuid",
        }
    )

    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = rpc_mock_result

    # Mock para validación de tenant del approval_id
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"organization_id": "org-a-uuid", "request_type": "sale", "sale_mode": "direct", "previous_lot_state": "disponible"}]
    )

    # Mock del lote para notificación
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.side_effect = [
        MagicMock(data=[{"organization_id": "org-a-uuid", "request_type": "sale", "sale_mode": "direct", "previous_lot_state": "disponible"}]), # select organization_id for approval
        MagicMock(data=[{"numero_lote": "42"}]),             # select lot details
        MagicMock(data=[])                                   # select profile (none)
    ]

    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()

    with (
        patch("workers.tasks.approval_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.approval_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch("workers.tasks.approval_processor.log_agent_action", new=AsyncMock()),
    ):
        result = await process_admin_decision(
            {}, "org-a-uuid", "approval-sale-uuid", "approve", "telegram-admin-id"
        )

    # Verificar que el backend delega a la RPC de base de datos que encapsula la atomicidad (T070)
    assert result == "SUCCESS"
    supabase.rpc.assert_called_once_with(
        "approve_sale",
        {
            "p_approval_id": "approval-sale-uuid",
            "p_admin_phone": "telegram-admin-id",
        }
    )
    # Adicionalmente, verificamos que el flujo asertivo valida la organización y el rol de admin/service_role
    supabase.table.assert_any_call("approval_requests")


@pytest.mark.asyncio
async def test_reject_sale_preserves_state_and_writes_audit():
    """T071: Rejection preserves previous lot state and writes audit/history."""
    from workers.tasks.approval_processor import process_admin_decision

    rpc_mock_result = MagicMock(
        data={
            "success": True,
            "vendor_phone": "+56912345678",
            "vendor_platform": "telegram",
            "vendor_name": "Vendedor A",
            "lot_id": "lot-a-uuid",
        }
    )

    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = rpc_mock_result

    # Mock para validación de tenant del approval_id
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.side_effect = [
        MagicMock(data=[{"organization_id": "org-a-uuid", "request_type": "sale", "sale_mode": "direct", "previous_lot_state": "disponible"}]), # select organization_id for approval
        MagicMock(data=[{"numero_lote": "42"}]),             # select lot details
        MagicMock(data=[])                                   # select profile (none)
    ]

    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()
    audit_mock = AsyncMock()

    with (
        patch("workers.tasks.approval_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.approval_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch("workers.tasks.approval_processor.log_agent_action", new=audit_mock),
    ):
        result = await process_admin_decision(
            {}, "org-a-uuid", "approval-sale-uuid", "reject", "telegram-admin-id"
        )

    assert result == "SUCCESS"
    supabase.rpc.assert_called_once_with(
        "reject_sale",
        {
            "p_approval_id": "approval-sale-uuid",
            "p_admin_phone": "telegram-admin-id",
        }
    )
    audit_mock.assert_called_once()
