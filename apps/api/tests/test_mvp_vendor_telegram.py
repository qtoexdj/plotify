"""MVP foundation tests for assigned seller Telegram operations."""

from unittest.mock import AsyncMock, MagicMock, patch


def _table_with_execute(data):
    table = MagicMock()
    table.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=data
    )
    table.select.return_value.eq.return_value.execute.return_value = MagicMock(data=data)
    table.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
        data=data
    )
    table.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=data
    )
    return table


async def test_assigned_vendor_can_query_assigned_lot_availability():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    vendor_table = _table_with_execute(
        [{"id": "vendor-1", "organization_id": "org-1", "nombre": "Vendedora", "active": True}]
    )
    assignments_table = _table_with_execute([{"project_id": "project-1"}])
    lots_table = MagicMock()
    lots_table.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[{"id": "lot-1", "numero_lote": "24", "estado": "disponible", "project_id": "project-1"}]
    )

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "vendors": vendor_table,
        "vendor_projects": assignments_table,
        "lots": lots_table,
    }[name]
    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()

    with (
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
    ):
        result = await process_vendor_telegram_operation(
            {}, "org-1", "telegram-chat-1", "availability"
        )

    assert result == "AVAILABILITY:1"
    telegram_client.send_text.assert_awaited_once()
    assert "Lote 24" in telegram_client.send_text.call_args.args[1]


async def test_unassigned_or_foreign_vendor_is_rejected():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    vendor_table = _table_with_execute([])
    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {"vendors": vendor_table}[name]
    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()

    with (
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
    ):
        result = await process_vendor_telegram_operation(
            {}, "org-foreign", "telegram-chat-1", "availability"
        )

    assert result == "UNASSIGNED_VENDOR"
    assert "No tienes proyectos asignados" in telegram_client.send_text.call_args.args[1]


async def test_assigned_vendor_can_create_reservation_request_from_telegram():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    vendor_table = _table_with_execute(
        [{"id": "vendor-1", "organization_id": "org-1", "nombre": "Vendedora", "active": True}]
    )
    assignments_table = _table_with_execute([{"project_id": "project-1"}])
    lots_table = _table_with_execute(
        [{"id": "lot-1", "numero_lote": "24", "estado": "disponible", "project_id": "project-1"}]
    )
    approvals_table = MagicMock()
    approvals_table.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "approval-1"}]
    )

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "vendors": vendor_table,
        "vendor_projects": assignments_table,
        "lots": lots_table,
        "approval_requests": approvals_table,
    }[name]
    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()
    redis = MagicMock()
    redis.enqueue_job = AsyncMock()

    with (
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
    ):
        result = await process_vendor_telegram_operation(
            {"redis": redis},
            "org-1",
            "telegram-chat-1",
            "reserve",
            {
                "lot_id": "lot-1",
                "payload": {
                    "cliente_nombre": "Comprador Demo",
                    "cliente_run": "12.345.678-9",
                    "valor_reserva": 500000,
                },
            },
        )

    assert result == "RESERVATION_REQUESTED:approval-1"
    approvals_table.insert.assert_called_once()
    redis.enqueue_job.assert_awaited_once_with("notify_admin_approval", "approval-1")
