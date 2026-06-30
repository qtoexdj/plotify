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


class _FilteredQuery:
    def __init__(self, rows):
        self._rows = list(rows)
        self._eq_filters = []
        self._in_filters = []
        self._limit = None
        self._single = False

    def eq(self, field, value):
        self._eq_filters.append((field, value))
        return self

    def in_(self, field, values):
        self._in_filters.append((field, set(values)))
        return self

    def limit(self, count):
        self._limit = count
        return self

    def order(self, *_args, **_kwargs):
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        rows = [
            row
            for row in self._rows
            if all(row.get(field) == value for field, value in self._eq_filters)
            and all(row.get(field) in values for field, values in self._in_filters)
        ]
        if self._limit is not None:
            rows = rows[: self._limit]
        if self._single:
            return MagicMock(data=rows[0] if rows else None)
        return MagicMock(data=rows)


class _FilteredTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_args, **_kwargs):
        return _FilteredQuery(self._rows)


class _FilteredSupabase:
    def __init__(self, tables):
        self._tables = tables
        self.table_calls = []

    def table(self, name):
        self.table_calls.append(name)
        return _FilteredTable(self._tables.get(name, []))


def _telegram_client_mock():
    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()
    return telegram_client


def _linked_vendor_filtered_supabase():
    return _FilteredSupabase(
        {
            "profiles": [
                {"id": "profile-1", "telegram_chat_id": "telegram-chat-1"},
            ],
            "organization_members": [
                {"organization_id": "org-1", "user_id": "profile-1", "role": "vendor"},
            ],
            "vendors": [
                {
                    "id": "vendor-1",
                    "user_id": "profile-1",
                    "organization_id": "org-1",
                    "nombre": "Vendedora",
                    "phone": "+56911111111",
                    "active": True,
                },
            ],
            "vendor_projects": [
                {"vendor_id": "vendor-1", "project_id": "project-1"},
            ],
            "lots": [
                {
                    "id": "lot-available",
                    "numero_lote": "24",
                    "estado": "disponible",
                    "project_id": "project-1",
                },
            ],
        }
    )


async def test_assigned_vendor_can_query_assigned_lot_availability():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    vendor_table = _table_with_execute(
        [{"id": "vendor-1", "organization_id": "org-1", "nombre": "Vendedora", "active": True}]
    )
    assignments_table = _table_with_execute([{"project_id": "project-1"}])
    profiles_table = _table_with_execute([{"id": "user-1", "phone": "telegram-chat-1"}])
    members_table = _table_with_execute(
        [{"organization_id": "org-1", "user_id": "user-1", "role": "vendor"}]
    )
    lots_table = MagicMock()
    lots_table.select.return_value.eq.return_value.in_.return_value.execute.return_value = MagicMock(
        data=[{"id": "lot-1", "numero_lote": "24", "estado": "disponible", "project_id": "project-1"}]
    )

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "vendors": vendor_table,
        "vendor_projects": assignments_table,
        "lots": lots_table,
        "profiles": profiles_table,
        "organization_members": members_table,
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


async def test_linked_vendor_availability_filters_unavailable_and_foreign_project_lots():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _FilteredSupabase(
        {
            "profiles": [
                {"id": "profile-1", "telegram_chat_id": "telegram-chat-1"},
            ],
            "organization_members": [
                {"organization_id": "org-1", "user_id": "profile-1", "role": "vendor"},
            ],
            "vendors": [
                {
                    "id": "vendor-1",
                    "user_id": "profile-1",
                    "organization_id": "org-1",
                    "nombre": "Vendedora",
                    "phone": "+56911111111",
                    "active": True,
                },
                {
                    "id": "vendor-foreign",
                    "user_id": "profile-2",
                    "organization_id": "org-2",
                    "nombre": "Vendedor Ajeno",
                    "phone": "+56922222222",
                    "active": True,
                },
            ],
            "vendor_projects": [
                {"vendor_id": "vendor-1", "project_id": "project-1"},
                {"vendor_id": "vendor-foreign", "project_id": "project-foreign"},
            ],
            "lots": [
                {
                    "id": "lot-available",
                    "numero_lote": "24",
                    "estado": "disponible",
                    "project_id": "project-1",
                },
                {
                    "id": "lot-unavailable",
                    "numero_lote": "99",
                    "estado": "reservado",
                    "project_id": "project-1",
                },
                {
                    "id": "lot-foreign",
                    "numero_lote": "88",
                    "estado": "disponible",
                    "project_id": "project-foreign",
                },
            ],
        }
    )
    telegram_client = _telegram_client_mock()

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

    message = telegram_client.send_text.call_args.args[1]
    assert result == "AVAILABILITY:1"
    assert "Lote 24" in message
    assert "Lote 99" not in message
    assert "Lote 88" not in message


