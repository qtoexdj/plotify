"""SDD 011 T007: matriz de la escritura del PROYECTO (escritura_case_id NULL).

Cubre la logica nueva: los datos de la venta son huecos por diseño (FR-002) y
NO bloquean la aprobacion (FR-003), y el snapshot de proyecto resuelve los
datos del proyecto (incluida la inyeccion SII de proyecto) sin lot_legal_data.
"""

from __future__ import annotations

import uuid
from typing import Any

from api.v1.endpoints.escritura_matrices import (
    PROJECT_MATRIZ_GAP_KEYS,
    _is_project_gap_key,
    _project_approval_blockers,
)
from services.escritura_readiness import fetch_project_matriz_snapshot
from services.matriz_token_resolution import TokenResolutionEntry


# ─── Fake Supabase minimo (stateful por tabla, soporta is_/insert) ───────────


class _FakeResult:
    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeQuery:
    def __init__(self, store: dict[str, list[dict]], table: str) -> None:
        self._store = store
        self._table = table
        self._action = "select"
        self._payload: Any = None
        self._single = False

    def select(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def insert(self, payload: Any) -> "_FakeQuery":
        self._action = "insert"
        self._payload = payload
        return self

    def eq(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def neq(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def is_(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def in_(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def order(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_FakeQuery":
        return self

    def maybe_single(self) -> "_FakeQuery":
        self._single = True
        return self

    def execute(self) -> _FakeResult:
        rows = self._store.setdefault(self._table, [])
        if self._action == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted: list[dict] = []
            for item in items:
                row = dict(item)
                row.setdefault("id", str(uuid.uuid4()))
                rows.append(row)
                inserted.append(row)
            return _FakeResult(inserted)
        if self._single:
            return _FakeResult(dict(rows[0]) if rows else None)
        return _FakeResult([dict(row) for row in rows])


class _FakeSupabase:
    def __init__(self, tables: dict[str, list[dict]]) -> None:
        self._store = {name: list(rows) for name, rows in tables.items()}

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self._store, name)


# ─── Clasificacion de huecos ──────────────────────────────────────────────────


def test_sale_and_lot_keys_are_project_gaps() -> None:
    assert _is_project_gap_key("comprador.nombre")
    assert _is_project_gap_key("comprador.rut")
    assert _is_project_gap_key("transaccion.precio_numeros")
    assert _is_project_gap_key("transaccion.detalle_pago[]")  # array normaliza
    assert _is_project_gap_key("lote.numero")
    assert _is_project_gap_key("lote.deslindes")
    assert _is_project_gap_key("transaccion.precio_letras")  # derivada


def test_project_level_keys_are_not_gaps() -> None:
    assert not _is_project_gap_key("vendedor.rut")
    assert not _is_project_gap_key("sii.rol_matriz")
    assert not _is_project_gap_key("titulo.historia_dominio")
    # Sanidad: el set no quedo vacio ni colo claves de proyecto.
    assert "comprador.nombre" in PROJECT_MATRIZ_GAP_KEYS
    assert "documento.fecha_otorgamiento" in PROJECT_MATRIZ_GAP_KEYS
    assert "vendedor.rut" not in PROJECT_MATRIZ_GAP_KEYS


# ─── Blockers de la matriz del proyecto ──────────────────────────────────────


def test_token_manifest_exposes_variable_producer() -> None:
    sale_gap = TokenResolutionEntry("comprador.nombre", "missing").to_dict()
    signing = TokenResolutionEntry("documento.fecha_otorgamiento", "missing").to_dict()
    project_data = TokenResolutionEntry("vendedor.rut", "missing").to_dict()

    assert sale_gap["producer"] == "sale_gap"
    assert signing["producer"] == "signing"
    assert project_data["producer"] == "extracted"


def test_sale_gaps_never_block_project_matriz_but_project_pendings_do() -> None:
    manifest = {
        "tokens": [
            {"variableKey": "comprador.nombre", "status": "missing", "label": "Nombre del comprador"},
            {"variableKey": "transaccion.detalle_pago[]", "status": "missing"},
            {"variableKey": "lote.numero", "status": "missing"},
            {"variableKey": "vendedor.rut", "status": "missing", "label": "RUT del vendedor"},
            {"variableKey": "sii.rol_matriz", "status": "resolved"},
        ],
        "blocks": [
            {"blockKey": "titulo.historia_dominio", "status": "missing"},
        ],
    }
    blockers = _project_approval_blockers(
        manifest=manifest, project_id="proj-1", snapshot_stale=False
    )
    keys = {blocker.get("key") for blocker in blockers}
    # Huecos de venta/lote: jamas bloquean (FR-002/FR-003).
    assert "comprador.nombre" not in keys
    assert "transaccion.detalle_pago[]" not in keys
    assert "lote.numero" not in keys
    # Pendientes reales del proyecto: si bloquean.
    assert "vendedor.rut" in keys
    assert "titulo.historia_dominio" in keys
    # Resueltos no aparecen.
    assert "sii.rol_matriz" not in keys
    # Pendiente humanizado (sin jerga cruda).
    vendedor = next(b for b in blockers if b.get("key") == "vendedor.rut")
    assert vendedor["title"]
    assert vendedor["action_label"]


def test_stale_project_snapshot_adds_blocker() -> None:
    blockers = _project_approval_blockers(
        manifest={"tokens": [], "blocks": []}, project_id="proj-1", snapshot_stale=True
    )
    assert any(b.get("kind") == "snapshot_stale" for b in blockers)


# ─── Snapshot de proyecto (sin lot_legal_data → datos de venta ausentes) ─────


async def test_project_snapshot_omits_sale_data_and_injects_project_sii() -> None:
    tables = {
        "variable_resolutions": [
            {
                "id": "v1",
                "variable_key": "vendedor.nombre",
                "state": "approved",
                "value_text": "Inmobiliaria Teno SpA",
                "value_json": None,
                "source_type": "manual",
                "source_ref": {},
                "confidence": 1.0,
                "reviewed_at": None,
            },
        ],
        "project_legal_data": [{"sii_role_matrix": "123-45", "sii_comuna": "Teno"}],
        "title_analyses": [],
        "legal_documents": [],
        "document_evidence": [],
    }
    supabase = _FakeSupabase(tables)

    snapshot, _evidence = await fetch_project_matriz_snapshot(
        organization_id="org-1", project_id="proj-1", supabase=supabase
    )

    # Dato del proyecto resuelto.
    assert "vendedor.nombre" in snapshot
    # Datos de la venta: ausentes (huecos en la mesa).
    assert "comprador.nombre" not in snapshot
    assert "transaccion.precio_numeros" not in snapshot
    assert "lote.numero" not in snapshot
    # SII de proyecto inyectado pese a no haber lot_legal_data (sin tocar el motor).
    assert snapshot["sii.rol_matriz"]["value_text"] == "123-45"
    assert snapshot["sii.rol_matriz"]["state"] == "approved"
    assert snapshot["sii.comuna"]["value_text"] == "Teno"
