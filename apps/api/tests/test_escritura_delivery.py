"""SDD 011 T016: entrega del borrador al vendedor (FR-010/FR-012).

Verifica la entrega de dos niveles (enlace web siempre + Telegram best-effort),
la auditoria en `escritura_deliveries` y que jamas falla en silencio cuando el
vendedor no tiene Telegram vinculado.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from services import escritura_delivery
from services.escritura_delivery import (
    deliver_draft,
    list_vendor_deliveries,
    renew_delivery_link,
)

GEN = {
    "id": "gen-1",
    "organization_id": "org-1",
    "project_id": "proj-1",
    "escritura_case_id": "case-1",
    "storage_path": "org-1/proj-1/case-1/minuta.docx",
}


# ─── Fakes ────────────────────────────────────────────────────────────────────


class _FakeBucket:
    def __init__(self, download_bytes: bytes | None) -> None:
        self._download_bytes = download_bytes

    def create_signed_url(self, path: str, expires_in: int) -> dict[str, str]:
        return {"signedURL": f"https://signed.example/{path}?exp={expires_in}"}

    def download(self, path: str) -> bytes | None:
        return self._download_bytes


class _FakeStorage:
    def __init__(self, bucket: _FakeBucket) -> None:
        self._bucket = bucket

    def from_(self, _name: str) -> _FakeBucket:
        return self._bucket


class _FakeResult:
    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeTable:
    """Aplica filtros eq/in_ de verdad — clave para probar el aislamiento."""

    def __init__(self, store: dict[str, list[dict]], name: str) -> None:
        self._store = store
        self._name = name
        self._action = "select"
        self._payload: Any = None
        self._filters: list[tuple[str, str, Any]] = []
        self._single = False

    def select(self, *_a: Any, **_k: Any) -> "_FakeTable":
        return self

    def eq(self, column: str, value: Any) -> "_FakeTable":
        self._filters.append(("eq", column, value))
        return self

    def in_(self, column: str, values: Any) -> "_FakeTable":
        self._filters.append(("in", column, list(values)))
        return self

    def order(self, *_a: Any, **_k: Any) -> "_FakeTable":
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_FakeTable":
        return self

    def maybe_single(self) -> "_FakeTable":
        self._single = True
        return self

    def insert(self, payload: Any) -> "_FakeTable":
        self._action = "insert"
        self._payload = payload
        return self

    def update(self, payload: Any) -> "_FakeTable":
        self._action = "update"
        self._payload = payload
        return self

    def _matches(self, row: dict[str, Any]) -> bool:
        for kind, column, value in self._filters:
            if kind == "eq" and row.get(column) != value:
                return False
            if kind == "in" and row.get(column) not in value:
                return False
        return True

    def execute(self) -> _FakeResult:
        rows = self._store.setdefault(self._name, [])
        if self._action == "insert":
            row = dict(self._payload)
            row["id"] = str(uuid.uuid4())
            rows.append(row)
            return _FakeResult([row])
        matched = [row for row in rows if self._matches(row)]
        if self._action == "update":
            for row in matched:
                row.update(self._payload)
            return _FakeResult([dict(row) for row in matched])
        if self._single:
            return _FakeResult(dict(matched[0]) if matched else None)
        return _FakeResult([dict(row) for row in matched])


class _FakeSupabase:
    def __init__(self, *, profiles: list[dict] | None = None, download_bytes: bytes | None = b"DOCX") -> None:
        self._store: dict[str, list[dict]] = {
            "profiles": profiles or [],
            "escritura_deliveries": [],
        }
        self.storage = _FakeStorage(_FakeBucket(download_bytes))

    def table(self, name: str) -> _FakeTable:
        return _FakeTable(self._store, name)

    @property
    def deliveries(self) -> list[dict]:
        return self._store["escritura_deliveries"]


class _FakeTelegram:
    def __init__(self, doc_result: Any = "ok") -> None:
        self._doc_result = {"ok": True} if doc_result == "ok" else doc_result
        self.sent_documents: list[dict] = []
        self.sent_texts: list[dict] = []

    async def send_document(self, chat_id: str, *, document_bytes: bytes, filename: str, caption: str | None = None) -> Any:
        self.sent_documents.append({"chat_id": chat_id, "filename": filename, "caption": caption})
        return self._doc_result

    async def send_text(self, chat_id: str, text: str, reply_markup: Any = None) -> Any:
        self.sent_texts.append({"chat_id": chat_id, "text": text})
        return {"ok": True}


def _patch_client(monkeypatch: Any, client: Any) -> None:
    async def _get(_org_id: str) -> Any:
        return client

    monkeypatch.setattr(escritura_delivery, "get_telegram_client_for_org", _get)


# ─── Tests ────────────────────────────────────────────────────────────────────


async def test_deliver_draft_sends_telegram_and_web_when_linked(monkeypatch: Any) -> None:
    fake_tg = _FakeTelegram()
    _patch_client(monkeypatch, fake_tg)
    supabase = _FakeSupabase(profiles=[{"id": "vendor-1", "telegram_chat_id": "999"}])

    outcome = await deliver_draft(
        supabase=supabase, generation=GEN, recipient_user_id="vendor-1", lot_label="Lote 5"
    )

    assert outcome.telegram_sent is True
    assert outcome.web_available is True
    assert outcome.recipient_has_telegram is True
    channels = {d["channel"]: d["status"] for d in supabase.deliveries}
    assert channels == {"web": "sent", "telegram": "sent"}
    assert len(fake_tg.sent_documents) == 1
    assert "Borrador sujeto a revisión legal" in fake_tg.sent_documents[0]["caption"]


async def test_deliver_draft_never_silent_without_telegram(monkeypatch: Any) -> None:
    fake_tg = _FakeTelegram()
    _patch_client(monkeypatch, fake_tg)
    supabase = _FakeSupabase(profiles=[{"id": "vendor-1", "telegram_chat_id": None}])

    outcome = await deliver_draft(
        supabase=supabase, generation=GEN, recipient_user_id="vendor-1", lot_label="Lote 5"
    )

    assert outcome.recipient_has_telegram is False
    assert outcome.telegram_sent is False
    assert outcome.web_available is True
    channels = {d["channel"]: d["status"] for d in supabase.deliveries}
    assert channels["telegram"] == "unavailable"  # registrado, jamas en silencio
    assert channels["web"] == "sent"
    assert fake_tg.sent_documents == []


async def test_deliver_draft_records_failed_telegram_but_keeps_web(monkeypatch: Any) -> None:
    fake_tg = _FakeTelegram(doc_result=None)  # el envio falla
    _patch_client(monkeypatch, fake_tg)
    supabase = _FakeSupabase(profiles=[{"id": "vendor-1", "telegram_chat_id": "999"}])

    outcome = await deliver_draft(
        supabase=supabase, generation=GEN, recipient_user_id="vendor-1", lot_label="Lote 5"
    )

    channels = {d["channel"]: d["status"] for d in supabase.deliveries}
    assert channels["telegram"] == "failed"
    assert channels["web"] == "sent"
    assert outcome.telegram_sent is False


async def test_delivery_audits_token_and_expires_in_seven_days(monkeypatch: Any) -> None:
    _patch_client(monkeypatch, _FakeTelegram())
    supabase = _FakeSupabase(profiles=[{"id": "vendor-1", "telegram_chat_id": "999"}])

    await deliver_draft(
        supabase=supabase, generation=GEN, recipient_user_id="vendor-1", lot_label="Lote 5"
    )

    web = next(d for d in supabase.deliveries if d["channel"] == "web")
    # Auditoria completa (FR-012): a quién, generación, enlace, vencimiento.
    assert web["recipient_user_id"] == "vendor-1"
    assert web["generation_id"] == "gen-1"
    assert web["link_token"]
    delta = datetime.fromisoformat(web["link_expires_at"]) - datetime.now(timezone.utc)
    assert timedelta(days=6, hours=23) < delta <= timedelta(days=7)


# ─── Aislamiento por vendedor "mis documentos" (FR-011 / SC-005) ─────────────


def _delivery_row(*, did: str, gen: str, case: str, recipient: str, status: str = "sent", days: int = 7) -> dict:
    return {
        "id": did,
        "organization_id": "org-1",
        "project_id": "proj-1",
        "escritura_case_id": case,
        "generation_id": gen,
        "recipient_user_id": recipient,
        "channel": "web",
        "link_token": f"tok-{did}",
        "link_expires_at": (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(),
        "status": status,
        "sent_at": None,
        "created_at": "2026-06-16T00:00:00+00:00",
    }


def _supabase_with_deliveries(deliveries: list[dict]) -> _FakeSupabase:
    supabase = _FakeSupabase()
    supabase._store["escritura_deliveries"] = list(deliveries)
    supabase._store["escritura_minuta_generations"] = [
        {
            "id": d["generation_id"],
            "organization_id": "org-1",
            "storage_path": f"{d['generation_id']}.docx",
        }
        for d in deliveries
    ]
    return supabase


async def test_list_vendor_deliveries_isolates_by_vendor() -> None:
    supabase = _supabase_with_deliveries(
        [
            _delivery_row(did="d-a", gen="gen-a", case="case-a", recipient="vendor-a"),
            _delivery_row(did="d-b", gen="gen-b", case="case-b", recipient="vendor-b"),
        ]
    )

    a_views = await list_vendor_deliveries(
        supabase, recipient_user_id="vendor-a", organization_id="org-1"
    )

    assert {v["id"] for v in a_views} == {"d-a"}
    assert all(v["recipient_user_id"] == "vendor-a" for v in a_views)
    # Vendor A jamas ve la venta de B (SC-005).
    assert all(v["escritura_case_id"] != "case-b" for v in a_views)
    # El link_token crudo nunca viaja en el contrato.
    assert all("link_token" not in v for v in a_views)
    # Descarga firmada resuelta + estado humano.
    assert a_views[0]["download_url"]
    assert a_views[0]["status_label"] == "Entregada"


async def test_list_vendor_deliveries_marks_expired_link() -> None:
    supabase = _supabase_with_deliveries(
        [_delivery_row(did="d-a", gen="gen-a", case="case-a", recipient="vendor-a", days=-1)]
    )
    views = await list_vendor_deliveries(
        supabase, recipient_user_id="vendor-a", organization_id="org-1"
    )
    assert views[0]["status"] == "expired"
    assert views[0]["status_label"] == "Enlace vencido"
    assert views[0]["download_url"] is None  # vencido: sin descarga hasta renovar


async def test_renew_link_rejects_other_vendor_but_allows_owner() -> None:
    supabase = _supabase_with_deliveries(
        [_delivery_row(did="d-b", gen="gen-b", case="case-b", recipient="vendor-b", status="expired", days=-1)]
    )
    # Vendor A no puede renovar (ni tocar) la entrega de B.
    assert (
        await renew_delivery_link(
            supabase, delivery_id="d-b", recipient_user_id="vendor-a", organization_id="org-1"
        )
        is None
    )
    # Vendor B renueva la suya: enlace nuevo, estado "sent", descarga disponible.
    renewed = await renew_delivery_link(
        supabase, delivery_id="d-b", recipient_user_id="vendor-b", organization_id="org-1"
    )
    assert renewed is not None
    assert renewed["status"] == "sent"
    assert renewed["download_url"]
    assert "link_token" not in renewed


# ─── Wiring accept → vendedor asignado (US4) ─────────────────────────────────


async def test_resolve_case_vendor_user_id_chains_lot_to_vendor() -> None:
    from api.v1.endpoints.escritura_matrices import _resolve_case_vendor_user_id

    supabase = _FakeSupabase()
    supabase._store["approval_requests"] = [
        {
            "id": "ar-1",
            "organization_id": "org-1",
            "lot_id": "lot-1",
            "request_type": "sale",
            "vendor_id": "vend-1",
            "created_at": "2026-06-16T00:00:00+00:00",
        }
    ]
    supabase._store["vendors"] = [
        {"id": "vend-1", "organization_id": "org-1", "user_id": "user-vendor-1"}
    ]

    result = await _resolve_case_vendor_user_id(
        supabase, {"organization_id": "org-1", "lot_id": "lot-1"}
    )
    assert result == "user-vendor-1"


async def test_resolve_case_vendor_returns_none_without_sale() -> None:
    from api.v1.endpoints.escritura_matrices import _resolve_case_vendor_user_id

    supabase = _FakeSupabase()  # sin approval_requests ni vendors
    result = await _resolve_case_vendor_user_id(
        supabase, {"organization_id": "org-1", "lot_id": "lot-1"}
    )
    assert result is None


def test_delivery_sent_label_derives_from_flow_dictionary() -> None:
    """T019 (FR-014): "Entregada" del vendedor deriva del diccionario de flujo."""
    from services.escritura_delivery import delivery_status_label
    from services.legal_microcopy import flow_state_label

    assert delivery_status_label("sent") == flow_state_label("delivered") == "Entregada"