async def test_telegram_vendor_availability_is_audited_with_assigned_scope():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _linked_vendor_filtered_supabase()
    telegram_client = _telegram_client_mock()
    audit_log = AsyncMock()

    with (
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch("workers.tasks.message_processor.log_agent_action", new=audit_log),
    ):
        result = await process_vendor_telegram_operation(
            {}, "org-1", "telegram-chat-1", "availability"
        )

    assert result == "AVAILABILITY:1"
    audit_log.assert_awaited_once()
    kwargs = audit_log.call_args.kwargs
    assert kwargs["action"] == "telegram.vendor.availability_requested"
    assert kwargs["organization_id"] == "org-1"
    assert kwargs["payload"]["vendor_id"] == "vendor-1"
    assert kwargs["payload"]["result_count"] == 1


async def test_linked_profile_without_org_membership_does_not_fall_back_to_phone_vendor():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _FilteredSupabase(
        {
            "profiles": [
                {"id": "profile-1", "telegram_chat_id": "telegram-chat-1"},
            ],
            "organization_members": [],
            "vendors": [
                {
                    "id": "legacy-vendor",
                    "user_id": "legacy-user",
                    "organization_id": "org-1",
                    "nombre": "Legacy",
                    "phone": "telegram-chat-1",
                    "active": True,
                },
            ],
            "vendor_projects": [
                {"vendor_id": "legacy-vendor", "project_id": "project-1"},
            ],
            "lots": [
                {
                    "id": "lot-available",
                    "numero_lote": "24",
                    "estado": "disponible",
                    "project_id": "project-1",
                },
            ],
        }
    )
    telegram_client = _telegram_client_mock()

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

    message = telegram_client.send_text.call_args.args[1]
    assert result == "UNASSIGNED_VENDOR"
    assert "Lote 24" not in message
    assert "vendor_projects" not in supabase.table_calls
    assert "lots" not in supabase.table_calls


async def test_linked_profile_without_org_vendor_does_not_use_phone_fallback():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _FilteredSupabase(
        {
            "profiles": [
                {"id": "profile-1", "telegram_chat_id": "telegram-chat-1"},
            ],
            "organization_members": [
                {"organization_id": "org-1", "user_id": "profile-1", "role": "vendor"},
            ],
            "vendors": [
                {
                    "id": "legacy-vendor",
                    "user_id": "legacy-user",
                    "organization_id": "org-1",
                    "nombre": "Legacy",
                    "phone": "telegram-chat-1",
                    "active": True,
                },
            ],
            "vendor_projects": [
                {"vendor_id": "legacy-vendor", "project_id": "project-1"},
            ],
            "lots": [
                {
                    "id": "lot-available",
                    "numero_lote": "24",
                    "estado": "disponible",
                    "project_id": "project-1",
                },
            ],
        }
    )
    telegram_client = _telegram_client_mock()

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

    message = telegram_client.send_text.call_args.args[1]
    assert result == "UNASSIGNED_VENDOR"
    assert "Lote 24" not in message
    assert "vendor_projects" not in supabase.table_calls
    assert "lots" not in supabase.table_calls


async def test_unlinked_chat_can_use_legacy_phone_fallback_when_active_and_assigned():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _FilteredSupabase(
        {
            "profiles": [],
            "vendors": [
                {
                    "id": "legacy-vendor",
                    "user_id": "legacy-user",
                    "organization_id": "org-1",
                    "nombre": "Legacy",
                    "phone": "telegram-chat-1",
                    "active": True,
                },
            ],
            "vendor_projects": [
                {"vendor_id": "legacy-vendor", "project_id": "project-1"},
            ],
            "lots": [
                {
                    "id": "lot-available",
                    "numero_lote": "24",
                    "estado": "disponible",
                    "project_id": "project-1",
                },
            ],
        }
    )
    telegram_client = _telegram_client_mock()

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

    message = telegram_client.send_text.call_args.args[1]
    assert result == "AVAILABILITY:1"
    assert "Lote 24" in message


