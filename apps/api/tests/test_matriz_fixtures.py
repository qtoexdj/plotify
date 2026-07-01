"""SDD 008 T005: coherence checks for the matriz fixtures.

The fixtures are the golden contract for the rest of the feature: every
snapshot key must exist in the canonical catalog, every template token must
reference a catalog key or an allowed derived presentation key (research
D11), and every value pre-rendered in words must match the shared engine
``services/legal_title_words.py`` exactly.
"""

from __future__ import annotations

import json
from pathlib import Path

from services import legal_variable_catalog as catalog
from services.legal_title_words import number_to_words_spanish

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "matriz"

# Research D11: presentation keys composed at render time by the resolver;
# valid inside templates but never stored in the catalog/snapshot.
DERIVED_PRESENTATION_KEYS = frozenset(
    {
        "vendedor.representantes_texto",
        "proyecto.nombre",
    }
)
ITEM_KEY_PREFIX = "item."

TITULO_SNAPSHOT_FIELDS = {
    "estructura",
    "inscripciones",
    "propietarios",
    "comparecencia_vendedor_texto",
    "clausula_primero_texto",
    "alertas_resueltas",
}


def _load(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def _iter_nodes(node: dict):
    yield node
    for child in node.get("content") or []:
        if isinstance(child, dict):
            yield from _iter_nodes(child)


class TestTenoCaseSnapshotFixture:
    def test_snapshot_keys_belong_to_catalog(self):
        snapshot = _load("teno_case_snapshot.json")["variable_snapshot"]
        unknown = [
            key
            for key in snapshot
            if key != "titulo" and not catalog.is_variable_key(key)
        ]
        assert unknown == []

    def test_titulo_group_has_sdd009_contract_shape(self):
        titulo = _load("teno_case_snapshot.json")["variable_snapshot"]["titulo"]
        assert TITULO_SNAPSHOT_FIELDS <= set(titulo)
        assert titulo["estructura"] == "compra_derechos"
        assert len(titulo["inscripciones"]) == 2
        assert titulo["clausula_primero_texto"].startswith("PRIMERO:")
        resolutions = {
            alert["tipo"]: alert["resolution"] for alert in titulo["alertas_resueltas"]
        }
        assert resolutions["dl_3516"] == "clause_added"
        assert resolutions["vigente_en_el_resto"] == "dismissed_with_reason"

    def test_no_blocking_states_in_clean_snapshot(self):
        snapshot = _load("teno_case_snapshot.json")["variable_snapshot"]
        blocking = {
            key: entry["state"]
            for key, entry in snapshot.items()
            if key != "titulo"
            and entry["state"] in catalog.VARIABLE_BLOCKING_STATES
        }
        assert blocking == {}

    def test_derived_word_values_match_shared_engine(self):
        snapshot = _load("teno_case_snapshot.json")["variable_snapshot"]
        precio = snapshot["transaccion.precio_numeros"]["value_json"]
        assert (
            snapshot["transaccion.precio_letras"]["value_text"]
            == f"{number_to_words_spanish(precio)} de pesos"
        )
        assert snapshot["lote.superficie_texto"]["value_text"] == (
            f"{number_to_words_spanish(5100)} metros cuadrados"
        )
        for item in snapshot["transaccion.detalle_pago[]"]["value_json"]:
            assert item["monto_letras"] == (
                f"{number_to_words_spanish(item['monto_numeros'])} de pesos"
            )

    def test_evidence_snapshot_entries_have_viewer_fields(self):
        evidence = _load("teno_case_snapshot.json")["evidence_snapshot"]
        assert evidence
        for refs in evidence.values():
            for ref in refs:
                assert ref["legal_document_id"]
                assert ref["page_number"] >= 1
                assert ref["snippet"]


class TestOperationalRowsFixture:
    def test_boundaries_official_uses_production_shape(self):
        lot = _load("teno_operational_rows.json")["lot"]
        labels = [boundary["label"] for boundary in lot["boundaries_official"]]
        assert labels == ["Norte", "Sur", "Oriente", "Poniente"]
        for boundary in lot["boundaries_official"]:
            assert "colinda" in boundary and "distance" in boundary

    def test_sale_record_carries_bridge_source_fields(self):
        rows = _load("teno_operational_rows.json")
        record = rows["lot_record"]
        for field in (
            "cliente_nombre",
            "cliente_run",
            "cliente_direccion",
            "cliente_estado_civil",
            "cliente_ocupacion",
            "valor",
            "abono",
            "saldo",
        ):
            assert record[field] is not None
        incomplete = rows["lot_record_incomplete"]
        assert incomplete["cliente_estado_civil"] is None
        assert incomplete["cliente_direccion"] is None


class TestGoldenTemplateFixture:
    def test_clause_inventory(self):
        template = _load("golden_template_clauses.json")
        clauses = template["clauses"]
        assert len(clauses) == 20
        positions = [clause["position"] for clause in clauses]
        assert positions == sorted(positions) and len(set(positions)) == len(positions)
        keys = [clause["clause_key"] for clause in clauses]
        assert len(set(keys)) == len(keys)
        by_key = {clause["clause_key"]: clause for clause in clauses}
        assert by_key["comparecencia"]["fixed_position"] is True
        assert by_key["antecedentes_dominio"]["fixed_position"] is True

    def test_clause_2_is_titulo_block_only(self):
        template = _load("golden_template_clauses.json")
        clause = next(
            c for c in template["clauses"] if c["clause_key"] == "antecedentes_dominio"
        )
        content = clause["content_json"]["content"]
        assert len(content) == 1
        assert content[0]["type"] == "block_token"
        assert content[0]["attrs"]["blockKey"] == "titulo.clausula_primero_texto"

    def test_no_removed_catalog_keys(self):
        clauses = json.dumps(_load("golden_template_clauses.json")["clauses"])
        assert "matriz.inscripcion_" not in clauses
        assert "matriz.adquisicion_" not in clauses

    def test_every_token_key_is_catalog_or_derived(self):
        template = _load("golden_template_clauses.json")
        for clause in template["clauses"]:
            inside_repeat = False
            for node in _iter_nodes(clause["content_json"]):
                if node.get("type") == "repeat_section":
                    inside_repeat = True
                    array_key = node["attrs"]["arrayKey"]
                    assert catalog.is_variable_key(array_key) or array_key.startswith(
                        "titulo."
                    )
                if node.get("type") != "variable_token":
                    continue
                key = node["attrs"]["variableKey"]
                if key.startswith(ITEM_KEY_PREFIX):
                    assert inside_repeat, f"{key} outside repeat_section"
                    continue
                assert (
                    catalog.is_variable_key(key) or key in DERIVED_PRESENTATION_KEYS
                ), f"unknown token key {key}"

    def test_conditional_clauses_declare_condition_pair(self):
        template = _load("golden_template_clauses.json")
        for clause in template["clauses"]:
            has_conditional_node = any(
                node.get("type") == "conditional_section"
                for node in _iter_nodes(clause["content_json"])
            )
            assert has_conditional_node == (clause["condition_key"] is not None)
            if clause["condition_key"] is not None:
                assert clause["condition_mode"] in {"omit", "block"}

    def test_alert_tipos_are_taxonomy_values(self):
        template = _load("golden_template_clauses.json")
        taxonomy = {
            "dl_3516",
            "derechos_aguas",
            "vigente_en_el_resto",
            "multi_inmueble",
            "gravamen",
            "personeria_requerida",
            "discrepancia_declaracion",
            "otro",
        }
        declared = {
            clause["alert_tipo"]
            for clause in template["clauses"]
            if clause["alert_tipo"]
        }
        assert declared <= taxonomy
        assert "dl_3516" in declared

    def test_schema_version_present_on_every_clause(self):
        template = _load("golden_template_clauses.json")
        for clause in template["clauses"]:
            assert clause["content_json"]["schema_version"] == 1
            assert clause["content_json"]["type"] == "doc"

    def test_golden_template_passes_catalog_validator(self):
        from services.matriz_template_validation import (
            validate_clause_condition,
            validate_clause_content,
        )

        template = _load("golden_template_clauses.json")
        for clause in template["clauses"]:
            issues = validate_clause_content(clause["content_json"])
            issues += validate_clause_condition(
                clause["condition_key"], clause["condition_mode"]
            )
            assert issues == [], f"{clause['clause_key']}: {issues}"

    def test_validator_flags_removed_and_unknown_keys(self):
        from services.matriz_template_validation import validate_clause_content

        content = {
            "schema_version": 1,
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "variable_token",
                            "attrs": {"variableKey": "matriz.inscripcion_fojas", "label": "x"},
                        },
                        {
                            "type": "variable_token",
                            "attrs": {"variableKey": "no.existe", "label": "x"},
                        },
                        {
                            "type": "variable_token",
                            "attrs": {"variableKey": "item.fojas", "label": "x"},
                        },
                    ],
                },
                {"type": "mystery_node"},
            ],
        }
        issues = {issue.key: issue for issue in validate_clause_content(content)}
        assert issues["matriz.inscripcion_fojas"].reason == "removed_key"
        assert (
            issues["matriz.inscripcion_fojas"].suggested_migration
            == "titulo.inscripciones[]"
        )
        assert issues["no.existe"].reason == "unknown_key"
        # item.* fuera de repeat_section es inválido
        assert issues["item.fojas"].reason == "unknown_key"
        assert issues["mystery_node"].reason == "invalid_node"
