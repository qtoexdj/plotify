"""MVP foundation fixtures for approval race behavior."""

from unittest.mock import AsyncMock, MagicMock, patch


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
