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
from typing import Any

import pytest

from services import escritura_operational_bridge as bridge
from services import legal_variable_catalog as catalog
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
        assert (
            by_key["comprador.nacionalidad"].value_text
            == record["cliente_nacionalidad"]
        )
        for key in (
            "comprador.nombre",
            "comprador.rut",
            "comprador.domicilio",
            "comprador.estado_civil",
            "comprador.profesion_giro",
            "comprador.nacionalidad",
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

    def test_servidumbre_width_label_maps_from_official_lot(self):
        lot = _rows()["lot"]
        lot["servidumbre_ancho_label"] = "5 y 10"
        lot["servidumbre_ancho_m"] = 5

        mapping = bridge.map_lot_geometry_variables(lot)
        by_key = _by_key(mapping.variables)

        assert by_key["servidumbre.ancho_label"].value_text == "5 y 10"
        assert by_key["servidumbre.ancho_label"].value_json == "5 y 10"
        assert by_key["servidumbre.ancho_label"].source_type == "geometry"

    def test_deslindes_compose_from_boundaries_official(self):
        """Formato oficial (espejo de deslinde-generator.ts / escritura LOTE
        29): cardinal en mayúsculas, números de lote en palabras, sufijo 'de
        la misma subdivisión' solo cuando no viene ya en la colinda, y
        'servidumbre de por medio' en el tramo con es_servidumbre."""
        lot = _rows()["lot"]
        mapping = bridge.map_lot_geometry_variables(lot)
        deslindes = _by_key(mapping.variables)["lote.deslindes"].value_text
        assert deslindes == (
            "NORTE, en sesenta metros con lote dos de la misma subdivisión; "
            "SUR, en sesenta metros con Fundo El Escudo; "
            "ORIENTE, en ochenta y cinco metros con camino interior de la "
            "subdivisión, servidumbre de por medio; "
            "y PONIENTE, en ochenta y cinco metros con lote cuatro de la misma subdivisión"
        )

    def test_deslindes_use_neighbors_metadata_and_decimal_distances(self):
        """Forma real de producción (lote 17 Teno): colinda 'lote 24' +
        neighbors_metadata, distancias con decimales. El sufijo 'de la misma
        subdivisión' se agrega porque la colinda no lo trae."""
        lot = _rows()["lot"]
        lot["boundaries_official"] = [
            {
                "label": "Surponiente",
                "colinda": "lote 24",
                "distance": 53.35,
                "es_servidumbre": False,
                "neighbors_metadata": [{"name": "lote 24", "is_partial": False}],
            },
            {
                "label": "Norte",
                "colinda": "lote 18",
                "distance": 99.07,
                "es_servidumbre": True,
                "neighbors_metadata": [{"name": "lote 18", "is_partial": True}],
            },
        ]
        mapping = bridge.map_lot_geometry_variables(lot)
        deslindes = _by_key(mapping.variables)["lote.deslindes"].value_text
        assert deslindes == (
            "SURPONIENTE, en cincuenta y tres coma treinta y cinco metros "
            "con lote veinticuatro de la misma subdivisión; "
            "y NORTE, en noventa y nueve coma cero siete metros "
            "con parte del lote dieciocho de la misma subdivisión, "
            "servidumbre de por medio"
        )

    def test_deslindes_group_consecutive_same_cardinal(self):
        lot = _rows()["lot"]
        lot["boundaries_official"] = [
            {"label": "Norte", "colinda": "lote 5", "distance": 40},
            {"label": "Norte", "colinda": "lote 6", "distance": 20},
            {"label": "Sur", "colinda": "camino público", "distance": 60},
        ]
        mapping = bridge.map_lot_geometry_variables(lot)
        deslindes = _by_key(mapping.variables)["lote.deslindes"].value_text
        assert deslindes == (
            "NORTE, en cuarenta metros con lote cinco, "
            "y en veinte metros con lote seis todos de la misma subdivisión; "
            "y SUR, en sesenta metros con camino público"
        )

    def test_servidumbre_tramo_and_dominantes_compose_for_servidumbre_lot(self):
        """Las 3 claves de la cláusula servidumbre_transito eran huérfanas
        (ningún productor) y dejaban la matriz del caso inaprobable para todo
        lote con servidumbre. Ahora las produce el puente."""
        lot = _rows()["lot"]
        mapping = bridge.map_lot_geometry_variables(lot)
        by_key = _by_key(mapping.variables)
        assert by_key["servidumbre.predio_sirviente"].value_text == "Lote N°3"
        assert (
            by_key["servidumbre.predios_dominantes"].value_text
            == "los demás lotes de la misma subdivisión"
        )
        assert by_key["servidumbre.deslindes_tramo"].value_text == (
            "franja de ocho metros de ancho a lo largo del deslinde Oriente "
            "del Lote N°3, según el trazado que consta en el plano de "
            "subdivisión archivado"
        )
        assert mapping.missing_keys == ()

    def test_servidumbre_tramo_without_flagged_boundaries_still_resolves(self):
        """Sin deslindes marcados es_servidumbre (datos pre-flag) el tramo
        igual resuelve con la referencia al plano: nunca vuelve a dejar la
        cláusula bloqueada por un dato que solo existe dibujado en el plano."""
        lot = _rows()["lot"]
        for boundary in lot["boundaries_official"]:
            boundary.pop("es_servidumbre", None)
        lot["servidumbre_ancho_label"] = None
        lot["servidumbre_ancho_m"] = 5
        mapping = bridge.map_lot_geometry_variables(lot)
        tramo = _by_key(mapping.variables)["servidumbre.deslindes_tramo"].value_text
        assert tramo == (
            "franja de cinco metros de ancho del Lote N°3, según el trazado "
            "que consta en el plano de subdivisión archivado"
        )

    def test_servidumbre_tramo_with_variable_width_label(self):
        lot = _rows()["lot"]
        lot["servidumbre_ancho_label"] = "5 y 10"
        mapping = bridge.map_lot_geometry_variables(lot)
        tramo = _by_key(mapping.variables)["servidumbre.deslindes_tramo"].value_text
        assert tramo.startswith("franja de cinco y diez metros de ancho")

    def test_lot_without_servidumbre_skips_servidumbre_clause_keys(self):
        lot = _rows()["lot"]
        lot["servidumbre_m2"] = None
        mapping = bridge.map_lot_geometry_variables(lot)
        by_key = _by_key(mapping.variables)
        for key in (
            "servidumbre.predio_sirviente",
            "servidumbre.predios_dominantes",
            "servidumbre.deslindes_tramo",
        ):
            assert key not in by_key

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


class TestBridgeKeysRegisteredInCatalog:
    """Guard de regresión: el bridge produjo servidumbre.ancho_label desde
    siempre (ver test_servidumbre_width_label_maps_from_official_lot arriba)
    pero esa clave nunca se registró en legal_variable_catalog. El mapeo
    puro nunca lo detectó porque no pasa por la validación de
    propose_variable/validate_proposal — solo se manifestaba como un 500
    real al vender un lote con servidumbre de ancho variable. Este test
    ejercita exactamente ese chequeo para las 3 tuplas del bridge."""

    def test_every_bridge_variable_key_is_a_known_catalog_key(self):
        all_bridge_keys = (
            bridge.LOT_RECORD_VARIABLE_KEYS
            + bridge.LOT_GEOMETRY_VARIABLE_KEYS
            + bridge.DERIVED_VARIABLE_KEYS
        )
        unknown = [key for key in all_bridge_keys if not catalog.is_variable_key(key)]
        assert unknown == []


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

    def test_decimals_under_ten_keep_leading_zero(self):
        """5062.07 leído como 'coma siete' significa 5062,7: en un documento
        legal el cero inicial de los decimales no se puede perder."""
        assert metros_cuadrados_to_words(5062.07) == (
            "cinco mil sesenta y dos coma cero siete metros cuadrados"
        )
        # La convención notarial ',50 → coma cinco' se mantiene.
        assert metros_cuadrados_to_words(385.5) == (
            "trescientos ochenta y cinco coma cinco metros cuadrados"
        )


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
    """Fake client for bridge staging: lots/lot_records/payment/variables.

    persist_proposals usa el RPC atómico ``batch_upsert_variable_resolutions``
    (SDD019); el fake lo simula registrando los payloads en ``inserted`` y una
    entrada en ``supersede_calls`` por invocación (el RPC hace el supersede
    en la DB).
    """

    def __init__(self, rows: dict, active_variables: list[dict] | None = None):
        self.rows = rows
        self.active_variables = active_variables or []
        self.inserted: list[dict] = []
        self.supersede_calls: list[str] = []

    def rpc(self, name: str, params: dict):
        if name != "batch_upsert_variable_resolutions":
            raise AssertionError(f"unexpected rpc {name}")
        rows = params.get("p_rows") or []
        self.inserted.extend(rows)
        self.supersede_calls.append(name)
        data = [{**p, "id": f"var-{i}"} for i, p in enumerate(rows)]

        class _RpcCall:
            def execute(self):
                return SimpleNamespace(data=data)

        return _RpcCall()

    def table(self, name: str) -> FakeTable:
        return FakeTable(self, name)

    def execute(self, table: FakeTable):
        if table.name == "lots":
            return SimpleNamespace(data=self.rows["lot"])
        if table.name == "projects":
            return SimpleNamespace(
                data=[{"id": PROJECT_ID, "organization_id": ORG_ID}]
            )
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


# ─── T006: tolerancia a maybe_single() -> None (0 filas, sin AttributeError) ──


class _RealisticMaybeSingleTable:
    """A diferencia de FakeTable/FakeSupabase (arriba), reproduce el
    comportamiento real de supabase-py: maybe_single().execute() devuelve
    None (no un objeto con .data = None) cuando hay 0 filas."""

    def __init__(self, data: Any) -> None:
        self._data = data
        self._maybe_single = False

    def select(self, *args):
        return self

    def eq(self, *args):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, *args):
        return self

    def maybe_single(self):
        self._maybe_single = True
        return self

    def execute(self):
        if self._maybe_single and self._data is None:
            return None
        return SimpleNamespace(data=self._data)


