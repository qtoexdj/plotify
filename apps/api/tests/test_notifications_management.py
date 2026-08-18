"""Tests de gestión completa de notificaciones (SDD 021).

Cubre el descarte (soft-dismiss), la lectura masiva (read-all) y la
paginación/conteos del listado. Usa fakes encadenables de Supabase.
"""
from types import SimpleNamespace

import pytest

ORG_N = "00000000-0000-4000-8000-000000000001"
ADMIN_N = "00000000-0000-4000-8000-000000000002"
VENDOR_N = "00000000-0000-4000-8000-000000000003"
OTHER_N = "00000000-0000-4000-8000-000000000004"
NOTIF_OWN = "00000000-0000-4000-8000-000000000011"
NOTIF_AJENA = "00000000-0000-4000-8000-000000000012"
NOTIF_VENDOR = "00000000-0000-4000-8000-000000000013"
APPROVAL_N = "00000000-0000-4000-8000-00000000000a"


class _FakeQuery:
    """Fake encadenable de supabase-py con mutación in-place por tabla."""

    def __init__(self, table_name, tables):
        self._table_name = table_name
        self._tables = tables
        self._touched = tables.setdefault("_touched", set())
        self._touched.add(table_name)
        self._filters = []
        self._is_filters = []
        self._orderings = []
        self._range_bounds = None
        self._action = "select"
        self._payload = None

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def is_(self, column, value):
        self._is_filters.append((column, value))
        return self

    def limit(self, _count):
        return self

    def order(self, column, desc=False):
        self._orderings.append((column, bool(desc)))
        return self

    def range(self, start, end):
        self._range_bounds = (start, end)
        return self

    def update(self, payload):
        self._action = "update"
        self._payload = payload
        return self

    def insert(self, payload):
        self._action = "insert"
        self._payload = payload
        return self

    def _matches(self, row):
        if not all(str(row.get(c)) == str(v) for c, v in self._filters):
            return False
        for column, value in self._is_filters:
            if value == "null" and row.get(column) is not None:
                return False
            if value == "not.null" and row.get(column) is None:
                return False
        return True

    def execute(self):
        rows = self._tables[self._table_name]
        matched = [row for row in rows if self._matches(row)]
        if self._action == "update":
            for row in matched:
                row.update(dict(self._payload))
            return SimpleNamespace(data=list(matched))
        if self._action == "insert":
            return SimpleNamespace(data=[dict(self._payload)])
        for column, desc in reversed(self._orderings):
            matched.sort(key=lambda row: str(row.get(column) or ""), reverse=desc)
        if self._range_bounds is not None:
            start, end = self._range_bounds
            matched = matched[start : end + 1]
        return SimpleNamespace(data=list(matched))


class _FakeSupabase:
    def __init__(self, tables):
        self.tables = tables

    def table(self, table_name):
        return _FakeQuery(table_name, self.tables)


def _base_tables():
    return {
        "organization_members": [
            {"organization_id": ORG_N, "user_id": ADMIN_N, "role": "admin"},
            {"organization_id": ORG_N, "user_id": VENDOR_N, "role": "user"},
        ],
        "vendors": [
            {
                "id": "00000000-0000-4000-8000-00000000000b",
                "user_id": VENDOR_N,
                "organization_id": ORG_N,
                "active": True,
            }
        ],
        "notification_events": [
            _notif_row(
                NOTIF_OWN,
                ADMIN_N,
                "admin",
                "2026-08-14T10:00:00Z",
                status_val="pending",
            ),
            _notif_row(
                NOTIF_AJENA,
                OTHER_N,
                "admin",
                "2026-08-14T10:01:00Z",
                status_val="pending",
            ),
            _notif_row(
                NOTIF_VENDOR,
                VENDOR_N,
                "vendor",
                "2026-08-14T10:02:00Z",
                status_val="approved",
            ),
        ],
    }


def _notif_row(
    notif_id,
    recipient_id,
    recipient_role,
    created_at,
    status_val="pending",
    read_at=None,
    dismissed_at=None,
):
    return {
        "id": notif_id,
        "approval_id": APPROVAL_N,
        "organization_id": ORG_N,
        "recipient_id": recipient_id,
        "recipient_role": recipient_role,
        "read_at": read_at,
        "dismissed_at": dismissed_at,
        "delivery_channel": "web",
        "delivery_status": "pending",
        "created_at": created_at,
        "approval_requests": {
            "id": APPROVAL_N,
            "request_type": "sale",
            "status": status_val,
            "vendor_name": "Vendedora A",
            "payload": {"cliente_nombre": "Ana Perez"},
            "resolved_at": None,
            "lot_id": "00000000-0000-4000-8000-000000000005",
            "lots": {
                "id": "00000000-0000-4000-8000-000000000005",
                "numero_lote": 12,
                "projects": {
                    "id": "00000000-0000-4000-8000-000000000006",
                    "name": "Teno - El Condor",
                },
            },
        },
    }


