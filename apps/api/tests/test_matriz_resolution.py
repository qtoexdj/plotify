"""SDD 008 T019 tests: token resolver against the Teno snapshot fixture.

Covers scalar tokens, titulo block tokens, repeat sections with registral
words rendering (SC-001), conditional sections (omit/block), derived
presentation keys, the manifest missing/blocked accounting and the
unknown-node explicit failure.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from services import matriz_token_resolution as resolution
from services.legal_title_words import number_to_words_spanish

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "matriz"


def _snapshot() -> dict:
    return json.loads(
        (FIXTURE_DIR / "teno_case_snapshot.json").read_text(encoding="utf-8")
    )


def _clauses() -> list[dict]:
    return json.loads(
        (FIXTURE_DIR / "golden_template_clauses.json").read_text(encoding="utf-8")
    )["clauses"]


_DEFAULT_CONTEXT = {"proyecto_nombre": "Parcelación El Cóndor de Teno"}


def _resolve(clauses=None, snapshot=None, context=None) -> resolution.MatrizResolution:
    data = snapshot or _snapshot()
    return resolution.resolve_matriz_clauses(
        clauses=clauses if clauses is not None else _clauses(),
        variable_snapshot=data["variable_snapshot"],
        evidence_snapshot=data["evidence_snapshot"],
        context=_DEFAULT_CONTEXT if context is None else context,
    )


def _clause(result: resolution.MatrizResolution, key: str) -> resolution.ClauseResolution:
    return next(clause for clause in result.clauses if clause.clause_key == key)


def _plain_text(node: dict) -> str:
    if node.get("type") == "text":
        return node.get("text", "")
    return "".join(_plain_text(child) for child in node.get("content") or [])


class TestScalarResolution:
    def test_full_golden_template_resolves_clean(self):
        result = _resolve()
        assert result.missing_count == 0
        assert result.blocked_count == 0
        statuses = {token.status for token in result.tokens}
        assert statuses == {"resolved"}

    def test_comparecencia_resolves_comprador_with_rut_words(self):
        result = _resolve()
        text = _plain_text(_clause(result, "comparecencia").resolved_content)
        assert "María Fernanda Soto Pérez" in text
        # RUT 16.358.742-5 en palabras (format rut_words)
        assert "dieciséis millones" in text
        assert "guion cinco" in text

    def test_not_applicable_renders_empty_by_decision(self):
        clauses = [
            {
                "clause_key": "rol",
                "content_json": {
                    "schema_version": 1,
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {
                                    "type": "variable_token",
                                    "attrs": {
                                        "variableKey": "sii.rol_avaluo_definitivo",
                                        "label": "Rol definitivo",
                                    },
                                }
                            ],
                        }
                    ],
                },
            }
        ]
        result = _resolve(clauses=clauses)
        token = next(
            t for t in result.tokens if t.variable_key == "sii.rol_avaluo_definitivo"
        )
        assert token.status == "resolved"
        assert token.value_text == ""
        assert result.missing_count == 0

    def test_missing_key_keeps_token_node_and_counts(self):
        snapshot = _snapshot()
        del snapshot["variable_snapshot"]["comprador.nacionalidad"]
        result = _resolve(snapshot=snapshot)
        token = next(
            t for t in result.tokens if t.variable_key == "comprador.nacionalidad"
        )
        assert token.status == "missing"
        assert result.missing_count == 1
        content = _clause(result, "comparecencia").resolved_content
        raw = json.dumps(content)
        assert "comprador.nacionalidad" in raw  # el nodo token sobrevive

    def test_proposed_value_surfaces_as_blocked_with_value(self):
        snapshot = _snapshot()
        snapshot["variable_snapshot"]["comprador.nombre"]["state"] = "proposed"
        result = _resolve(snapshot=snapshot)
        token = next(t for t in result.tokens if t.variable_key == "comprador.nombre")
        assert token.status == "blocked"
        assert token.value_text == "María Fernanda Soto Pérez"
        assert result.blocked_count == 1

    def test_evidence_refs_attach_from_evidence_snapshot(self):
        result = _resolve()
        token = next(t for t in result.tokens if t.variable_key == "vendedor.nombre")
        assert token.evidence_refs
        assert token.evidence_refs[0]["page_number"] == 1


class TestBlockTokens:
    def test_clausula_primero_inserts_approved_text_verbatim(self):
        result = _resolve()
        clause = _clause(result, "antecedentes_dominio")
        block = clause.blocks[0]
        assert block.status == "resolved"
        assert block.text.startswith("PRIMERO:")
        text = _plain_text(clause.resolved_content)
        assert text == block.text

    def test_missing_titulo_marks_blocks_missing(self):
        snapshot = _snapshot()
        del snapshot["variable_snapshot"]["titulo"]
        result = _resolve(snapshot=snapshot)
        block_statuses = {block.block_key: block.status for block in result.blocks}
        assert block_statuses["titulo.clausula_primero_texto"] == "missing"
        assert block_statuses["titulo.comparecencia_vendedor_texto"] == "missing"
        assert result.missing_count >= 2


def _inscripciones_clause() -> dict:
    """Clausula sintetica con repeat_section sobre titulo.inscripciones[]
    (SC-001). Ya no vive en el template golden (se elimino `titulos_inscripciones`
    por redundante con el bloque narrativo de titulo, alineacion LOTE 29), pero
    la capacidad del resolutor de expandir arrays con referencias registrales en
    palabras se sigue probando aca de forma aislada."""
    return {
        "clause_key": "titulos_inscripciones",
        "content_json": {
            "schema_version": 1,
            "type": "doc",
            "content": [
                {
                    "type": "repeat_section",
                    "attrs": {"arrayKey": "titulo.inscripciones[]"},
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "Inscripción a fojas "},
                                {
                                    "type": "variable_token",
                                    "attrs": {
                                        "variableKey": "item.fojas",
                                        "label": "Fojas",
                                        "format": "words",
                                    },
                                },
                                {"type": "text", "text": ", número "},
                                {
                                    "type": "variable_token",
                                    "attrs": {
                                        "variableKey": "item.numero",
                                        "label": "Número",
                                        "format": "words",
                                    },
                                },
                                {
                                    "type": "text",
                                    "text": ", del Registro de Propiedad del Conservador de Bienes Raíces de ",
                                },
                                {
                                    "type": "variable_token",
                                    "attrs": {"variableKey": "item.cbr", "label": "Conservador"},
                                },
                                {"type": "text", "text": ", correspondiente al año "},
                                {
                                    "type": "variable_token",
                                    "attrs": {
                                        "variableKey": "item.anio",
                                        "label": "Año",
                                        "format": "words",
                                    },
                                },
                                {"type": "text", "text": "."},
                            ],
                        }
                    ],
                }
            ],
        },
    }


class TestRepeatSections:
    def test_sexto_renders_inscripciones_in_words(self):
        result = _resolve(clauses=[_inscripciones_clause()])
        text = _plain_text(_clause(result, "titulos_inscripciones").resolved_content)
        # SC-001: referencias registrales en palabras, deterministicas.
        assert number_to_words_spanish(1338) in text  # fojas tramo 1
        assert number_to_words_spanish(1322) in text  # numero tramo 1
        assert number_to_words_spanish(1996) in text  # anio tramo 1
        assert number_to_words_spanish(4699) in text  # fojas tramo 2
        assert number_to_words_spanish(2781) in text  # numero tramo 2
        assert number_to_words_spanish(2023) in text  # anio tramo 2
        assert text.count("Conservador de Bienes Raíces de Curicó") == 2

    def test_detalle_pago_expands_per_item(self):
        result = _resolve()
        text = _plain_text(_clause(result, "precio_liquidacion").resolved_content)
        assert "quince millones de pesos" in text
        assert "treinta millones de pesos" in text
        assert "Banco de Chile" not in text  # el medio del fixture es genérico
        assert "cuarenta y cinco millones de pesos" in text

    def test_empty_array_marks_array_missing(self):
        snapshot = _snapshot()
        snapshot["variable_snapshot"]["titulo"]["inscripciones"] = []
        result = _resolve(clauses=[_inscripciones_clause()], snapshot=snapshot)
        token = next(
            t for t in result.tokens if t.variable_key == "titulo.inscripciones[]"
        )
        assert token.status == "missing"

    def test_missing_item_field_reports_indexed_key(self):
        snapshot = _snapshot()
        snapshot["variable_snapshot"]["titulo"]["inscripciones"][1]["fojas"] = None
        result = _resolve(clauses=[_inscripciones_clause()], snapshot=snapshot)
        missing = [t.variable_key for t in result.tokens if t.status == "missing"]
        assert "titulo.inscripciones[][1].fojas" in missing


class TestConditionalSections:
    def test_false_condition_omits_clause(self):
        result = _resolve()
        clause = _clause(result, "exencion_eviccion")
        assert clause.omitted is True
        assert clause.resolved_content is None
        personeria = _clause(result, "personeria")
        assert personeria.omitted is True

    def test_true_condition_resolves_content(self):
        result = _resolve()
        clause = _clause(result, "servidumbre_transito")
        assert clause.omitted is False
        text = _plain_text(clause.resolved_content)
        assert "franja de ocho metros de ancho" in text
        assert "los Lotes N°1, N°2 y N°4 de la misma subdivisión" in text

    def test_block_mode_with_false_condition_blocks(self):
        clauses = [
            {
                "clause_key": "exencion",
                "condition_key": "clausulas.exencion_eviccion_aprobada",
                "condition_mode": "block",
                "content_json": {
                    "schema_version": 1,
                    "type": "doc",
                    "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "x"}]}
                    ],
                },
            }
        ]
        result = _resolve(clauses=clauses)
        token = next(
            t
            for t in result.tokens
            if t.variable_key == "clausulas.exencion_eviccion_aprobada"
        )
        assert token.status == "blocked"

    def test_missing_condition_key_is_missing(self):
        snapshot = _snapshot()
        del snapshot["variable_snapshot"]["servidumbre.aplica"]
        result = _resolve(snapshot=snapshot)
        token = next(
            t for t in result.tokens if t.variable_key == "servidumbre.aplica"
        )
        assert token.status == "missing"


class TestDerivedPresentationKeys:
    def test_proyecto_nombre_resolves_from_context(self):
        result = _resolve()
        token = next(t for t in result.tokens if t.variable_key == "proyecto.nombre")
        assert token.status == "resolved"
        assert token.value_text == "Parcelación El Cóndor de Teno"

    def test_proyecto_nombre_missing_without_context(self):
        result = _resolve(context={})
        token = next(t for t in result.tokens if t.variable_key == "proyecto.nombre")
        assert token.status == "missing"

    def test_representantes_texto_composes_from_array(self):
        snapshot = _snapshot()
        snapshot["variable_snapshot"]["vendedor.representantes[]"]["value_json"] = [
            {"nombre": "Pedro Pérez Soto", "rut": "7.111.222-3"},
            {"nombre": "Ana López Díaz", "rut": "8.444.555-6"},
        ]
        snapshot["variable_snapshot"]["personeria.aplica"]["value_json"] = True
        clauses = [c for c in _clauses() if c["clause_key"] == "personeria"]
        result = _resolve(clauses=clauses, snapshot=snapshot)
        token = next(
            t
            for t in result.tokens
            if t.variable_key == "vendedor.representantes_texto"
        )
        assert token.status == "resolved"
        assert "Pedro Pérez Soto" in token.value_text
        assert " y don(ña) Ana López Díaz" in token.value_text


class TestUnknownNodes:
    def test_unknown_node_type_raises_explicit_error(self):
        clauses = [
            {
                "clause_key": "rara",
                "content_json": {
                    "schema_version": 1,
                    "type": "doc",
                    "content": [{"type": "tabla_misteriosa"}],
                },
            }
        ]
        with pytest.raises(resolution.UnknownNodeError) as excinfo:
            _resolve(clauses=clauses)
        assert "tabla_misteriosa" in str(excinfo.value)
