"""SDD 009 US5 tests: title_verified gate causes and titulo snapshot contract."""

from __future__ import annotations

import pytest

from services.escritura_readiness import (
    build_title_snapshot_values,
    build_variable_snapshot,
    calculate_escritura_readiness,
)
from services.legal_variable_catalog import READINESS_REQUIRED_VARIABLES_BY_GATE


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_ID = "00000000-0000-4000-8000-000000000029"
DOCUMENT_ID = "00000000-0000-4000-8000-000000000030"


def _approved_variable(variable_key: str, value: str = "ok") -> dict[str, object]:
    return {
        "id": f"var-{variable_key}",
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "lot_id": None,
        "escritura_case_id": None,
        "variable_key": variable_key,
        "variable_group": variable_key.split(".", 1)[0],
        "value_text": value,
        "value_json": None,
        "state": "approved",
        "source_type": "legal_review",
        "source_ref": {},
        "confidence": 1.0,
        "reviewed_at": "2026-06-10T12:00:00Z",
        "approval_required": True,
        "evidence": [],
    }


def _ready_variables() -> list[dict[str, object]]:
    return [
        _approved_variable(variable_key)
        for keys in READINESS_REQUIRED_VARIABLES_BY_GATE.values()
        for variable_key in keys
    ]


def _evidenced(value: str | None) -> dict[str, object | None]:
    return {
        "value": value,
        "evidence": {
            "legal_document_id": DOCUMENT_ID,
            "page_number": 1,
            "snippet": f"snippet {value}",
        },
        "confidence": 0.97,
        "verified": True,
    }


def _approved_title_analysis(**overrides: object) -> dict[str, object]:
    analysis: dict[str, object] = {
        "id": "00000000-0000-4000-8000-000000000050",
        "status": "approved",
        "structure_type": "compra_derechos",
        "analysis_json": {
            "structure_type": "compra_derechos",
            "inscripciones": [
                {
                    "orden": 1,
                    "tipo_adquisicion": "compra",
                    "adquirentes": [
                        {"nombre": _evidenced("Juan Soto"), "cuota": "50%"}
                    ],
                    "antecesor": {"nombre": _evidenced("Pedro Rojas")},
                    "escritura": {
                        "fecha": _evidenced("1996-05-17"),
                        "notario": _evidenced("Ivan Torrealba Acevedo"),
                        "repertorio": None,
                    },
                    "inscripcion": {
                        "fojas": _evidenced("1338"),
                        "numero": _evidenced("1322"),
                        "anio": _evidenced("1996"),
                        "cbr": _evidenced("Curico"),
                    },
                }
            ],
            "propietarios_actuales": [
                {
                    "nombre": _evidenced("Juan Soto"),
                    "rut": _evidenced("9.111.222-3"),
                    "estado_civil": _evidenced("casado"),
                    "profesion": _evidenced("agricultor"),
                    "domicilio": _evidenced("Teno"),
                    "cuota": "50%",
                    "requiere_personeria": False,
                }
            ],
        },
        "alerts": [
            {"tipo": "dl_3516", "resolution": "clause_added", "reason": "clausula"},
        ],
        "narrative_comparecencia_generated": "comparecencia generada",
        "narrative_comparecencia_edited": "comparecencia editada por abogado",
        "narrative_primero_generated": "PRIMERO generado",
        "narrative_primero_edited": None,
    }
    analysis.update(overrides)
    return analysis


def _readiness(**kwargs):
    params = {
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "lot_id": LOT_ID,
        "variables": _ready_variables(),
        "title_analysis": _approved_title_analysis(),
        "has_title_documents": True,
        "warning_acknowledged": True,
    }
    params.update(kwargs)
    return calculate_escritura_readiness(**params)


def _title_gate(readiness):
    return next(gate for gate in readiness.gates if gate.gate == "title_verified")


# ------------------------------------------------------------------
# Gate cause matrix
# ------------------------------------------------------------------


def test_title_gate_ready_with_approved_analysis_and_variables():
    gate = _title_gate(_readiness())
    assert gate.status == "ready"
    assert gate.blocking_variables == ()


def test_title_gate_blocked_without_documents_or_analysis():
    gate = _title_gate(_readiness(title_analysis=None, has_title_documents=False))
    assert gate.status == "blocked"
    assert "no_title_documents" in gate.blocking_variables


def test_title_gate_blocked_with_documents_but_no_recorded_run():
    gate = _title_gate(_readiness(title_analysis=None, has_title_documents=True))
    assert gate.status == "blocked"
    assert "analysis_needs_review" in gate.blocking_variables