async def test_unlinked_telegram_chat_is_rejected_without_commercial_data():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _FilteredSupabase(
        {
            "profiles": [],
            "vendors": [],
            "vendor_projects": [{"vendor_id": "vendor-1", "project_id": "project-1"}],
            "lots": [
                {
                    "id": "lot-available",
                    "numero_lote": "24",
                    "estado": "disponible",
                    "project_id": "project-1",
                },
            ],
        }
    )
    telegram_client = _telegram_client_mock()

    with (
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
    ):
        result = await process_vendor_telegram_operation(
            {}, "org-1", "unknown-chat", "availability"
        )

    message = telegram_client.send_text.call_args.args[1]
    assert result == "UNASSIGNED_VENDOR"
    assert "Lote 24" not in message
    assert "lots" not in supabase.table_calls


async def test_inactive_linked_vendor_is_rejected_without_lot_lookup():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _FilteredSupabase(
        {
            "profiles": [
                {"id": "profile-1", "telegram_chat_id": "telegram-chat-1"},
            ],
            "organization_members": [
                {"organization_id": "org-1", "user_id": "profile-1", "role": "vendor"},
            ],
            "vendors": [
                {
                    "id": "vendor-1",
                    "user_id": "profile-1",
                    "organization_id": "org-1",
                    "nombre": "Vendedora",
                    "phone": "+56911111111",
                    "active": False,
                },
            ],
            "vendor_projects": [{"vendor_id": "vendor-1", "project_id": "project-1"}],
            "lots": [
                {
                    "id": "lot-available",
                    "numero_lote": "24",
                    "estado": "disponible",
                    "project_id": "project-1",
                },
            ],
        }
    )
    telegram_client = _telegram_client_mock()

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

    message = telegram_client.send_text.call_args.args[1]
    assert result == "UNASSIGNED_VENDOR"
    assert "Lote 24" not in message
    assert "vendor_projects" not in supabase.table_calls
    assert "lots" not in supabase.table_calls


async def test_linked_vendor_without_project_assignments_is_rejected_before_lot_lookup():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _FilteredSupabase(
        {
            "profiles": [
                {"id": "profile-1", "telegram_chat_id": "telegram-chat-1"},
            ],
            "organization_members": [
                {"organization_id": "org-1", "user_id": "profile-1", "role": "vendor"},
            ],
            "vendors": [
                {
                    "id": "vendor-1",
                    "user_id": "profile-1",
                    "organization_id": "org-1",
                    "nombre": "Vendedora",
                    "phone": "+56911111111",
                    "active": True,
                },
            ],
            "vendor_projects": [],
            "lots": [
                {
                    "id": "lot-available",
                    "numero_lote": "24",
                    "estado": "disponible",
                    "project_id": "project-1",
                },
            ],
        }
    )
    telegram_client = _telegram_client_mock()

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

    message = telegram_client.send_text.call_args.args[1]
    assert result == "UNASSIGNED_VENDOR"
    assert "Lote 24" not in message
    assert "lots" not in supabase.table_calls


async def test_unassigned_or_foreign_vendor_is_rejected():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    vendor_table = _table_with_execute([])
    profiles_table = _table_with_execute([])
    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "vendors": vendor_table,
        "profiles": profiles_table,
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
            {}, "org-foreign", "telegram-chat-1", "availability"
        )

    assert result == "UNASSIGNED_VENDOR"
    assert "validar tu acceso" in telegram_client.send_text.call_args.args[1]