def _monkeypatch_supabase(monkeypatch, tables):
    from api.v1.endpoints import notifications as notif_endpoint

    supabase = _FakeSupabase(tables)
    monkeypatch.setattr(notif_endpoint, "get_supabase_client", lambda: supabase)
    return supabase


# ---------------------------------------------------------------------------
# US1: Descartar (soft-dismiss)
# ---------------------------------------------------------------------------


async def test_dismiss_admin_success(monkeypatch):
    """Un admin puede descartar una notificación admin de su org (FR-001/004)."""
    from api.v1.endpoints.notifications import dismiss_notification

    tables = _base_tables()
    supabase = _monkeypatch_supabase(monkeypatch, tables)

    response = await dismiss_notification(
        notification_id=NOTIF_OWN, x_user_id=ADMIN_N
    )

    assert response.success is True
    assert response.dismissed_at
    dismissed = [
        row
        for row in tables["notification_events"]
        if row["id"] == NOTIF_OWN
    ][0]
    assert dismissed["dismissed_at"] == response.dismissed_at
    assert dismissed["read_at"] is None
    # FR-004: el descarte no altera el proceso de aprobación — la solicitud
    # nunca es consultada ni modificada por este flujo.
    assert "approval_requests" not in supabase.tables["_touched"]


async def test_dismiss_vendor_own_success(monkeypatch):
    """Un vendedor puede descartar solo sus propias notificaciones (FR-004)."""
    from api.v1.endpoints.notifications import dismiss_notification

    tables = _base_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    response = await dismiss_notification(
        notification_id=NOTIF_VENDOR, x_user_id=VENDOR_N
    )

    assert response.success is True
    dismissed = [
        row
        for row in tables["notification_events"]
        if row["id"] == NOTIF_VENDOR
    ][0]
    assert dismissed["dismissed_at"] == response.dismissed_at


async def test_dismiss_other_notification_forbidden(monkeypatch):
    """Vendedor NO puede descartar notificación ajena → 403 sin efectos."""
    from fastapi import HTTPException
    from api.v1.endpoints.notifications import dismiss_notification

    tables = _base_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    with pytest.raises(HTTPException) as exc_info:
        await dismiss_notification(
            notification_id=NOTIF_AJENA, x_user_id=VENDOR_N
        )
    assert exc_info.value.status_code == 403
    row = [
        row for row in tables["notification_events"] if row["id"] == NOTIF_AJENA
    ][0]
    assert row["dismissed_at"] is None


async def test_dismiss_admin_cannot_dismiss_vendor_notification(monkeypatch):
    """Admin solo descarta filas admin de su org (alineado con list/read-all)."""
    from fastapi import HTTPException
    from api.v1.endpoints.notifications import dismiss_notification

    tables = _base_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    with pytest.raises(HTTPException) as exc_info:
        await dismiss_notification(
            notification_id=NOTIF_VENDOR, x_user_id=ADMIN_N
        )
    assert exc_info.value.status_code == 403
    row = [
        row for row in tables["notification_events"] if row["id"] == NOTIF_VENDOR
    ][0]
    assert row["dismissed_at"] is None


async def test_dismiss_not_found(monkeypatch):
    from fastapi import HTTPException
    from api.v1.endpoints.notifications import dismiss_notification

    tables = _base_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    with pytest.raises(HTTPException) as exc_info:
        await dismiss_notification(
            notification_id="00000000-0000-4000-8000-000000000099",
            x_user_id=ADMIN_N,
        )
    assert exc_info.value.status_code == 404


async def test_dismiss_invalid_uuid(monkeypatch):
    from fastapi import HTTPException
    from api.v1.endpoints.notifications import dismiss_notification

    tables = _base_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    with pytest.raises(HTTPException) as exc_info:
        await dismiss_notification(notification_id="no-uuid", x_user_id=ADMIN_N)
    assert exc_info.value.status_code == 400


async def test_dismiss_idempotent_keeps_original_timestamp(monkeypatch):
    """Doble dismiss no reescribe la marca (edge case doble clic)."""
    from api.v1.endpoints.notifications import dismiss_notification

    tables = _base_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    first = await dismiss_notification(
        notification_id=NOTIF_OWN, x_user_id=ADMIN_N
    )
    second = await dismiss_notification(
        notification_id=NOTIF_OWN, x_user_id=ADMIN_N
    )

    assert second.dismissed_at == first.dismissed_at
    row = [
        row for row in tables["notification_events"] if row["id"] == NOTIF_OWN
    ][0]
    assert row["dismissed_at"] == first.dismissed_at


