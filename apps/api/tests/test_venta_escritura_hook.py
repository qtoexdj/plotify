"""SDD 011 T011: sale validation hooks the escritura draft idempotently."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from services import escritura_sale_hook
from workers.tasks import approval_notifier, approval_processor

ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_ID = "00000000-0000-4000-8000-000000000003"
CASE_ID = "00000000-0000-4000-8000-000000000004"
PROJECT_MATRIZ_ID = "00000000-0000-4000-8000-000000000005"
TEMPLATE_ID = "00000000-0000-4000-8000-000000000006"
ADMIN_ID = "00000000-0000-4000-8000-000000000007"


class FakeQuery:
    def __init__(self, store: "FakeSupabase", table_name: str):
        self.store = store
        self.table_name = table_name
        self.action = "select"
        self.payload: Any = None
        self.filters: list[tuple[str, Any]] = []
        self.single = False

    def select(self, *_args):
        return self

    def insert(self, payload):
        self.action = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.action = "update"
        self.payload = payload
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def neq(self, column, value):
        self.filters.append((column, ("__neq__", value)))
        return self

    def is_(self, column, value):
        self.filters.append((column, ("__is__", value)))
        return self

    def limit(self, _count):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def _matches(self, row: dict[str, Any]) -> bool:
        for column, expected in self.filters:
            actual = row.get(column)
            if isinstance(expected, tuple) and expected[0] == "__neq__":
                if str(actual) == str(expected[1]):
                    return False
            elif isinstance(expected, tuple) and expected[0] == "__is__":
                normalized = str(expected[1]).lower()
                if normalized == "null" and actual is not None:
                    return False
                if normalized != "null" and str(actual) != str(expected[1]):
                    return False
            elif str(actual) != str(expected):
                return False
        return True

    def execute(self):
        table = self.store.tables.setdefault(self.table_name, [])
        if self.action == "insert":
            row = {"id": str(uuid.uuid4()), **self.payload}
            table.append(row)
            return SimpleNamespace(data=[row])
        if self.action == "update":
            updated = []
            for row in table:
                if self._matches(row):
                    row.update(self.payload)
                    updated.append(row)
            return SimpleNamespace(data=updated)
        rows = [row for row in table if self._matches(row)]
        if self.single:
            return SimpleNamespace(data=rows[0] if rows else None)
        return SimpleNamespace(data=rows)


class FakeRpc:
    def __init__(self, store: "FakeSupabase", name: str, args: dict[str, Any]):
        self.store = store
        self.name = name
        self.args = args

    def execute(self):
        self.store.rpc_calls.append((self.name, self.args))
        return SimpleNamespace(
            data={
                "success": True,
                "lot_id": LOT_ID,
                "vendor_phone": "+56912345678",
                "vendor_platform": "telegram",
                "vendor_name": "Vendedor A",
            }
        )


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict[str, Any]]] = {}
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self, name)

    def rpc(self, name: str, args: dict[str, Any]) -> FakeRpc:
        return FakeRpc(self, name, args)


def _seed_base_store() -> FakeSupabase:
    store = FakeSupabase()
    store.tables["lots"] = [{"id": LOT_ID, "project_id": PROJECT_ID}]
    store.tables["projects"] = [{"id": PROJECT_ID, "organization_id": ORG_ID}]
    store.tables["escritura_matrices"] = [
        {
            "id": PROJECT_MATRIZ_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "escritura_case_id": None,
            "template_id": TEMPLATE_ID,
            "snapshot_case_status": "project",
            "snapshot_hash": "project-hash",
            "clause_order": ["comparecencia", "precio"],
            "clause_overrides": {
                "precio": {
                    "title": "Precio ajustado para Teno",
                    "content_json": {"type": "doc", "content": []},
                }
            },
            "source_project_matriz_id": None,
            "status": "approved",
            "version": 4,
            "submitted_by": ADMIN_ID,
            "submitted_at": "2026-06-16T10:00:00Z",
            "approved_by": ADMIN_ID,
            "approved_at": "2026-06-16T10:10:00Z",
            "created_at": "2026-06-16T10:00:00Z",
            "updated_at": "2026-06-16T10:10:00Z",
        }
    ]
    return store


def _case_row() -> dict[str, Any]:
    return {
        "id": CASE_ID,
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "lot_id": LOT_ID,
        "case_status": "variables_pending",
        "readiness_status": "needs_review",
        "readiness_gates": {},
        "variable_snapshot": {"comprador.nombre": {"value_text": "Ana Perez"}},
        "evidence_snapshot": {},
    }


@pytest.mark.asyncio
async def test_sale_hook_creates_case_and_draft_from_approved_project_matrix(
    monkeypatch,
):
    store = _seed_base_store()
    create_case = AsyncMock(return_value=_case_row())
    monkeypatch.setattr(
        escritura_sale_hook, "create_escritura_case_snapshot", create_case
    )

    result = await escritura_sale_hook.handle_sale_validated_for_escritura(
        organization_id=ORG_ID,
        lot_id=LOT_ID,
        validated_by=ADMIN_ID,
        supabase=store,
    )

    create_case.assert_awaited_once()
    assert create_case.await_args.kwargs["stage_operational"] is True
    assert create_case.await_args.kwargs["created_by"] == ADMIN_ID

    lot_matrices = [
        row
        for row in store.tables["escritura_matrices"]
        if row.get("escritura_case_id") == CASE_ID
    ]
    assert len(lot_matrices) == 1
    inserted = lot_matrices[0]
    assert inserted["template_id"] == TEMPLATE_ID
    assert inserted["source_project_matriz_id"] == PROJECT_MATRIZ_ID
    assert inserted["clause_order"] == ["comparecencia", "precio"]
    assert (
        inserted["clause_overrides"]["precio"]["title"]
        == "Precio ajustado para Teno"
    )
    assert inserted["status"] == "draft"
    assert inserted["snapshot_case_status"] == "variables_pending"

    assert result.created_borrador is True
    assert result.ready_for_borrador is True
    assert result.escritura_case_id == CASE_ID
    assert result.project_matriz_id == PROJECT_MATRIZ_ID
    assert result.borrador_matriz_id == inserted["id"]


@pytest.mark.asyncio
async def test_sale_hook_is_idempotent_and_reuses_existing_lot_draft(monkeypatch):
    store = _seed_base_store()
    create_case = AsyncMock(return_value=_case_row())
    monkeypatch.setattr(
        escritura_sale_hook, "create_escritura_case_snapshot", create_case
    )

    first = await escritura_sale_hook.handle_sale_validated_for_escritura(
        organization_id=ORG_ID,
        lot_id=LOT_ID,
        validated_by=ADMIN_ID,
        supabase=store,
    )
    second = await escritura_sale_hook.handle_sale_validated_for_escritura(
        organization_id=ORG_ID,
        lot_id=LOT_ID,
        validated_by=ADMIN_ID,
        supabase=store,
    )

    lot_matrices = [
        row
        for row in store.tables["escritura_matrices"]
        if row.get("escritura_case_id") == CASE_ID
    ]
    assert len(lot_matrices) == 1
    assert first.created_borrador is True
    assert second.created_borrador is False
    assert second.borrador_matriz_id == first.borrador_matriz_id
    assert second.project_matriz_id == PROJECT_MATRIZ_ID


@pytest.mark.asyncio
async def test_sale_hook_without_approved_project_matrix_keeps_case_in_preparation(
    monkeypatch,
):
    store = _seed_base_store()
    store.tables["escritura_matrices"][0]["status"] = "draft"
    store.tables["escritura_cases"] = [_case_row()]
    create_case = AsyncMock(return_value=store.tables["escritura_cases"][0])
    monkeypatch.setattr(
        escritura_sale_hook, "create_escritura_case_snapshot", create_case
    )

    result = await escritura_sale_hook.handle_sale_validated_for_escritura(
        organization_id=ORG_ID,
        lot_id=LOT_ID,
        validated_by=ADMIN_ID,
        supabase=store,
    )

    assert result.ready_for_borrador is False
    assert result.created_borrador is False
    assert result.borrador_matriz_id is None
    assert [
        row
        for row in store.tables["escritura_matrices"]
        if row.get("escritura_case_id") == CASE_ID
    ] == []
    case_row = store.tables["escritura_cases"][0]
    assert case_row["case_status"] == "variables_pending"
    assert case_row["readiness_status"] == "blocked"
    project_gate = case_row["readiness_gates"]["project_matriz_approved"]
    assert project_gate["status"] == "blocked"
    assert project_gate["blocking_variables"] == []


@pytest.mark.asyncio
async def test_admin_sale_approval_runs_escritura_hook(monkeypatch):
    store = FakeSupabase()
    store.tables["approval_requests"] = [
        {
            "id": "approval-sale-uuid",
            "organization_id": ORG_ID,
            "request_type": "sale",
            "sale_mode": "direct",
            "previous_lot_state": "disponible",
        }
    ]
    hook_result = escritura_sale_hook.SaleEscrituraHookResult(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        lot_id=LOT_ID,
        escritura_case_id=CASE_ID,
        project_matriz_id=PROJECT_MATRIZ_ID,
        borrador_matriz_id="00000000-0000-4000-8000-000000000008",
        created_borrador=True,
        ready_for_borrador=True,
    )
    hook = AsyncMock(return_value=hook_result)
    audit = AsyncMock()

    monkeypatch.setattr(approval_processor, "get_supabase_client", lambda: store)
    monkeypatch.setattr(
        escritura_sale_hook, "handle_sale_validated_for_escritura", hook
    )
    monkeypatch.setattr(approval_processor, "log_agent_action", audit)

    result = await approval_processor.execute_admin_decision_db(
        org_id=ORG_ID,
        approval_id="approval-sale-uuid",
        action="approve",
        admin_id=ADMIN_ID,
    )

    assert store.rpc_calls == [
        (
            "approve_sale",
            {"p_approval_id": "approval-sale-uuid", "p_admin_phone": ADMIN_ID},
        )
    ]
    hook.assert_awaited_once_with(
        organization_id=ORG_ID,
        lot_id=LOT_ID,
        validated_by=ADMIN_ID,
        supabase=store,
    )
    assert (
        result["escritura_hook"]["borrador_matriz_id"]
        == hook_result.borrador_matriz_id
    )
    assert result["escritura_hook_error"] is None
    audit_payload = audit.await_args.kwargs["payload"]
    assert audit_payload["escritura_hook"]["ready_for_borrador"] is True
    assert audit_payload["escritura_hook_error"] is None


@pytest.mark.asyncio
async def test_sale_pending_notification_uses_admin_dictionary_and_deep_link(
    monkeypatch,
):
    store = FakeSupabase()
    store.tables["approval_requests"] = [
        {
            "id": "approval-sale-uuid",
            "lot_id": LOT_ID,
            "organization_id": ORG_ID,
            "vendor_name": "Vendedora A",
            "payload": {
                "cliente_nombre": "Ana Perez",
                "cliente_run": "12.345.678-9",
                "valor_final": 24_000_000,
            },
            "request_type": "sale",
        }
    ]
    store.tables["lots"] = [
        {
            "id": LOT_ID,
            "numero_lote": "12",
            "project_id": PROJECT_ID,
            "precio": 24_000_000,
        }
    ]
    store.tables["projects"] = [
        {"id": PROJECT_ID, "name": "Teno - El Condor"}
    ]
    store.tables["organization_members"] = [
        {"organization_id": ORG_ID, "role": "admin", "user_id": ADMIN_ID}
    ]
    store.tables["profiles"] = [
        {"id": ADMIN_ID, "phone": None, "telegram_chat_id": "777001"}
    ]
    telegram_client = SimpleNamespace(send_text=AsyncMock())

    monkeypatch.setattr(approval_notifier, "get_supabase_client", lambda: store)
    monkeypatch.setattr(
        approval_notifier,
        "get_telegram_client_for_org",
        AsyncMock(return_value=telegram_client),
    )

    result = await approval_notifier.notify_admin_approval(
        {}, "approval-sale-uuid"
    )

    assert result == "SUCCESS"
    telegram_client.send_text.assert_awaited_once()
    sent_message = telegram_client.send_text.await_args.args[1]
    assert "Venta por validar" in sent_message
    assert "Validar venta" in sent_message
    assert f"http://localhost:3000/projects/{PROJECT_ID}" in sent_message
    assert "Solicitud de Venta" not in sent_message
    assert store.tables["notification_events"][0]["recipient_role"] == "admin"


@pytest.mark.asyncio
async def test_admin_is_notified_with_mesa_link_when_draft_is_ready(monkeypatch):
    store = FakeSupabase()
    store.tables["lots"] = [{"id": LOT_ID, "numero_lote": "12"}]
    store.tables["approval_requests"] = [
        {"id": "approval-sale-uuid", "vendor_id": None}
    ]
    telegram_client = SimpleNamespace(send_text=AsyncMock())
    db_result = {
        "rpc_data": {
            "success": True,
            "lot_id": LOT_ID,
            "vendor_phone": None,
            "vendor_platform": "telegram",
            "vendor_name": "Vendedora A",
        },
        "request_type": "sale",
        "escritura_hook": {
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "lot_id": LOT_ID,
            "escritura_case_id": CASE_ID,
            "project_matriz_id": PROJECT_MATRIZ_ID,
            "borrador_matriz_id": "00000000-0000-4000-8000-000000000008",
            "created_borrador": True,
            "ready_for_borrador": True,
        },
    }

    monkeypatch.setattr(approval_processor, "get_supabase_client", lambda: store)
    monkeypatch.setattr(
        approval_processor,
        "get_telegram_client_for_org",
        AsyncMock(return_value=telegram_client),
    )

    result = await approval_processor.send_decision_notifications(
        ctx={},
        org_id=ORG_ID,
        approval_id="approval-sale-uuid",
        action="approve",
        admin_id="777001",
        db_result=db_result,
    )

    assert result == "SUCCESS"
    telegram_client.send_text.assert_awaited_once()
    sent_message = telegram_client.send_text.await_args.args[1]
    assert "Borrador por revisar" in sent_message
    assert "Abrir borrador" in sent_message
    assert f"http://localhost:3000/documentos/matriz/{CASE_ID}" in sent_message