async def test_unassigned_vendor_denial_is_audited_without_lot_lookup():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _FilteredSupabase(
        {
            "profiles": [],
            "vendors": [],
            "vendor_projects": [{"vendor_id": "vendor-1", "project_id": "project-1"}],
            "lots": [
                {
                    "id": "lot-available",
                    "numero_lote": "24",
                    "estado": "disponible",
                    "project_id": "project-1",
                },
            ],
        }
    )
    telegram_client = _telegram_client_mock()
    audit_log = AsyncMock()

    with (
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch("workers.tasks.message_processor.log_agent_action", new=audit_log),
    ):
        result = await process_vendor_telegram_operation(
            {}, "org-1", "unknown-chat", "availability"
        )

    assert result == "UNASSIGNED_VENDOR"
    assert "lots" not in supabase.table_calls
    audit_log.assert_awaited_once()
    kwargs = audit_log.call_args.kwargs
    assert kwargs["action"] == "telegram.vendor.operation_denied"
    assert kwargs["payload"]["reason"] == "vendor_context_unresolved"


async def test_assigned_vendor_can_create_reservation_request_from_telegram():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    vendor_table = _table_with_execute(
        [{"id": "vendor-1", "organization_id": "org-1", "nombre": "Vendedora", "active": True}]
    )
    assignments_table = _table_with_execute([{"project_id": "project-1"}])
    profiles_table = _table_with_execute([{"id": "user-1", "phone": "telegram-chat-1"}])
    members_table = _table_with_execute(
        [{"organization_id": "org-1", "user_id": "user-1", "role": "vendor"}]
    )
    
    lots_table = MagicMock()
    select_mock = MagicMock()
    lots_table.select = select_mock

    # Mock único para cualquier llamada a select(...) con cualquier argumento
    select_mock.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data=[{"id": "4f8dbde6-7788-4444-a111-c678a9c04909", "estado": "disponible", "numero_lote": "24", "project_id": "project-1", "projects": {"organization_id": "org-1"}}]
    )
    select_mock.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"id": "4f8dbde6-7788-4444-a111-c678a9c04909", "estado": "disponible", "numero_lote": "24", "project_id": "project-1", "projects": {"organization_id": "org-1"}}]
    )
    
    approvals_table = MagicMock()
    approvals_table.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[]
    )
    approvals_table.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "approval-1"}]
    )

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "vendors": vendor_table,
        "vendor_projects": assignments_table,
        "lots": lots_table,
        "approval_requests": approvals_table,
        "profiles": profiles_table,
        "organization_members": members_table,
    }[name]
    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()
    redis = MagicMock()
    redis.enqueue_job = AsyncMock()
    audit_log = AsyncMock()

    with (
        patch("core.database.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch("api.v1.endpoints.approvals.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch("workers.tasks.message_processor.log_agent_action", new=audit_log),
    ):
        result = await process_vendor_telegram_operation(
            {"redis": redis},
            "org-1",
            "telegram-chat-1",
            "reserve",
            {
                "lot_id": "4f8dbde6-7788-4444-a111-c678a9c04909",
                "payload": {
                    "cliente_nombre": "Comprador Demo",
                    "cliente_run": "12.345.678-9",
                    "valor_reserva": 500000,
                },
            },
        )

    assert result == "RESERVATION_REQUESTED:approval-1"
    approvals_table.insert.assert_called_once()
    inserted_request = approvals_table.insert.call_args.args[0]
    assert inserted_request["status"] == "pending"
    assert inserted_request["lot_id"] == "4f8dbde6-7788-4444-a111-c678a9c04909"
    assert inserted_request["organization_id"] == "org-1"
    assert inserted_request["vendor_id"] == "vendor-1"
    assert inserted_request["vendor_platform"] == "telegram"
    assert inserted_request["payload"] == {
        "cliente_nombre": "Comprador Demo",
        "cliente_run": "12.345.678-9",
        "valor_reserva": 500000.0,
        "notaria": None,
        "fecha_firma": None,
    }
    assert "approved" not in inserted_request.values()
    approvals_table.update.assert_not_called()
    lots_table.update.assert_not_called()
    redis.enqueue_job.assert_awaited_once_with("notify_admin_approval", "approval-1")
    audit_log.assert_awaited_once()
    audit_kwargs = audit_log.call_args.kwargs
    assert audit_kwargs["action"] == "telegram.vendor.reservation_requested"
    assert audit_kwargs["entity_id"] == "approval-1"
    assert audit_kwargs["payload"]["status"] == "pending"
    assert audit_kwargs["payload"]["lot_id"] == "4f8dbde6-7788-4444-a111-c678a9c04909"


async def test_telegram_reservation_invalid_payload_is_rejected_before_central_request():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _linked_vendor_filtered_supabase()
    telegram_client = _telegram_client_mock()
    audit_log = AsyncMock()
    request_reservation = AsyncMock()

    with (
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch("api.v1.endpoints.approvals.request_reservation", new=request_reservation),
        patch("workers.tasks.message_processor.log_agent_action", new=audit_log),
    ):
        result = await process_vendor_telegram_operation(
            {"redis": MagicMock()},
            "org-1",
            "telegram-chat-1",
            "reserve",
            {
                "lot_id": "lot-available",
                "payload": {
                    "cliente_nombre": "Comprador Demo",
                    "cliente_run": "12.345.678-9",
                    "valor_reserva": "abc",
                },
            },
        )

    assert result == "INVALID_RESERVATION_DATA"
    request_reservation.assert_not_awaited()
    message = telegram_client.send_text.call_args.args[1]
    assert "valor de reserva" in message.lower()
    assert "Ejemplo:" in message
    audit_log.assert_awaited_once()
    assert audit_log.call_args.kwargs["action"] == "telegram.vendor.operation_denied"
    assert audit_log.call_args.kwargs["payload"]["reason"] == "invalid_reservation_payload"


async def test_telegram_reservation_invalid_lot_returns_operational_copy_and_audit():
    from fastapi import HTTPException
    from workers.tasks.message_processor import process_vendor_telegram_operation

    supabase = _linked_vendor_filtered_supabase()
    telegram_client = _telegram_client_mock()
    audit_log = AsyncMock()
    request_reservation = AsyncMock(
        side_effect=HTTPException(status_code=404, detail="Lote no encontrado.")
    )

    with (
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch("api.v1.endpoints.approvals.request_reservation", new=request_reservation),
        patch("workers.tasks.message_processor.log_agent_action", new=audit_log),
    ):
        result = await process_vendor_telegram_operation(
            {"redis": MagicMock()},
            "org-1",
            "telegram-chat-1",
            "reserve",
            {
                "lot_id": "lot-missing",
                "payload": {
                    "cliente_nombre": "Comprador Demo",
                    "cliente_run": "12.345.678-9",
                    "valor_reserva": 500000,
                },
            },
        )

    assert result == "RESERVATION_FAILED"
    request_reservation.assert_awaited_once()
    message = telegram_client.send_text.call_args.args[1]
    assert "Lote no encontrado" in message
    assert "consulta /lotes" in message
    audit_log.assert_awaited_once()
    assert audit_log.call_args.kwargs["action"] == "telegram.vendor.operation_denied"
    assert audit_log.call_args.kwargs["payload"]["reason"] == "reservation_rejected"


async def test_telegram_reservation_existing_pending_request_does_not_auto_approve_or_notify():
    from workers.tasks.message_processor import process_vendor_telegram_operation

    vendor_table = _table_with_execute(
        [
            {
                "id": "vendor-1",
                "organization_id": "org-1",
                "nombre": "Vendedora",
                "active": True,
            }
        ]
    )
    assignments_table = _table_with_execute([{"project_id": "project-1"}])
    profiles_table = _table_with_execute([{"id": "user-1", "phone": "telegram-chat-1"}])
    members_table = _table_with_execute(
        [{"organization_id": "org-1", "user_id": "user-1", "role": "vendor"}]
    )

    lots_table = MagicMock()
    select_mock = MagicMock()
    lots_table.select = select_mock
    lot_row = {
        "id": "4f8dbde6-7788-4444-a111-c678a9c04909",
        "estado": "disponible",
        "numero_lote": "24",
        "project_id": "project-1",
        "projects": {"organization_id": "org-1"},
    }
    select_mock.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data=[lot_row]
    )
    select_mock.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[lot_row]
    )

    approvals_table = MagicMock()
    approvals_table.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"id": "existing-pending"}]
    )

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "vendors": vendor_table,
        "vendor_projects": assignments_table,
        "lots": lots_table,
        "approval_requests": approvals_table,
        "profiles": profiles_table,
        "organization_members": members_table,
    }[name]
    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()
    redis = MagicMock()
    redis.enqueue_job = AsyncMock()
    audit_log = AsyncMock()

    with (
        patch("core.database.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch("api.v1.endpoints.approvals.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch("workers.tasks.message_processor.log_agent_action", new=audit_log),
    ):
        result = await process_vendor_telegram_operation(
            {"redis": redis},
            "org-1",
            "telegram-chat-1",
            "reserve",
            {
                "lot_id": "4f8dbde6-7788-4444-a111-c678a9c04909",
                "payload": {
                    "cliente_nombre": "Comprador Demo",
                    "cliente_run": "12.345.678-9",
                    "valor_reserva": 500000,
                },
            },
        )

    assert result == "RESERVATION_FAILED"
    message = telegram_client.send_text.call_args.args[1]
    assert "pendiente" in message.lower()
    approvals_table.insert.assert_not_called()
    approvals_table.update.assert_not_called()
    lots_table.update.assert_not_called()
    redis.enqueue_job.assert_not_called()
    audit_log.assert_awaited_once()
    assert audit_log.call_args.kwargs["action"] == "telegram.vendor.operation_denied"
    assert audit_log.call_args.kwargs["payload"]["reason"] == "reservation_rejected"


async def test_process_incoming_message_reserva_quoted_args():
    import asyncio
    from workers.tasks.message_processor import process_incoming_message

    # 1. Mocks de base de datos
    profiles_table = _table_with_execute([{"id": "user-1"}])
    
    vendor_table = MagicMock()
    vendor_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "vendor-1", "organization_id": "4f8dbde6-7788-4444-a111-c678a9c04909", "nombre": "Vendedor Pro"}]
    )

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "profiles": profiles_table,
        "vendors": vendor_table,
        "organization_members": _table_with_execute([]),
    }[name]

    # 2. Mock de process_vendor_telegram_operation para evitar ejecutar la reserva real, solo verificar qué argumentos le llegan
    redis = MagicMock()
    payload = {
        "platform": "telegram",
        "phone_id": "telegram-chat-123",
        "message_id": "msg-123",
        "message_text": '/reserva 4f8dbde6-7788-4444-a111-c678a9c04909 "Juan Pérez" "12.345.678-9" 750000',
        "organization_id": "4f8dbde6-7788-4444-a111-c678a9c04909",
        "raw_payload": {},
    }

    with (
        patch("core.database.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.process_vendor_telegram_operation") as mock_operation,
    ):
        mock_operation.return_value = "RESERVATION_REQUESTED:approval-1"

        result = await process_incoming_message({"redis": redis}, payload)

        assert result == "RESERVATION_REQUESTED:approval-1"
        mock_operation.assert_called_once_with(
            {"redis": redis},
            "4f8dbde6-7788-4444-a111-c678a9c04909",
            "telegram-chat-123",
            "reserve",
            data={
                "lot_id": "4f8dbde6-7788-4444-a111-c678a9c04909",
                "payload": {
                    "cliente_nombre": "Juan Pérez",
                    "cliente_run": "12.345.678-9",
                    "valor_reserva": 750000.0,
                }
            }
        )