class _RealisticFakeClient:
    def __init__(self, tables: dict[str, Any]) -> None:
        self._tables = tables

    def table(self, name: str) -> _RealisticMaybeSingleTable:
        return _RealisticMaybeSingleTable(self._tables[name])


class TestFetchOperationalRowsToleratesMissingPaymentInfo:
    @pytest.mark.asyncio
    async def test_fetch_tolerates_missing_organization_payment_info(self):
        client = _RealisticFakeClient(
            {
                "lots": {"id": LOT_ID},
                "lot_records": [{"id": "rec-1"}],
                "organization_payment_info": None,
            }
        )

        lot, record, payment_info = await bridge._fetch_operational_rows(
            client=client,
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
        )

        assert lot == {"id": LOT_ID}
        assert record == {"id": "rec-1"}
        assert payment_info is None


def _active_row(
    key: str, state: str, row_hash: str | None, extractor_name: str | None = None
) -> dict:
    source_ref = {"source_row_hash": row_hash} if row_hash else {}
    return {
        "id": f"existing-{key}",
        "variable_key": key,
        "state": state,
        "source_ref": source_ref,
        "extractor_name": extractor_name,
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
        # A1-bis+A6 (bug 2026-08-13): datos ya humano-aprobados en la venta
        # se siembran 'approved' (system/geometry) o 'derived' (renders de
        # números→palabras: precio_letras, superficie_texto, etc.), NO
        # 'resolved' — la mesa del molde contaba 'resolved' como "por aprobar".        assert {payload["state"] for payload in fake.inserted} == {"approved", "derived"}
        assert {payload["approval_required"] for payload in fake.inserted} == {False}

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
    async def test_own_resolved_rows_follow_hash_rule_not_protection(self):
        """El puente stagea como resolved (SDD16), pero sus PROPIAS filas
        resolved no son revisión humana: mismo hash → skip, hash cambiado →
        supersede+re-stage. Sin esto, corregir la fuente (p. ej. deslindes
        del lote) jamás se reflejaría en el caso."""
        rows = _rows()
        record_hash, _ = _current_hashes(rows)
        active = [
            _active_row(
                "comprador.nombre",
                "resolved",
                record_hash,
                bridge.OPERATIONAL_BRIDGE_EXTRACTOR_NAME,
            ),
            _active_row(
                "lote.deslindes",
                "resolved",
                "hash-viejo-de-boundaries-anteriores",
                bridge.OPERATIONAL_BRIDGE_EXTRACTOR_NAME,
            ),
        ]
        fake = FakeSupabase(rows, active)
        outcome = await bridge.stage_operational_variables(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            supabase=fake,
        )
        assert "comprador.nombre" in outcome.skipped_same_hash
        assert "lote.deslindes" in outcome.superseded
        staged_keys = {payload["variable_key"] for payload in fake.inserted}
        assert "lote.deslindes" in staged_keys
        assert "comprador.nombre" not in staged_keys

    @pytest.mark.asyncio
    async def test_legacy_proposed_bridge_rows_upgrade_to_resolved(self):
        """Saneo pre-SDD16: una fila proposed del PROPIO puente con el mismo
        hash no se salta — se re-stagea resolved por el flujo auditado, para
        que los casos viejos (ej. lote 17 de Teno, 21 proposed) se curen
        solos al siguiente refresh del caso, sin SQL manual ni aprobaciones
        una a una."""
        rows = _rows()
        record_hash, lot_hash = _current_hashes(rows)
        active = [
            _active_row(
                "comprador.nombre",
                "proposed",
                record_hash,
                bridge.OPERATIONAL_BRIDGE_EXTRACTOR_NAME,
            ),
            _active_row(
                "lote.deslindes",
                "proposed",
                lot_hash,
                bridge.OPERATIONAL_BRIDGE_EXTRACTOR_NAME,
            ),
        ]
        fake = FakeSupabase(rows, active)
        outcome = await bridge.stage_operational_variables(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            supabase=fake,
        )
        assert "comprador.nombre" in outcome.superseded
        assert "lote.deslindes" in outcome.superseded
        states = {
            payload["variable_key"]: payload["state"] for payload in fake.inserted
        }
        assert states["comprador.nombre"] == "approved"
        assert states["lote.deslindes"] == "approved"

    @pytest.mark.asyncio
    async def test_human_resolved_rows_stay_protected(self):
        """Una fila resolved de OTRO origen (edición humana / otro extractor)
        sigue protegida aunque el hash de la fuente haya cambiado (FR-021)."""
        rows = _rows()
        active = [_active_row("comprador.nombre", "resolved", "old-hash", None)]
        fake = FakeSupabase(rows, active)
        outcome = await bridge.stage_operational_variables(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            supabase=fake,
        )
        assert "comprador.nombre" in outcome.protected
        staged_keys = {payload["variable_key"] for payload in fake.inserted}
        assert "comprador.nombre" not in staged_keys

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
        assert states["comprador.nombre"] == "approved"