@pytest.mark.parametrize(
    ("status", "expected_cause"),
    [
        ("processing", "analysis_processing"),
        ("proposed", "analysis_needs_review"),
        ("needs_review", "analysis_needs_review"),
        ("failed", "analysis_failed"),
        ("llm_disabled", "llm_disabled"),
        ("superseded", "analysis_superseded"),
    ],
)
def test_title_gate_blocked_by_analysis_status_cause(status, expected_cause):
    gate = _title_gate(
        _readiness(title_analysis=_approved_title_analysis(status=status))
    )
    assert gate.status == "blocked"
    assert expected_cause in gate.blocking_variables


def test_title_gate_blocked_by_unresolved_alerts():
    analysis = _approved_title_analysis(
        status="proposed",
        alerts=[{"tipo": "derechos_aguas", "resolution": "pending"}],
    )
    gate = _title_gate(_readiness(title_analysis=analysis))
    assert gate.status == "blocked"
    assert "unresolved_alerts" in gate.blocking_variables


def test_title_gate_blocked_by_pending_manual_review_variables():
    variables = _ready_variables()
    for variable in variables:
        if variable["variable_key"] == "titulo.clausula_primero_texto":
            variable["state"] = "manual_review"
    gate = _title_gate(
        _readiness(
            variables=variables,
            title_analysis=_approved_title_analysis(status="needs_review"),
        )
    )
    assert gate.status == "blocked"
    assert "pending_manual_review" in gate.blocking_variables
    assert "titulo.clausula_primero_texto" in gate.blocking_variables


def test_supersede_re_blocks_previously_ready_gate():
    ready_gate = _title_gate(_readiness())
    assert ready_gate.status == "ready"

    superseded_gate = _title_gate(
        _readiness(title_analysis=_approved_title_analysis(status="superseded"))
    )
    assert superseded_gate.status == "blocked"
    assert "analysis_superseded" in superseded_gate.blocking_variables


def test_overall_readiness_blocked_when_title_gate_blocked():
    readiness = _readiness(title_analysis=None, has_title_documents=False)
    assert readiness.readiness_status == "blocked"


# ------------------------------------------------------------------
# Snapshot contract: domain values only
# ------------------------------------------------------------------


def _assert_no_parser_metadata(value: object) -> None:
    if isinstance(value, dict):
        for forbidden in ("evidence", "verified", "confidence", "state", "source_ref"):
            assert forbidden not in value, f"snapshot leaks parser metadata: {forbidden}"
        for child in value.values():
            _assert_no_parser_metadata(child)
    elif isinstance(value, list):
        for child in value:
            _assert_no_parser_metadata(child)


def test_snapshot_includes_titulo_domain_values_only():
    snapshot = build_variable_snapshot(
        _ready_variables(), title_analysis=_approved_title_analysis()
    )
    titulo = snapshot["titulo"]

    assert titulo["estructura"] == "compra_derechos"
    inscription = titulo["inscripciones"][0]
    assert inscription["fojas"] == "1338"
    assert inscription["numero"] == "1322"
    assert inscription["anio"] == "1996"
    assert inscription["cbr"] == "Curico"
    assert inscription["tipo_adquisicion"] == "compra"
    assert inscription["escritura_fecha"] == "1996-05-17"
    assert inscription["notario"] == "Ivan Torrealba Acevedo"
    assert inscription["repertorio"] is None
    assert inscription["antecesor"] == "Pedro Rojas"
    assert inscription["adquirentes"] == [{"nombre": "Juan Soto", "cuota": "50%"}]

    owner = titulo["propietarios"][0]
    assert owner == {
        "nombre": "Juan Soto",
        "rut": "9.111.222-3",
        "estado_civil": "casado",
        "profesion": "agricultor",
        "domicilio": "Teno",
        "cuota": "50%",
        "requiere_personeria": False,
    }

    assert titulo["alertas_resueltas"] == [
        {"tipo": "dl_3516", "resolution": "clause_added"}
    ]
    _assert_no_parser_metadata(titulo)


def test_snapshot_uses_edited_narrative_when_present():
    titulo = build_title_snapshot_values(_approved_title_analysis())
    assert titulo is not None
    assert titulo["comparecencia_vendedor_texto"] == "comparecencia editada por abogado"
    assert titulo["clausula_primero_texto"] == "PRIMERO generado"


def test_snapshot_excludes_raw_titulo_variable_rows():
    snapshot = build_variable_snapshot(
        _ready_variables(), title_analysis=_approved_title_analysis()
    )
    flat_titulo_keys = [
        key for key in snapshot if key.startswith("titulo.") and key != "titulo"
    ]
    assert flat_titulo_keys == []
    assert "matriz.nombre_predio" in snapshot


def test_snapshot_omits_titulo_group_when_analysis_not_approved():
    for status in ("processing", "proposed", "needs_review", "superseded"):
        snapshot = build_variable_snapshot(
            _ready_variables(),
            title_analysis=_approved_title_analysis(status=status),
        )
        assert "titulo" not in snapshot
    assert build_title_snapshot_values(None) is None