async def test_process_incoming_message_reserva_incomplete_args_sends_format_copy_and_audits():
    from workers.tasks.message_processor import process_incoming_message

    profiles_table = _table_with_execute([{"id": "user-1"}])
    vendor_table = MagicMock()
    vendor_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "vendor-1", "organization_id": "org-1", "nombre": "Vendedor Pro"}]
    )

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "profiles": profiles_table,
        "vendors": vendor_table,
        "organization_members": _table_with_execute([]),
    }[name]

    telegram_client = _telegram_client_mock()
    audit_log = AsyncMock()
    redis = MagicMock()
    payload = {
        "platform": "telegram",
        "phone_id": "telegram-chat-123",
        "message_id": "msg-123",
        "message_text": "/reserva lot-only",
        "organization_id": "org-1",
        "raw_payload": {},
    }

    with (
        patch("core.database.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.message_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
        patch("workers.tasks.message_processor.process_vendor_telegram_operation") as mock_operation,
        patch("workers.tasks.message_processor.log_agent_action", new=audit_log),
    ):
        result = await process_incoming_message({"redis": redis}, payload)

    assert result == "MISSING_RESERVE_ARGS"
    mock_operation.assert_not_called()
    message = telegram_client.send_text.call_args.args[1]
    assert "Formato de reserva incompleto" in message
    assert "Ejemplo:" in message
    audit_log.assert_awaited_once()
    assert audit_log.call_args.kwargs["action"] == "telegram.vendor.operation_denied"
    assert audit_log.call_args.kwargs["payload"]["reason"] == "invalid_reservation_format"


async def test_telegram_client_send_failed_auditing():
    import httpx
    import asyncio
    from integrations.telegram_client import TelegramClient

    client = TelegramClient(bot_token="dummy-token", org_id="4f8dbde6-7788-4444-a111-c678a9c04909")

    # 1. Simular un fallo HTTPStatusError
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"

    # Mock log_agent_action para verificar cómo se le llama
    with (
        patch("httpx.AsyncClient.post", side_effect=httpx.HTTPStatusError("API Error", request=MagicMock(), response=mock_response)),
        patch("integrations.telegram_client.log_agent_action", new_callable=AsyncMock) as mock_log_audit,
    ):
        await client.send_text("chat-123", "Hola Mundo")

        # Esperar un momento a que las tareas asíncronas de asyncio terminen
        await asyncio.sleep(0.1)

        mock_log_audit.assert_called_once()
        args, kwargs = mock_log_audit.call_args

        assert kwargs["action"] == "telegram.send_failed"
        assert kwargs["organization_id"] == "4f8dbde6-7788-4444-a111-c678a9c04909"
        assert kwargs["payload"]["status_code"] == 500
        assert kwargs["payload"]["error"] == "Internal Server Error"


async def test_telegram_client_audit_task_exception_safety():
    import httpx
    import asyncio
    from integrations.telegram_client import TelegramClient

    client = TelegramClient(bot_token="dummy-token", org_id="4f8dbde6-7788-4444-a111-c678a9c04909")

    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.text = "Bad Request"

    # Mock log_agent_action para que lance un error (fallo de DB por ejemplo)
    with (
        patch("httpx.AsyncClient.post", side_effect=httpx.HTTPStatusError("API Error", request=MagicMock(), response=mock_response)),
        patch("integrations.telegram_client.log_agent_action", side_effect=Exception("Database connection failure")),
    ):
        # Esta llamada no debe propagar la excepción de log_agent_action
        # y debe ejecutarse limpiamente de manera asíncrona.
        result = await client.send_text("chat-123", "Hola Mundo")

        await asyncio.sleep(0.1)
        # Verificamos que al menos capturó y manejó el error localmente
        assert result is None


async def test_vendor_from_org_a_sent_via_webhook_org_b_does_not_operate():
    import asyncio
    from workers.tasks.message_processor import process_incoming_message

    # 1. El perfil tiene telegram_chat_id vinculado al usuario user-1
    profiles_table = _table_with_execute([{"id": "user-1"}])
    
    # 2. Pero la consulta a vendors buscando user-1 y organization_id "org-B" devolverá vacío 
    # (porque el vendedor pertenece a "org-A", no a "org-B")
    vendor_table = MagicMock()
    vendor_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    
    # Mock de leads para que no falle al intentar crear el lead
    leads_table = MagicMock()
    leads_table.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    leads_table.insert.return_value.execute.return_value = MagicMock(data=[{"id": "lead-1"}])

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "profiles": profiles_table,
        "vendors": vendor_table,
        "leads": leads_table,
        "organization_members": _table_with_execute([]),
    }[name]

    redis = MagicMock()
    payload = {
        "platform": "telegram",
        "phone_id": "telegram-chat-123",
        "message_id": "msg-123",
        # Intenta enviar un comando restringido de vendedor
        "message_text": '/reserva 4f8dbde6-7788-4444-a111-c678a9c04909 "Juan" "12345678-9" 500000',
        "organization_id": "org-B", # Entra por el webhook de la Org B
        "raw_payload": {},
    }

    # Mock del graph para simular que pasa como lead al LLM
    mock_graph = AsyncMock()
    mock_graph.ainvoke.return_value = {"messages": [MagicMock(content="Respuesta del Agente IA al lead")]}

    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()

    with (
        patch("core.database.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.get_graph_for_org", new=AsyncMock(return_value=mock_graph)),
        patch("workers.tasks.message_processor.get_telegram_client_for_org", new=AsyncMock(return_value=telegram_client)),
    ):
        result = await process_incoming_message({"redis": redis}, payload)
        
        # Debe procesarse como "SUCCESS" (flujo de lead hacia el agente LLM)
        # y NO disparar process_vendor_telegram_operation (el cual retornaría RESERVATION_REQUESTED)
        assert result == "SUCCESS"
        mock_graph.ainvoke.assert_called_once()
        # Verificar que la query a vendors se filtró estrictamente por org-B en sus llamadas
        assert vendor_table.select.return_value.eq.return_value.eq.call_count == 2
        vendor_table.select.return_value.eq.return_value.eq.assert_any_call("organization_id", "org-B")


