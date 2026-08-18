"""SDD 021 — Dedupe idempotente de eventos de notificación (FR-006).

En producción, la misma notificación puede intentar insertarse dos veces por
carreras de ejecución (reintento ARQ tras timeout post-commit, doble canal
inline+job). La BD debe colapsar esos intentos a UNA fila por
(approval_id, recipient_id) vía `INSERT ... ON CONFLICT DO NOTHING`
(upsert con `ignore_duplicates=True`), respaldado por el índice único
`idx_notification_events_unique_approval_recipient`.

Los fakes modelan la semántica ON CONFLICT DO NOTHING de PostgREST.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

ORG_ID = "00000000-0000-4000-8000-000000000001"
LOT_ID = "00000000-0000-4000-8000-000000000002"
PROJECT_ID = "00000000-0000-4000-8000-000000000003"
ADMIN_ID = "00000000-0000-4000-8000-000000000004"
VENDOR_DB_ID = "00000000-0000-4000-8000-000000000005"
VENDOR_USER_ID = "00000000-0000-4000-8000-000000000006"
APPROVAL_ID = "00000000-0000-4000-8000-000000000007"


class _FakeQuery:
    def __init__(self, store, table_name):
        self.store = store
        self.table_name = table_name
        self._filters = []
        self._action = "select"
        self._payload = None
        self._ignore_duplicates = False

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def limit(self, _count):
        return self

    def order(self, _column, desc=False):
        return self

    def insert(self, payload):
        self._action = "insert"
        self._payload = payload
        return self

    def upsert(self, payload, *, ignore_duplicates=False, on_conflict="", **kwargs):
        self._action = "upsert"
        self._payload = payload
        self._ignore_duplicates = ignore_duplicates
        return self

    def _matches(self, row):
        return all(str(row.get(c)) == str(v) for c, v in self._filters)

    def _conflict_exists(self, table, payload):
        return any(
            str(r.get("approval_id")) == str(payload.get("approval_id"))
            and str(r.get("recipient_id")) == str(payload.get("recipient_id"))
            for r in table
        )

    def execute(self):
        table = self.store.tables.setdefault(self.table_name, [])
        if self._action == "insert":
            row = dict(self._payload)
            table.append(row)
            return SimpleNamespace(data=[row])
        if self._action == "upsert":
            payload = dict(self._payload)
            if self._ignore_duplicates and self._conflict_exists(table, payload):
                return SimpleNamespace(data=[])
            table.append(payload)
            return SimpleNamespace(data=[payload])
        return SimpleNamespace(data=[row for row in table if self._matches(row)])


class _FakeSupabase:
    def __init__(self, tables):
        self.tables = tables

    def table(self, table_name):
        return _FakeQuery(self, table_name)


def _notifier_tables():
    return {
        "approval_requests": [
            {
                "id": APPROVAL_ID,
                "lot_id": LOT_ID,
                "organization_id": ORG_ID,
                "vendor_name": "Vendedora A",
                "request_type": "reservation",
                "payload": {
                    "cliente_nombre": "Ana Perez",
                    "cliente_run": "12.345.678-9",
                    "valor_reserva": 500000,
                },
            }
        ],
        "lots": [
            {"id": LOT_ID, "numero_lote": "12", "project_id": PROJECT_ID, "precio": 24000000}
        ],
        "projects": [{"id": PROJECT_ID, "name": "Teno - El Condor"}],
        "organization_members": [
            {"organization_id": ORG_ID, "role": "admin", "user_id": ADMIN_ID}
        ],
        "profiles": [{"id": ADMIN_ID, "phone": None, "telegram_chat_id": "777001"}],
        "notification_events": [],
    }


@pytest.mark.asyncio
async def test_notify_admin_approval_concurrent_double_execution_single_event(monkeypatch):
    """FR-006: dos ejecuciones concurrentes del notificador admin (mismo
    approval) deben colapsar a UNA fila en notification_events."""
    from workers.tasks import approval_notifier

    store = _FakeSupabase(_notifier_tables())
    telegram_client = SimpleNamespace(send_text=AsyncMock())

    monkeypatch.setattr(approval_notifier, "get_supabase_client", lambda: store)
    monkeypatch.setattr(
        approval_notifier,
        "get_telegram_client_for_org",
        AsyncMock(return_value=telegram_client),
    )
    monkeypatch.setattr(
        approval_notifier,
        "get_settings",
        lambda: SimpleNamespace(TELEGRAM_MINI_APP_URL="https://mini.plotify.test"),
    )

    first, second = await asyncio.gather(
        approval_notifier.notify_admin_approval({}, APPROVAL_ID),
        approval_notifier.notify_admin_approval({}, APPROVAL_ID),
    )

    assert first == "SUCCESS"
    assert second == "SUCCESS"
    events = store.tables.get("notification_events", [])
    assert len(events) == 1
    assert events[0]["recipient_role"] == "admin"
    assert events[0]["recipient_id"] == ADMIN_ID


@pytest.mark.asyncio
async def test_send_decision_notifications_concurrent_double_execution_single_vendor_event(
    monkeypatch,
):
    """FR-006: dos ejecuciones concurrentes del notificador de decisión al
    vendedor (mismo approval) deben colapsar a UNA fila de evento vendor."""
    from workers.tasks import approval_processor

    tables = {
        "approval_requests": [{"id": APPROVAL_ID, "vendor_id": VENDOR_DB_ID}],
        "vendors": [{"id": VENDOR_DB_ID, "user_id": VENDOR_USER_ID}],
        "profiles": [
            {"id": VENDOR_USER_ID, "phone": None, "telegram_chat_id": "555001"}
        ],
        "lots": [{"id": LOT_ID, "numero_lote": "12"}],
        "notification_events": [],
    }
    store = _FakeSupabase(tables)
    telegram_client = SimpleNamespace(send_text=AsyncMock())

    db_result = {
        "replayed": False,
        "request_type": "sale",
        "rpc_data": {
            "vendor_phone": None,
            "vendor_platform": "telegram",
            "vendor_name": "Vendedora A",
            "lot_id": LOT_ID,
        },
    }

    monkeypatch.setattr(approval_processor, "get_supabase_client", lambda: store)
    monkeypatch.setattr(
        approval_processor,
        "get_telegram_client_for_org",
        AsyncMock(return_value=telegram_client),
    )
    # Determinista: la atomicidad de ON CONFLICT DO NOTHING vive en la BD; el
    # fake la modela a nivel de execute() en un solo hilo.
    monkeypatch.setattr(
        "asyncio.to_thread",
        AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
    )

    first, second = await asyncio.gather(
        approval_processor.send_decision_notifications(
            {}, ORG_ID, APPROVAL_ID, "approve", ADMIN_ID, db_result
        ),
        approval_processor.send_decision_notifications(
            {}, ORG_ID, APPROVAL_ID, "approve", ADMIN_ID, db_result
        ),
    )

    assert first == "SUCCESS"
    assert second == "SUCCESS"
    events = store.tables.get("notification_events", [])
    assert len(events) == 1
    assert events[0]["recipient_role"] == "vendor"
    assert events[0]["recipient_id"] == VENDOR_USER_ID


@pytest.mark.asyncio
async def test_send_decision_notifications_replayed_skips_event_insert(monkeypatch):
    """FR-006: una ejecución marcada como replay (decisión ya procesada) no
    inserta ningún evento de notificación."""
    from workers.tasks import approval_processor

    tables = {
        "approval_requests": [{"id": APPROVAL_ID, "vendor_id": VENDOR_DB_ID}],
        "vendors": [{"id": VENDOR_DB_ID, "user_id": VENDOR_USER_ID}],
        "profiles": [
            {"id": VENDOR_USER_ID, "phone": None, "telegram_chat_id": "555001"}
        ],
        "lots": [{"id": LOT_ID, "numero_lote": "12"}],
        "notification_events": [],
    }
    store = _FakeSupabase(tables)
    telegram_client = SimpleNamespace(send_text=AsyncMock())

    db_result = {
        "replayed": True,
        "request_type": "sale",
        "rpc_data": {
            "vendor_phone": None,
            "vendor_platform": "telegram",
            "vendor_name": "Vendedora A",
            "lot_id": LOT_ID,
        },
    }

    monkeypatch.setattr(approval_processor, "get_supabase_client", lambda: store)
    monkeypatch.setattr(
        approval_processor,
        "get_telegram_client_for_org",
        AsyncMock(return_value=telegram_client),
    )

    result = await approval_processor.send_decision_notifications(
        {}, ORG_ID, APPROVAL_ID, "approve", ADMIN_ID, db_result
    )

    assert result == "REPLAYED"
    assert store.tables.get("notification_events", []) == []
    telegram_client.send_text.assert_not_awaited()
