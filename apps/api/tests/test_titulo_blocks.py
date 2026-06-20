"""SDD 009 US2 tests — agent-drafted narrative blocks (post-migration).

The corpus-specific Python templates were deleted with the pipeline; the
blocks are drafted by the title agent and validated by the deterministic
fact-checker. Tests cover:

- word-rendering utilities (numbers, dates, RUT, superficie)
- block fact-checker: golden blocks pass against the verified golden chain
- hallucination classes are caught: altered date, altered surname, altered
  registral number (SC-002)
- unverified chain facts invalidate the block facts that rely on them
- absent drafts are reported with a visible reason, never silently hidden
"""

from __future__ import annotations

import json
from pathlib import Path

from schemas.legal_titles import TitleAnalysis
from services.legal_title_block_check import (
    allowed_block_numbers,
    check_block_facts,
    check_title_blocks,
    extract_spanish_dates,
    extract_spanish_numbers,
)
from services.legal_title_verification import _collect_evidenced_values
from services.legal_title_words import (
    date_to_words_spanish,
    number_to_words_spanish,
    parse_int_or_none,
    rut_to_words_spanish,
    superficie_to_words,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "titulo"


def _normalize_ws(text: str) -> str:
    return " ".join(text.split())


def _verified_golden_analysis() -> TitleAnalysis:
    payload = json.loads(
        (FIXTURE_DIR / "llm_response_golden.json").read_text(encoding="utf-8")
    )
    analysis = TitleAnalysis.model_validate(payload)
    for _, ev in _collect_evidenced_values(analysis):
        if ev.value is not None:
            ev.verified = True
    return analysis


def _golden_blocks() -> tuple[str, str]:
    content = (FIXTURE_DIR / "teno_golden_blocks.md").read_text(encoding="utf-8")
    comparecencia = content.split("## comparecencia")[1].split("## primero")[0]
    primero = content.split("## primero")[1]
    return _normalize_ws(comparecencia), _normalize_ws(primero)


# ── Word rendering utilities ───────────────────────────────────────────


class TestWordRendering:
    def test_number_to_words_thousands(self):
        assert number_to_words_spanish(1338) == "mil trescientos treinta y ocho"
        assert number_to_words_spanish(1322) == "mil trescientos veintidós"
        assert (
            number_to_words_spanish(4699) == "cuatro mil seiscientos noventa y nueve"
        )
        assert (
            number_to_words_spanish(2781) == "dos mil setecientos ochenta y uno"
        )

    def test_number_to_words_millions(self):
        assert (
            number_to_words_spanish(4606955)
            == "cuatro millones seiscientos seis mil novecientos cincuenta y cinco"
        )

    def test_date_to_words(self):
        assert (
            date_to_words_spanish("1996-05-17")
            == "diecisiete de mayo de mil novecientos noventa y seis"
        )
        assert (
            date_to_words_spanish("2022-02-02")
            == "dos de febrero de dos mil veintidós"
        )
        assert date_to_words_spanish("2022-08-19") == (
            "diecinueve de agosto de dos mil veintidós"
        )

    def test_rut_to_words(self):
        assert rut_to_words_spanish("4.606.955-2") == (
            "cuatro millones seiscientos seis mil novecientos cincuenta y cinco guion dos"
        )

    def test_superficie_to_words(self):
        assert superficie_to_words("26,82 hectáreas") == (
            "veintiséis coma ochenta y dos hectáreas"
        )

    def test_parse_int_tolerates_thousand_separators(self):
        assert parse_int_or_none("4.699") == 4699
        assert parse_int_or_none("1338") == 1338
        assert parse_int_or_none("no-numero") is None
        assert parse_int_or_none(None) is None


# ── Spanish text parsers (fact-checker internals) ──────────────────────


class TestSpanishParsers:
    def test_extract_numbers_parses_words_and_digits(self):
        values = {
            value
            for value, _ in extract_spanish_numbers(
                "fojas mil trescientos treinta y ocho, número 1.322, rol 67-23"
            )
        }
        assert {1338, 1322, 67, 23} <= values

    def test_sentence_boundary_splits_number_runs(self):
        # "…noventa y seis. Dos)" is 1996 + ordinal 2, never 1998.
        values = [
            value
            for value, _ in extract_spanish_numbers(
                "del año mil novecientos noventa y seis. Dos) Por compra"
            )
        ]
        assert 1996 in values
        assert 2 in values
        assert 1998 not in values

    def test_extract_dates_parses_full_triple(self):
        dates = extract_spanish_dates(
            "escritura de fecha dos de febrero de dos mil veintidós"
        )
        assert dates and dates[0][0] == "2022-02-02"

    def test_allowed_numbers_include_chain_and_identity_digits(self):
        analysis = _verified_golden_analysis()
        allowed = allowed_block_numbers(analysis)
        assert {1338, 1322, 1996, 4699, 2781, 2023, 67, 23} <= allowed


# ── Block fact-checker vs golden corpus ────────────────────────────────


class TestBlockFactCheck:
    def test_golden_comparecencia_passes(self):
        analysis = _verified_golden_analysis()
        comparecencia, _ = _golden_blocks()
        result = check_block_facts(comparecencia, analysis)
        assert result.ok, [issue.as_dict() for issue in result.issues]

    def test_golden_primero_passes(self):
        analysis = _verified_golden_analysis()
        _, primero = _golden_blocks()
        result = check_block_facts(primero, analysis)
        assert result.ok, [issue.as_dict() for issue in result.issues]

    def test_altered_escritura_year_is_caught(self):
        # Pilot hallucination class: escritura date 2022 -> 2023. 2023 exists
        # in the chain (inscription year), so only the full-date triple check
        # can catch the swap.
        analysis = _verified_golden_analysis()
        _, primero = _golden_blocks()
        altered = primero.replace(
            "dos de febrero de dos mil veintidós",
            "dos de febrero de dos mil veintitrés",
        )
        result = check_block_facts(altered, analysis)
        assert not result.ok
        assert any(
            issue.motivo == "fecha_sin_respaldo_verificado" for issue in result.issues
        )

    def test_altered_surname_is_caught(self):
        analysis = _verified_golden_analysis()
        _, primero = _golden_blocks()
        altered = primero.replace("Minghel", "Minchelli")
        result = check_block_facts(altered, analysis)
        assert not result.ok
        assert any(
            issue.motivo == "nombre_sin_respaldo_verificado"
            and issue.hecho == "Minchelli"
            for issue in result.issues
        )

    def test_altered_fojas_number_is_caught(self):
        analysis = _verified_golden_analysis()
        _, primero = _golden_blocks()
        altered = primero.replace(
            "cuatro mil seiscientos noventa y nueve",
            "cuatro mil setecientos noventa y nueve",
        )
        result = check_block_facts(altered, analysis)
        assert not result.ok
        assert any(
            issue.motivo == "numero_sin_respaldo_verificado"
            for issue in result.issues
        )

    def test_unverified_chain_fact_invalidates_block_usage(self):
        # When the surname is NOT verified, the golden block that mentions it
        # must fail the check (the fact lost its backing).
        analysis = _verified_golden_analysis()
        for inscription in analysis.inscripciones:
            if inscription.antecesor and inscription.antecesor.nombre:
                inscription.antecesor.nombre.verified = False
        _, primero = _golden_blocks()
        result = check_block_facts(primero, analysis)
        assert not result.ok
        assert any("Minghel" in issue.hecho for issue in result.issues)

    def test_bracketed_hueco_is_not_flagged_as_fact(self):
        # Borrador: un dato faltante (p. ej. nacionalidad) va como hueco entre
        # corchetes en MAYÚSCULAS y NO debe marcarse como hecho sin respaldo.
        analysis = _verified_golden_analysis()
        comparecencia, _ = _golden_blocks()
        with_hueco = comparecencia + " de nacionalidad [NACIONALIDAD],"
        result = check_block_facts(with_hueco, analysis)
        assert result.ok, [issue.as_dict() for issue in result.issues]
        # Control: el mismo término SIN corchetes sí se marca como sin respaldo.
        without_brackets = comparecencia + " de nacionalidad ARGENTINA,"
        control = check_block_facts(without_brackets, analysis)
        assert not control.ok
        assert any(
            issue.hecho == "ARGENTINA"
            and issue.motivo == "nombre_sin_respaldo_verificado"
            for issue in control.issues
        )

    def test_missing_drafts_are_reported_not_hidden(self):
        analysis = _verified_golden_analysis()
        results = check_title_blocks(
            comparecencia=None, primero="  ", analysis=analysis
        )
        assert results["comparecencia"]["ok"] is False
        assert (
            results["comparecencia"]["issues"][0]["motivo"]
            == "no_redactado_por_el_agente"
        )
        assert results["primero"]["ok"] is False

    def test_check_title_blocks_passes_golden_pair(self):
        analysis = _verified_golden_analysis()
        comparecencia, primero = _golden_blocks()
        results = check_title_blocks(
            comparecencia=comparecencia, primero=primero, analysis=analysis
        )
        assert results["comparecencia"]["ok"] is True
        assert results["primero"]["ok"] is True