async def test_audit_log_saves_none_organization_id_as_null():
    from utils.audit import log_agent_action

    audit_logs_table = MagicMock()
    audit_logs_table.insert.return_value.execute.return_value = MagicMock(data=[{"id": "log-1"}])

    supabase = MagicMock()
    supabase.table.return_value = audit_logs_table

    with patch("utils.audit.get_supabase_client", return_value=supabase):
        await log_agent_action(
            actor="test_actor",
            action="test.action",
            entity="test_entity",
            entity_id="test-123",
            organization_id=None, # Pasar None explícito
            payload={}
        )
        
        # Comprobar que el insert recibió None (NULL) en organization_id, NO la cadena "None"
        audit_logs_table.insert.assert_called_once()
        inserted_dict = audit_logs_table.insert.call_args[0][0]
        assert inserted_dict["organization_id"] is None


async def test_telegram_shortcuts_admin_and_vendor():
    """T040 [US4]: Validar que los shortcuts estructurados (/pendientes, /aprobadas, /rechazadas) devuelvan respuestas con formato seguro de acuerdo con el rol."""
    from workers.tasks.message_processor import process_incoming_message
    
    profiles_table = _table_with_execute([{"id": "user-1"}])
    vendor_table = MagicMock()
    vendor_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "vendor-1", "organization_id": "org-a", "nombre": "Vendedor A"}]
    )
    
    approvals_table = MagicMock()
    approvals_table.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "app-uuid-1",
                "request_type": "reservation",
                "status": "pending",
                "vendor_name": "Vendedor A",
                "payload": {"cliente_nombre": "Test Cliente"},
                "lots": {"numero_lote": "12"}
            }
        ]
    )
    
    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "profiles": profiles_table,
        "vendors": vendor_table,
        "approval_requests": approvals_table,
        "organization_members": _table_with_execute([]),
    }[name]
    
    redis = MagicMock()
    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()
    
    payload = {
        "platform": "telegram",
        "phone_id": "telegram-chat-1",
        "message_id": "msg-101",
        "message_text": "/pendientes",
        "organization_id": "org-a",
        "raw_payload": {},
    }
    
    with (
        patch("core.database.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.get_telegram_client_for_org", new=AsyncMock(return_value=telegram_client)),
    ):
        result = await process_incoming_message({"redis": redis}, payload)
        
    assert result in ("PENDING_SHORTCUT_SUCCESS", "SUCCESS")

async def test_telegram_docs_shortcut_routing():
    """T041 [US4]: Validar que el shortcut /docs devuelva el enlace a la página segura de documentación del vendedor."""
    from workers.tasks.message_processor import process_incoming_message
    
    profiles_table = _table_with_execute([{"id": "user-1"}])
    vendor_table = MagicMock()
    vendor_table.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "vendor-1", "organization_id": "org-a", "nombre": "Vendedor A"}]
    )
    
    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "profiles": profiles_table,
        "vendors": vendor_table,
        "organization_members": _table_with_execute([]),
    }[name]
    
    redis = MagicMock()
    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()
    
    payload = {
        "platform": "telegram",
        "phone_id": "telegram-chat-1",
        "message_id": "msg-102",
        "message_text": "/docs",
        "organization_id": "org-a",
        "raw_payload": {},
    }
    
    with (
        patch("core.database.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.get_supabase_client", return_value=supabase),
        patch("workers.tasks.message_processor.get_telegram_client_for_org", new=AsyncMock(return_value=telegram_client)),
    ):
        result = await process_incoming_message({"redis": redis}, payload)
        
    assert result in ("DOCS_SHORTCUT_SUCCESS", "SUCCESS")