# ---------------------------------------------------------------------------
# US4: Lectura masiva (read-all)
# ---------------------------------------------------------------------------


async def test_read_all_admin_single_operation(monkeypatch):
    """read-all marca todas las admin no leídas de la org en una operación."""
    from api.v1.endpoints.notifications import mark_all_notifications_read

    tables = _base_tables()
    tables["notification_events"][0]["read_at"] = None
    tables["notification_events"][1]["read_at"] = None
    tables["notification_events"][2]["read_at"] = None
    _monkeypatch_supabase(monkeypatch, tables)

    response = await mark_all_notifications_read(
        x_user_id=ADMIN_N, x_organization_id=ORG_N
    )

    assert response.success is True
    assert response.updated_count == 2  # solo las admin (NOTIF_OWN, NOTIF_AJENA)
    unread_admin = [
        row
        for row in tables["notification_events"]
        if row["recipient_role"] == "admin" and row["read_at"] is None
    ]
    assert unread_admin == []


async def test_read_all_vendor_marks_only_own(monkeypatch):
    from api.v1.endpoints.notifications import mark_all_notifications_read

    tables = _base_tables()
    tables["notification_events"][0]["read_at"] = None
    tables["notification_events"][1]["read_at"] = None
    tables["notification_events"][2]["read_at"] = None
    _monkeypatch_supabase(monkeypatch, tables)

    response = await mark_all_notifications_read(
        x_user_id=VENDOR_N, x_organization_id=ORG_N
    )

    assert response.updated_count == 1
    row = [
        row for row in tables["notification_events"] if row["id"] == NOTIF_VENDOR
    ][0]
    assert row["read_at"] is not None
    admin_rows = [
        row
        for row in tables["notification_events"]
        if row["recipient_role"] == "admin"
    ]
    assert all(row["read_at"] is None for row in admin_rows)


async def test_read_all_excludes_dismissed(monkeypatch):
    """Las descartadas no se marcan ni se cuentan (FR-003)."""
    from api.v1.endpoints.notifications import mark_all_notifications_read

    tables = _base_tables()
    tables["notification_events"][0]["read_at"] = None
    tables["notification_events"][0]["dismissed_at"] = "2026-08-14T09:00:00Z"
    tables["notification_events"][1]["read_at"] = None
    _monkeypatch_supabase(monkeypatch, tables)

    response = await mark_all_notifications_read(
        x_user_id=ADMIN_N, x_organization_id=ORG_N
    )

    assert response.updated_count == 1
    dismissed_row = tables["notification_events"][0]
    assert dismissed_row["read_at"] is None


async def test_read_all_idempotent(monkeypatch):
    """Segunda llamada sin no-leídas → updated_count 0."""
    from api.v1.endpoints.notifications import mark_all_notifications_read

    tables = _base_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    await mark_all_notifications_read(x_user_id=ADMIN_N, x_organization_id=ORG_N)
    response = await mark_all_notifications_read(
        x_user_id=ADMIN_N, x_organization_id=ORG_N
    )

    assert response.updated_count == 0


async def test_read_all_non_member_forbidden(monkeypatch):
    from fastapi import HTTPException
    from api.v1.endpoints.notifications import mark_all_notifications_read

    tables = _base_tables()
    tables["organization_members"] = []
    _monkeypatch_supabase(monkeypatch, tables)

    with pytest.raises(HTTPException) as exc_info:
        await mark_all_notifications_read(
            x_user_id=OTHER_N, x_organization_id=ORG_N
        )
    assert exc_info.value.status_code == 403


async def test_read_all_invalid_uuid(monkeypatch):
    from fastapi import HTTPException
    from api.v1.endpoints.notifications import mark_all_notifications_read

    tables = _base_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    with pytest.raises(HTTPException) as exc_info:
        await mark_all_notifications_read(
            x_user_id="no-uuid", x_organization_id=ORG_N
        )
    assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# Listado: descarte excluido, conteos globales y paginación (US1/US2/US6)
# ---------------------------------------------------------------------------


async def test_list_excludes_dismissed_from_items_and_counts(monkeypatch):
    """FR-003: descartadas fuera del listado y de los conteos."""
    from api.v1.endpoints.notifications import list_notifications

    tables = _base_tables()
    tables["notification_events"][1]["dismissed_at"] = "2026-08-14T09:00:00Z"
    _monkeypatch_supabase(monkeypatch, tables)

    response = await list_notifications(
        x_user_id=ADMIN_N, x_organization_id=ORG_N, limit=50, offset=0
    )

    ids = [item.id for item in response.items]
    assert NOTIF_AJENA not in ids
    assert NOTIF_OWN in ids
    assert response.counts.pending == 1


