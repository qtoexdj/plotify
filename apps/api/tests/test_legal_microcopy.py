"""SDD 010 T003: tests de redaccion del diccionario de microcopy."""

from __future__ import annotations

import re

import pytest

from schemas.legal_titles import TITLE_ALERT_TIPOS
from services.legal_microcopy import (
    ALERT_REQUIRED_CLAUSE_TEXTS,
    ALERT_TIPO_LABELS,
    ESCRITURA_CASE_STATUS_LABELS,
    MATRIZ_STATUS_LABELS,
    READINESS_GATE_ACTION_LABELS,
    READINESS_GATE_LABELS,
    READINESS_GATE_PENDING_DESCRIPTIONS,
    alert_clause_missing_microcopy,
    alert_tipo_label,
    blocker_microcopy,
    escritura_case_status_label,
    matriz_status_label,
    readiness_gate_label,
    readiness_gate_microcopy,
    snapshot_stale_microcopy,
    token_missing_microcopy,
)
from services.legal_variable_catalog import (
    ESCRITURA_CASE_STATUSES,
    READINESS_GATES,
)

# Vocabulario vetado en pantalla (FR-006/SC-002): jerga tecnica como palabra
# y restos de codigos (underscores, claves con punto).
FORBIDDEN_WORDS = re.compile(
    r"\b(token|blocker|snapshot|gate|resolved|missing|blocked|draft)\b",
    re.IGNORECASE,
)
RAW_CODE_PATTERN = re.compile(r"_|\b[a-z]+\.[a-z]+")


def _assert_human(text: str) -> None:
    assert text.strip(), "Texto vacio"
    assert not FORBIDDEN_WORDS.search(text), f"Jerga tecnica visible: {text!r}"
    assert not RAW_CODE_PATTERN.search(text), f"Codigo crudo visible: {text!r}"


def test_alert_tipo_coverage_matches_title_taxonomy() -> None:
    missing = TITLE_ALERT_TIPOS - set(ALERT_TIPO_LABELS)
    assert not missing, f"Tipos de alerta sin etiqueta: {missing}"
    missing_clause = TITLE_ALERT_TIPOS - set(ALERT_REQUIRED_CLAUSE_TEXTS)
    assert not missing_clause, f"Tipos sin texto de clausula: {missing_clause}"


def test_dl_3516_and_derechos_aguas_redaction() -> None:
    assert alert_tipo_label("dl_3516") == "Declaración DL 3.516"
    assert alert_tipo_label("derechos_aguas") == "Derechos de aguas"
    copy = alert_clause_missing_microcopy("derechos_aguas")
    assert copy.title == "Falta la cláusula comprometida: Derechos de aguas"
    assert "derechos de aguas" in copy.description.lower()
    assert "estudio de título" in copy.description
    assert copy.action_label == "Agregar cláusula"
    for text in (copy.title, copy.description, copy.action_label):
        _assert_human(text)


def test_unknown_alert_tipo_is_humanized_never_raw() -> None:
    label = alert_tipo_label("usufructo_pendiente")
    assert label == "Usufructo pendiente"
    _assert_human(label)


def test_token_missing_redaction_uses_catalog_label() -> None:
    copy = token_missing_microcopy("comprador.estado_civil")
    assert copy.title == "Falta estado civil del comprador"
    assert copy.action_label == "Completar dato"
    assert "Centro de Control Legal" in copy.description
    for text in (copy.title, copy.description, copy.action_label):
        _assert_human(text)


def test_token_missing_preserves_leading_acronyms() -> None:
    copy = token_missing_microcopy("comprador.rut")
    assert copy.title == "Falta RUT del comprador"


def test_readiness_gate_coverage_and_redaction() -> None:
    for gate in READINESS_GATES:
        assert gate in READINESS_GATE_LABELS
        assert gate in READINESS_GATE_PENDING_DESCRIPTIONS
        assert gate in READINESS_GATE_ACTION_LABELS
        copy = readiness_gate_microcopy(gate)
        for text in (copy.title, copy.description, copy.action_label):
            _assert_human(text)
    with pytest.raises(KeyError):
        readiness_gate_label("gate_fantasma")


def test_readiness_gate_translates_known_cause_and_omits_unknown() -> None:
    with_cause = readiness_gate_microcopy("party_verified", "comprador.estado_civil")
    assert with_cause.description.startswith("Falta estado civil del comprador.")
    technical = readiness_gate_microcopy("party_verified", "rls_check_failed:42")
    assert "rls" not in technical.description.lower()
    assert "42" not in technical.description
    _assert_human(technical.description)


def test_snapshot_stale_redaction() -> None:
    copy = snapshot_stale_microcopy()
    assert copy.title == "El expediente cambió"
    assert copy.action_label == "Recargar"
    for text in (copy.title, copy.description):
        _assert_human(text)


def test_status_labels_cover_all_states() -> None:
    assert set(MATRIZ_STATUS_LABELS) == {
        "draft",
        "legal_review_pending",
        "approved",
        "superseded",
    }
    assert set(ESCRITURA_CASE_STATUS_LABELS) == set(ESCRITURA_CASE_STATUSES)
    for status in ESCRITURA_CASE_STATUSES:
        _assert_human(escritura_case_status_label(status))
    assert matriz_status_label("legal_review_pending") == "En revisión legal"
    with pytest.raises(KeyError):
        matriz_status_label("archivada")


def test_blocker_dispatcher_covers_all_kinds() -> None:
    assert blocker_microcopy(
        "token_missing", key="comprador.nombre"
    ).action_label == "Completar dato"
    assert blocker_microcopy(
        "readiness_gate", gate="title_verified"
    ).action_label == "Revisar estudio de título"
    assert blocker_microcopy(
        "alert_clause_missing", alert_tipo="dl_3516"
    ).title.endswith("Declaración DL 3.516")
    assert blocker_microcopy("snapshot_stale").action_label == "Recargar"
    with pytest.raises(ValueError):
        blocker_microcopy("kind_desconocido")
