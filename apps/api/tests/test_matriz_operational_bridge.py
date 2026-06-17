"""SDD 008 US6 tests: operational bridge mapping, derived words, idempotency.

T013: field-by-field mapping from lot_records/lots/organization_payment_info;
missing source fields stage as ``missing``.
T014: words derivations via the shared engine (pesos, superficies).
T015: idempotency per source row hash — same hash skips, changed hash
supersedes + re-proposes, human-reviewed states are never touched.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from services import escritura_operational_bridge as bridge
from services.legal_title_words import (
    hectareas_to_words,
    metros_cuadrados_to_words,
    pesos_to_words,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "matriz"

ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_ID = "00000000-0000-4000-8000-000000000003"


def _rows() -> dict:
    return json.loads(
        (FIXTURE_DIR / "teno_operational_rows.json").read_text(encoding="utf-8")
    )


def _by_key(variables) -> dict[str, bridge.BridgeVariable]:
    return {var.variable_key: var for var in variables}


# ─── T013: mapeo campo a campo ───────────────────────────────────────────────


class TestLotRecordMapping:
    def test_comprador_fields_map_from_cliente_fields(self):
        rows = _rows()
        mapping = bridge.map_lot_record_variables(
            rows["lot_record"], rows["organization_payment_info"]
        )
        by_key = _by_key(mapping.variables)
        record = rows["lot_record"]
        assert by_key["comprador.nombre"].value_text == record["cliente_nombre"]
        assert by_key["comprador.rut"].value_text == record["cliente_run"]
        assert by_key["comprador.domicilio"].value_text == record["cliente_direccion"]
        assert (
            by_key["comprador.estado_civil"].value_text
            == record["cliente_estado_civil"]
        )
        assert (
            by_key["comprador.profesion_giro"].value_text
            == record["cliente_ocupacion"]
        )
        for key in (
            "comprador.nombre",
            "comprador.rut",
            "comprador.domicilio",
            "comprador.estado_civil",
            "comprador.profesion_giro",
        ):
            assert by_key[key].source_type == "system"
            assert by_key[key].source == "lot_records"
            assert by_key[key].source_row_id == record["id"]

    def test_transaccion_fields_map_from_sale_amounts(self):
        rows = _rows()
        mapping = bridge.map_lot_record_variables(
            rows["lot_record"], rows["organization_payment_info"]
        )
        by_key = _by_key(mapping.variables)
        assert by_key["transaccion.precio_numeros"].value_json == 45000000
        assert by_key["transaccion.precio_numeros"].value_text == "45.000.000"
        assert by_key["transaccion.moneda"].value_text == "$"
        assert "saldo" in by_key["transaccion.forma_pago"].value_text
        detalle = by_key["transaccion.detalle_pago[]"].value_json
        assert [item["monto_numeros"] for item in detalle] == [15000000, 30000000]
        # La instrucción de pago de la organización entra al medio del abono.
        assert "Banco de Chile" in detalle[0]["medio"]
        assert mapping.missing_keys == ()

    def test_missing_source_fields_surface_as_missing(self):
        rows = _rows()
        mapping = bridge.map_lot_record_variables(rows["lot_record_incomplete"], None)
        assert "comprador.estado_civil" in mapping.missing_keys
        assert "comprador.domicilio" in mapping.missing_keys
        assert "comprador.profesion_giro" in mapping.missing_keys
        by_key = _by_key(mapping.variables)
        assert by_key["comprador.estado_civil"].has_value is False
        # El nombre sí existe en la variante incompleta.
        assert by_key["comprador.nombre"].has_value is True


class TestLotGeometryMapping:
    def test_geometry_fields_map_from_official_lot(self):
        lot = _rows()["lot"]
        mapping = bridge.map_lot_geometry_variables(lot)
        by_key = _by_key(mapping.variables)
        assert by_key["lote.numero"].value_text == "3"
        assert by_key["lote.numero_nombre"].value_text == "Lote N°3"
        assert by_key["lote.superficie_m2"].value_json == 5100
        assert by_key["lote.superficie_m2"].source_type == "geometry"
        assert by_key["lote.boundaries_official"].value_json == lot[
            "boundaries_official"
        ]
        assert by_key["servidumbre.aplica"].value_json is True
        assert by_key["servidumbre.superficie_m2"].value_json == 385.5
        assert mapping.missing_keys == ()

    def test_deslindes_compose_from_boundaries_official(self):
        lot = _rows()["lot"]
        mapping = bridge.map_lot_geometry_variables(lot)
        deslindes = _by_key(mapping.variables)["lote.deslindes"].value_text
        assert deslindes == (
            "al Norte, en sesenta metros, con Lote N°2 de la misma subdivisión; "
            "al Sur, en sesenta metros, con Fundo El Escudo; "
            "al Oriente, en ochenta y cinco metros, con camino interior de la subdivisión; "
            "y al Poniente, en ochenta y cinco metros, con Lote N°4 de la misma subdivisión"
        )

    def test_boundary_without_neighbor_fails_composition(self):
        lot = _rows()["lot"]
        lot["boundaries_official"][1] = {"label": "Sur", "description": ""}
        mapping = bridge.map_lot_geometry_variables(lot)
        assert _by_key(mapping.variables)["lote.deslindes"].has_value is False
        assert "lote.deslindes" in mapping.missing_keys

    def test_lot_without_servidumbre_skips_servidumbre_surface(self):
        lot = _rows()["lot"]
        lot["servidumbre_m2"] = None
        mapping = bridge.map_lot_geometry_variables(lot)
        by_key = _by_key(mapping.variables)
        assert by_key["servidumbre.aplica"].value_json is False
        assert "servidumbre.superficie_m2" not in by_key


# ─── T014: derivadas en palabras (motor compartido) ──────────────────────────


class TestSharedWordsEngine:
    def test_pesos_to_words_exact_millions(self):
        assert pesos_to_words(45000000) == "cuarenta y cinco millones de pesos"
        assert pesos_to_words(1000000) == "un millón de pesos"

    def test_pesos_to_words_non_exact_millions(self):
        assert (
            pesos_to_words(45500000)
            == "cuarenta y cinco millones quinientos mil pesos"
        )
        assert pesos_to_words(850000) == "ochocientos cincuenta mil pesos"

    def test_metros_cuadrados_to_words(self):
        assert metros_cuadrados_to_words(5100) == "cinco mil cien metros cuadrados"
        assert (
            metros_cuadrados_to_words(385.5)
            == "trescientos ochenta y cinco coma cinco metros cuadrados"
        )

    def test_hectareas_to_words(self):
        assert hectareas_to_words(0.51) == "cero coma cincuenta y uno hectáreas"
        assert hectareas_to_words(26.82) == "veintiséis coma ochenta y dos hectáreas"


class TestDerivedVariables:
    def _derived(self, rows):
        record_mapping = bridge.map_lot_record_variables(
            rows["lot_record"], rows["organization_payment_info"]
        )
        lot_mapping = bridge.map_lot_geometry_variables(rows["lot"])
        return _by_key(
            bridge.build_derived_variables(
                record_variables=record_mapping.variables,
                lot_variables=lot_mapping.variables,
            )
        )

    def test_precio_letras_derives_from_precio_numeros(self):
        derived = self._derived(_rows())
        assert (
            derived["transaccion.precio_letras"].value_text
            == "cuarenta y cinco millones de pesos"
        )
        assert derived["transaccion.precio_letras"].source_type == "derived"

    def test_superficies_derive_in_words(self):
        derived = self._derived(_rows())
        assert (
            derived["lote.superficie_texto"].value_text
            == "cinco mil cien metros cuadrados"
        )
        assert (
            derived["lote.superficie_ha_texto"].value_text
            == "cero coma cincuenta y uno hectáreas"
        )
        assert (
            derived["servidumbre.superficie_texto"].value_text
            == "trescientos ochenta y cinco coma cinco metros cuadrados"
        )

    def test_derived_inherits_parent_row_hash(self):
        rows = _rows()
        derived = self._derived(rows)
        lot_hash = bridge.map_lot_geometry_variables(rows["lot"]).variables[0].source_row_hash
        assert derived["lote.superficie_texto"].source_row_hash == lot_hash

    def test_missing_parent_produces_no_derived_value(self):
        rows = _rows()
        rows["lot_record"]["valor"] = None
        rows["lot"]["area_official_m2"] = None
        rows["lot"]["superficie_neta_m2"] = None
        derived = self._derived(rows)
        assert "transaccion.precio_letras" not in derived
        assert "lote.superficie_texto" not in derived


# ─── T015: idempotencia + estados protegidos (staging) ───────────────────────


class FakeTable:
    def __init__(self, supabase: "FakeSupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.operation = "select"
        self.payload = None
        self.filters: list[tuple[str, tuple]] = []

    def select(self, *args):
        self.operation = "select"
        self.filters.append(("select", args))
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def eq(self, *args):
        self.filters.append(("eq", args))
        return self

    def neq(self, *args):
        self.filters.append(("neq", args))
        return self

    def is_(self, *args):
        self.filters.append(("is", args))
        return self

    def in_(self, *args):
        self.filters.append(("in", args))
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, *args):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return self.supabase.execute(self)


class FakeSupabase:
    """Fake client for bridge staging: lots/lot_records/payment/variables."""

    def __init__(self, rows: dict, active_variables: list[dict] | None = None):
        self.rows = rows
        self.active_variables = active_variables or []
        self.inserted: list[dict] = []
        self.supersede_calls: list[FakeTable] = []

    def table(self, name: str) -> FakeTable:
        return FakeTable(self, name)

    def execute(self, table: FakeTable):
        if table.name == "lots":
            return SimpleNamespace(data=self.rows["lot"])
        if table.name == "lot_records":
            return SimpleNamespace(data=[self.rows["lot_record"]])
        if table.name == "organization_payment_info":
            return SimpleNamespace(data=self.rows["organization_payment_info"])
        if table.name == "variable_resolutions":
            if table.operation == "select":
                return SimpleNamespace(data=self.active_variables)
            if table.operation == "update":
                self.supersede_calls.append(table)
                return SimpleNamespace(data=[])
            if table.operation == "insert":
                self.inserted.extend(table.payload)
                return SimpleNamespace(
                    data=[
                        {**payload, "id": f"var-{index}"}
                        for index, payload in enumerate(table.payload)
                    ]
                )
        raise AssertionError(f"unexpected table {table.name}")


def _active_row(key: str, state: str, row_hash: str | None) -> dict:
    source_ref = {"source_row_hash": row_hash} if row_hash else {}
    return {
        "id": f"existing-{key}",
        "variable_key": key,
        "state": state,
        "source_ref": source_ref,
    }


def _current_hashes(rows: dict) -> tuple[str, str]:
    record_hash = (
        bridge.map_lot_record_variables(
            rows["lot_record"], rows["organization_payment_info"]
        )
        .variables[0]
        .source_row_hash
    )
    lot_hash = (
        bridge.map_lot_geometry_variables(rows["lot"]).variables[0].source_row_hash
    )
    return record_hash, lot_hash


class TestStagingIdempotency:
    @pytest.mark.asyncio
    async def test_first_run_stages_every_mapped_key(self):
        rows = _rows()
        fake = FakeSupabase(rows)
        outcome = await bridge.stage_operational_variables(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            supabase=fake,
        )
        staged_keys = {payload["variable_key"] for payload in fake.inserted}
        assert "comprador.nombre" in staged_keys
        assert "transaccion.precio_letras" in staged_keys
        assert "lote.deslindes" in staged_keys
        assert outcome.missing == ()
        assert outcome.skipped_same_hash == ()
        assert outcome.protected == ()
        # Todo lo propuesto queda en estado proposed (nunca auto-aprobado).
        assert {payload["state"] for payload in fake.inserted} == {"proposed"}

    @pytest.mark.asyncio
    async def test_same_hash_skips_without_touching_rows(self):
        rows = _rows()
        record_hash, lot_hash = _current_hashes(rows)
        active = [
            _active_row("comprador.nombre", "proposed", record_hash),
            _active_row("lote.deslindes", "proposed", lot_hash),
        ]
        fake = FakeSupabase(rows, active)
        outcome = await bridge.stage_operational_variables(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            supabase=fake,
        )
        assert "comprador.nombre" in outcome.skipped_same_hash
        assert "lote.deslindes" in outcome.skipped_same_hash
        staged_keys = {payload["variable_key"] for payload in fake.inserted}
        assert "comprador.nombre" not in staged_keys
        assert "lote.deslindes" not in staged_keys

    @pytest.mark.asyncio
    async def test_changed_hash_supersedes_and_reproposes(self):
        rows = _rows()
        active = [_active_row("comprador.nombre", "proposed", "old-hash")]
        fake = FakeSupabase(rows, active)
        outcome = await bridge.stage_operational_variables(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            supabase=fake,
        )
        assert "comprador.nombre" in outcome.superseded
        staged_keys = {payload["variable_key"] for payload in fake.inserted}
        assert "comprador.nombre" in staged_keys
        # persist_proposals emitió updates de supersesión antes del insert.
        assert fake.supersede_calls

    @pytest.mark.asyncio
    async def test_approved_values_are_never_touched(self):
        rows = _rows()
        active = [
            _active_row("comprador.nombre", "approved", "old-hash"),
            _active_row("transaccion.precio_numeros", "not_applicable", None),
        ]
        fake = FakeSupabase(rows, active)
        outcome = await bridge.stage_operational_variables(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            supabase=fake,
        )
        assert "comprador.nombre" in outcome.protected
        assert "transaccion.precio_numeros" in outcome.protected
        staged_keys = {payload["variable_key"] for payload in fake.inserted}
        assert "comprador.nombre" not in staged_keys
        assert "transaccion.precio_numeros" not in staged_keys

    @pytest.mark.asyncio
    async def test_incomplete_record_stages_missing_rows(self):
        rows = _rows()
        rows["lot_record"] = rows["lot_record_incomplete"]
        fake = FakeSupabase(rows)
        outcome = await bridge.stage_operational_variables(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            supabase=fake,
        )
        assert "comprador.estado_civil" in outcome.missing
        assert "comprador.domicilio" in outcome.missing
        states = {
            payload["variable_key"]: payload["state"] for payload in fake.inserted
        }
        assert states["comprador.estado_civil"] == "missing"
        assert states["comprador.nombre"] == "proposed"