async def test_list_pagination(monkeypatch):
    """FR-011: limit/offset aplican al listado; conteos globales intactos."""
    from api.v1.endpoints.notifications import list_notifications

    tables = _base_tables()
    rows = []
    for idx in range(55):
        rows.append(
            _notif_row(
                f"00000000-0000-4000-8000-{idx:012d}",
                ADMIN_N,
                "admin",
                f"2026-08-01T10:{idx % 60:02d}:00Z",
                status_val="pending",
            )
        )
    tables["notification_events"] = rows
    _monkeypatch_supabase(monkeypatch, tables)

    page1 = await list_notifications(
        x_user_id=ADMIN_N, x_organization_id=ORG_N, limit=50, offset=0
    )
    page2 = await list_notifications(
        x_user_id=ADMIN_N, x_organization_id=ORG_N, limit=50, offset=50
    )

    assert len(page1.items) == 50
    assert len(page2.items) == 5
    assert page1.counts.pending == 55
    assert page2.counts.pending == 55
    ids_page1 = [item.id for item in page1.items]
    ids_page2 = [item.id for item in page2.items]
    assert not set(ids_page1) & set(ids_page2)


# ---------------------------------------------------------------------------
# Aislamiento cross-tenant (FR-005): un miembro de OTRA organización no puede
# leer ni mutar notificaciones de esta organización, aunque sea admin en la
# suya. La membresía se valida contra la organización del recurso consultado.
# ---------------------------------------------------------------------------

ORG_B = "00000000-0000-4000-8000-000000000021"
ADMIN_B = "00000000-0000-4000-8000-000000000022"


def _cross_org_tables():
    tables = _base_tables()
    tables["organization_members"].append(
        {"organization_id": ORG_B, "user_id": ADMIN_B, "role": "admin"}
    )
    return tables


async def test_list_member_of_other_org_forbidden(monkeypatch):
    """FR-005: listar notificaciones de una org ajena → 403 aunque el usuario
    sea admin de su propia organización."""
    from fastapi import HTTPException
    from api.v1.endpoints.notifications import list_notifications

    tables = _cross_org_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    with pytest.raises(HTTPException) as exc_info:
        await list_notifications(
            x_user_id=ADMIN_B, x_organization_id=ORG_N, limit=50, offset=0
        )
    assert exc_info.value.status_code == 403


async def test_dismiss_member_of_other_org_forbidden(monkeypatch):
    """FR-005: descartar una notificación de una org ajena → 403 sin efectos."""
    from fastapi import HTTPException
    from api.v1.endpoints.notifications import dismiss_notification

    tables = _cross_org_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    with pytest.raises(HTTPException) as exc_info:
        await dismiss_notification(notification_id=NOTIF_OWN, x_user_id=ADMIN_B)
    assert exc_info.value.status_code == 403
    row = [
        row for row in tables["notification_events"] if row["id"] == NOTIF_OWN
    ][0]
    assert row["dismissed_at"] is None


async def test_mark_read_member_of_other_org_forbidden(monkeypatch):
    """FR-005: marcar leída una notificación de una org ajena → 403 sin efectos."""
    from fastapi import HTTPException
    from api.v1.endpoints.notifications import mark_notification_read

    tables = _cross_org_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    with pytest.raises(HTTPException) as exc_info:
        await mark_notification_read(notification_id=NOTIF_OWN, x_user_id=ADMIN_B)
    assert exc_info.value.status_code == 403
    row = [
        row for row in tables["notification_events"] if row["id"] == NOTIF_OWN
    ][0]
    assert row["read_at"] is None


async def test_read_all_member_of_other_org_forbidden(monkeypatch):
    """FR-005: read-all sobre una org ajena → 403 sin efectos."""
    from fastapi import HTTPException
    from api.v1.endpoints.notifications import mark_all_notifications_read

    tables = _cross_org_tables()
    _monkeypatch_supabase(monkeypatch, tables)

    with pytest.raises(HTTPException) as exc_info:
        await mark_all_notifications_read(
            x_user_id=ADMIN_B, x_organization_id=ORG_N
        )
    assert exc_info.value.status_code == 403
    unread = [
        row
        for row in tables["notification_events"]
        if row["read_at"] is None and row["organization_id"] == ORG_N
    ]
    assert len(unread) == 3
