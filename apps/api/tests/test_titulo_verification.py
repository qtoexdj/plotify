"""SDD 009 US2 tests for the deterministic evidence verifier.

Tests cover:
- SC-002: normalization rules, snippet matching, degradation, hallucination regression.
- normalize_text: whitespace/case/accent handling.
- check_snippet_match: literal substring after normalization.
- verify_evidenced_value: per-field verdict.
- verify_title_analysis: full traversal with verification_stats and manual_review.
"""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest

from schemas.legal_titles import (
    EvidencedValue,
    Evidence,
    TitleAnalysis,
    TitleAnalysisVerification,
)
from services.legal_title_verification import (
    check_snippet_match,
    check_value_snippet_consistency,
    normalize_text,
    verify_evidenced_value,
    verify_title_analysis,
)


DOC_1996_ID = "doc_1996_id"
DOC_2023_ID = "doc_2023_id"

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "titulo"


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def _load_pages_fixture(name: str) -> dict:
    """Load a pages fixture and return doc_id -> {page_number -> text_content}."""
    payload = json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))
    doc_id = payload["legal_document_id"]
    pages = {page["page_number"]: page["text_content"] for page in payload["pages"]}
    return doc_id, pages


@pytest.fixture
def golden_analysis() -> TitleAnalysis:
    return TitleAnalysis.model_validate(_load_fixture("llm_response_golden.json"))


@pytest.fixture
def hallucinated_analysis() -> TitleAnalysis:
    return TitleAnalysis.model_validate(_load_fixture("llm_response_hallucinated.json"))


@pytest.fixture
def pages_by_doc() -> dict[str, dict[int, str]]:
    """Build the pages_by_doc lookup from fixture page files."""
    result = {}
    doc_id_1996, pages_1996 = _load_pages_fixture("teno_dominio_1996_pages.json")
    doc_id_2023, pages_2023 = _load_pages_fixture("teno_dominio_2023_pages.json")
    result[doc_id_1996] = pages_1996
    result[doc_id_2023] = pages_2023
    return result


# ── normalize_text tests ──────────────────────────────────────────────


class TestNormalizeText:
    """Verify whitespace, case, and accent normalization rules."""

    def test_collapses_multiple_spaces(self):
        assert normalize_text("  hello   world  ") == "hello world"

    def test_lowercases_text(self):
        assert normalize_text("HELLO World") == "hello world"

    def test_removes_accents(self):
        assert normalize_text("Curicó") == "curico"

    def test_handles_none(self):
        assert normalize_text(None) == ""

    def test_handles_empty_string(self):
        assert normalize_text("") == ""

    def test_normalizes_line_breaks(self):
        assert normalize_text("line1\n\nline2\tline3") == "line1 line2 line3"

    def test_normalizes_special_unicode(self):
        # NFKD decomposition of special chars like ° and Nº
        result = normalize_text("N°67-23")
        assert "67-23" in result

    def test_real_page_snippet_normalization_preserves_meaning(self):
        """Real page text normalized should still contain real snippet normalized."""
        page = "GALAZ ABARCA, don JUAN DE DIOS"
        snippet = "GALAZ ABARCA, don JUAN DE DIOS"
        assert normalize_text(snippet) in normalize_text(page)


# ── check_snippet_match tests ─────────────────────────────────────────


class TestCheckSnippetMatch:
    """Verify literal substring matching after normalization."""

    def test_exact_match(self):
        assert check_snippet_match("hello world", "hello world") is True

    def test_case_insensitive_match(self):
        assert check_snippet_match("HELLO WORLD", "hello world") is True

    def test_accent_insensitive_match(self):
        assert check_snippet_match("provincia de CURICÓ", "provincia de Curicó") is True

    def test_whitespace_insensitive_match(self):
        assert check_snippet_match("hello   world", "hello world") is True

    def test_snippet_is_substring_of_page(self):
        page = "This is a long page with GALAZ ABARCA don JUAN DE DIOS in it"
        snippet = "GALAZ ABARCA don JUAN DE DIOS"
        assert check_snippet_match(page, snippet) is True

    def test_non_matching_snippet(self):
        page = "This is a page about something else entirely"
        snippet = "GALAZ ABARCA don JUAN DE DIOS"
        assert check_snippet_match(page, snippet) is False

    def test_none_page_returns_false(self):
        assert check_snippet_match(None, "some snippet") is False

    def test_none_snippet_returns_false(self):
        assert check_snippet_match("some page", None) is False

    def test_empty_snippet_returns_false(self):
        assert check_snippet_match("some page", "") is False

    def test_real_fixture_snippet_matches_page(self, pages_by_doc: dict):
        """Golden fixture snippet for inscripción 1996 fojas must match the real page."""
        page_text = pages_by_doc[DOC_1996_ID][1]
        snippet = "Foja 1338 Número 1322 del año 1996"
        assert check_snippet_match(page_text, snippet) is True

    def test_real_fixture_snippet_with_accent_matches(self, pages_by_doc: dict):
        """Snippet with accents from 2023 doc must match."""
        page_text = pages_by_doc[DOC_2023_ID][3]
        snippet = "provincia de CURICÓ"
        assert check_snippet_match(page_text, snippet) is True

    def test_fabricated_snippet_does_not_match(self, pages_by_doc: dict):
        """A snippet that never appears in any page should not match."""
        page_text = pages_by_doc[DOC_2023_ID][2]
        snippet = "escritura de fecha tres de marzo del dos mil veintitrés"
        assert check_snippet_match(page_text, snippet) is False


# ── verify_evidenced_value tests ──────────────────────────────────────


class TestVerifyEvidencedValue:
    """Per-field verdict for an EvidencedValue against its page text."""

    def test_matching_snippet_returns_true(self, pages_by_doc: dict):
        page_text = pages_by_doc[DOC_1996_ID][1]
        result = verify_evidenced_value(
            value="1338",
            snippet="Foja 1338 Número 1322 del año 1996",
            page_text=page_text,
        )
        assert result is True

    def test_non_matching_snippet_returns_false(self, pages_by_doc: dict):
        page_text = pages_by_doc[DOC_1996_ID][1]
        result = verify_evidenced_value(
            value="1338",
            snippet="Foja 9999 Número 8888 del año 2024",
            page_text=page_text,
        )
        assert result is False

    def test_none_snippet_returns_false(self, pages_by_doc: dict):
        page_text = pages_by_doc[DOC_1996_ID][1]
        result = verify_evidenced_value(
            value="1338",
            snippet=None,
            page_text=page_text,
        )
        assert result is False

    def test_none_page_returns_false(self):
        result = verify_evidenced_value(
            value="1338",
            snippet="Foja 1338",
            page_text=None,
        )
        assert result is False


# ── verify_title_analysis integration tests ───────────────────────────


class TestVerifyTitleAnalysis:
    """Full traversal verification with stats and degradation."""

    async def test_golden_analysis_all_verified(
        self,
        golden_analysis: TitleAnalysis,
        pages_by_doc: dict[str, dict[int, str]],
    ):
        """Clean golden fixture with correct snippets should verify all fields."""
        stats = await verify_title_analysis(golden_analysis, pages_by_doc)

        assert isinstance(stats, dict)
        assert stats["verified_count"] > 0
        assert stats["unverified_count"] == 0
        assert stats["failures"] == []

    async def test_golden_analysis_zero_failures(
        self,
        golden_analysis: TitleAnalysis,
        pages_by_doc: dict[str, dict[int, str]],
    ):
        """Golden fixture with all real snippets produces zero failures.

        The 38 EvidencedValues in the Teno corpus (10 property_identity,
        10 inscripcion 1, 13 inscripcion 2, 5 propietario) all have
        snippets that match their referenced pages.
        """
        stats = await verify_title_analysis(golden_analysis, pages_by_doc)

        assert stats["verified_count"] == 38
        assert stats["unverified_count"] == 0
        assert len(stats["failures"]) == 0

    async def test_empty_pages_degrade_all_to_unverified(
        self,
        golden_analysis: TitleAnalysis,
    ):
        """If pages_by_doc is empty, no snippets can match => all unverified."""
        stats = await verify_title_analysis(golden_analysis, pages_by_doc={})

        assert stats["verified_count"] == 0
        assert stats["unverified_count"] == 38
        assert len(stats["failures"]) == 38
        assert all(f["reason"] == "page_not_found" for f in stats["failures"])

    async def test_missing_document_pages_degrade_affected_fields(
        self,
        golden_analysis: TitleAnalysis,
        pages_by_doc: dict[str, dict[int, str]],
    ):
        """Removing the 2023 doc pages should degrade fields referencing it.

        10 fields reference doc_1996_id → verified.
        28 fields reference doc_2023_id → unverified (page_not_found).
        """
        partial_pages = {DOC_1996_ID: pages_by_doc[DOC_1996_ID]}
        stats = await verify_title_analysis(golden_analysis, partial_pages)

        assert stats["verified_count"] == 10
        assert stats["unverified_count"] == 28
        assert len(stats["failures"]) == 28
        assert all(f["reason"] == "page_not_found" for f in stats["failures"])


# ── Hallucination regression tests (SC-002) ───────────────────────────


class TestHallucinationRegression:
    """SC-002: Hallucinated fixture (altered dates, altered surname) must degrade.

    The hallucinated fixture has these deliberate fabrications:
    1. inscripciones[0].antecesor.nombre.value = "MINCHELLI" (doc says "MINGHEL")
    2. inscripciones[1].escritura.fecha.value = "2023-02-02" (doc says "dos mil veintidós" = 2022)
    3. inscripciones[1].rectificatorias[0].fecha.value = "2023-08-19" (doc says "dos mil veintidós" = 2022)

    The snippet texts are identical to golden (they match the actual document text),
    but the extracted VALUES are wrong. The verifier should detect this mismatch
    between value and evidence.
    """

    def test_hallucinated_antecesor_surname_differs_from_golden(
        self,
        golden_analysis: TitleAnalysis,
        hallucinated_analysis: TitleAnalysis,
    ):
        """Confirm the fixture has the expected hallucination in antecesor name."""
        golden_name = golden_analysis.inscripciones[0].antecesor.nombre.value
        hallucinated_name = hallucinated_analysis.inscripciones[0].antecesor.nombre.value

        assert golden_name == "LUIS ARMANDO MINGHEL BALLADARES"
        assert hallucinated_name == "LUIS ARMANDO MINCHELLI BALLADARES"
        assert golden_name != hallucinated_name

    def test_hallucinated_escritura_fecha_differs_from_golden(
        self,
        golden_analysis: TitleAnalysis,
        hallucinated_analysis: TitleAnalysis,
    ):
        """Confirm the fixture has the expected hallucination in escritura fecha."""
        golden_fecha = golden_analysis.inscripciones[1].escritura.fecha.value
        hallucinated_fecha = hallucinated_analysis.inscripciones[1].escritura.fecha.value

        assert golden_fecha == "2022-02-02"
        assert hallucinated_fecha == "2023-02-02"
        assert golden_fecha != hallucinated_fecha

    def test_hallucinated_rectificatoria_fecha_differs_from_golden(
        self,
        golden_analysis: TitleAnalysis,
        hallucinated_analysis: TitleAnalysis,
    ):
        """Confirm the fixture has the expected hallucination in rectificatoria fecha."""
        golden_fecha = golden_analysis.inscripciones[1].rectificatorias[0].fecha.value
        hallucinated_fecha = hallucinated_analysis.inscripciones[1].rectificatorias[0].fecha.value

        assert golden_fecha == "2022-08-19"
        assert hallucinated_fecha == "2023-08-19"
        assert golden_fecha != hallucinated_fecha

    def test_hallucinated_snippets_still_match_pages(
        self,
        hallucinated_analysis: TitleAnalysis,
        pages_by_doc: dict[str, dict[int, str]],
    ):
        """The hallucinated fixture uses real snippets, so snippet-vs-page check passes.

        This proves that snippet matching alone is insufficient to catch value
        hallucinations — the value-vs-snippet check (T024) is needed.
        """
        # Antecesor snippet should match page (snippet is real, value is fabricated)
        insc0 = hallucinated_analysis.inscripciones[0]
        antecesor_evidence = insc0.antecesor.nombre.evidence
        page_text = pages_by_doc[antecesor_evidence.legal_document_id][
            antecesor_evidence.page_number
        ]
        assert check_snippet_match(page_text, antecesor_evidence.snippet) is True

        # Escritura fecha snippet should match page
        insc1 = hallucinated_analysis.inscripciones[1]
        fecha_evidence = insc1.escritura.fecha.evidence
        page_text = pages_by_doc[fecha_evidence.legal_document_id][
            fecha_evidence.page_number
        ]
        assert check_snippet_match(page_text, fecha_evidence.snippet) is True

    async def test_hallucinated_analysis_stats_shape(
        self,
        hallucinated_analysis: TitleAnalysis,
        pages_by_doc: dict[str, dict[int, str]],
    ):
        """Hallucinated fixture through verifier should produce valid stats shape.

        The hallucinated fixture uses REAL snippets (they match the actual
        document text), so snippet-vs-page checks pass for all fields.
        The value fabrications (MINCHELLI, 2023 dates) are detected
        through value-vs-snippet consistency (T025).
        """
        stats = await verify_title_analysis(hallucinated_analysis, pages_by_doc)

        assert stats["verified_count"] == 35
        assert stats["unverified_count"] == 3
        
        failure_paths = {f["path"] for f in stats["failures"]}
        assert "inscripciones[0].antecesor.nombre" in failure_paths
        assert "inscripciones[1].escritura.fecha" in failure_paths
        assert "inscripciones[1].rectificatorias[0].fecha" in failure_paths
        for f in stats["failures"]:
            assert f["reason"] == "value_mismatch"


# ── Edge case and degradation tests ───────────────────────────────────


class TestDegradationRules:
    """Test graceful degradation for edge cases."""

    def test_evidenced_value_with_no_evidence_is_not_verifiable(self):
        """A value with no evidence object cannot be verified."""
        result = verify_evidenced_value(
            value="some value",
            snippet=None,
            page_text="some page text",
        )
        assert result is False

    def test_snippet_match_with_unicode_normalization(self, pages_by_doc: dict):
        """Real document contains 'Curicó' — should match 'Curico' after normalization."""
        page_text = pages_by_doc[DOC_1996_ID][1]
        # The page contains "Conservador de Bienes Raices de Curicó"
        assert check_snippet_match(page_text, "Conservador de Bienes Raices de Curicó") is True
        # Same snippet without accent should also match
        assert check_snippet_match(page_text, "Conservador de Bienes Raices de Curico") is True

    def test_snippet_match_with_different_casing(self, pages_by_doc: dict):
        """Upper/lower case variations should match."""
        page_text = pages_by_doc[DOC_2023_ID][2]
        assert check_snippet_match(
            page_text, "galaz abarca don juan de dios"
        ) is True

    async def test_analysis_with_no_inscripciones_returns_valid_stats(self):
        """An analysis with empty inscripciones should still return valid stats."""
        empty_analysis = TitleAnalysis(
            structure_type="dominio_unico",
            inscripciones=[],
            propietarios_actuales=[],
            alertas=[],
        )
        stats = await verify_title_analysis(empty_analysis, pages_by_doc={})

        assert stats["verified_count"] == 0
        assert stats["unverified_count"] == 0
        assert stats["failures"] == []

    def test_snippet_with_extra_whitespace_in_document(self):
        """Snippet match should work even if the page has extra whitespace."""
        page = "Foja   1338    Número   1322   del   año   1996"
        snippet = "Foja 1338 Número 1322 del año 1996"
        assert check_snippet_match(page, snippet) is True


# ── Cross-checks tests (T025) ─────────────────────────────────────────


class TestCrossChecks:
    """Verify SII and Plano/SAG cross-checks functionality."""

    def test_normalize_role(self):
        from services.legal_title_verification import normalize_role
        assert normalize_role("00067-00023") == "67-23"
        assert normalize_role("67-23") == "67-23"
        assert normalize_role("N° 67-23") == "67-23"
        assert normalize_role("08179-00000") == "8179-0"

    def test_check_superficie_consistency(self):
        from services.legal_title_verification import check_superficie_consistency
        # matches square meters directly
        assert check_superficie_consistency("5.100 m2", 5100.0) is True
        assert check_superficie_consistency("5100 metros cuadrados", 5100.0) is True
        # matches hectares conversion
        assert check_superficie_consistency("0,51 hectáreas", 5100.0) is True
        assert check_superficie_consistency("5.1 hectáreas", 51000.0) is True
        # mismatch
        assert check_superficie_consistency("5.200 m2", 5100.0) is False
        assert check_superficie_consistency(None, 5100.0) is False
        assert check_superficie_consistency("5.100 m2", None) is True

    async def test_verify_title_analysis_cross_check_sii_matching(
        self,
        golden_analysis: TitleAnalysis,
        pages_by_doc: dict[str, dict[int, str]],
    ):
        """Cross-check passes if rol_avaluo matches active SII role."""
        # golden_analysis property_identity.rol_avaluo.value is "67-23"
        stats = await verify_title_analysis(
            golden_analysis,
            pages_by_doc,
            sii_rol_matriz="00067-00023"
        )
        assert stats["verified_count"] == 38
        assert stats["unverified_count"] == 0

    async def test_verify_title_analysis_cross_check_sii_mismatch(
        self,
        golden_analysis: TitleAnalysis,
        pages_by_doc: dict[str, dict[int, str]],
    ):
        """Cross-check fails and degrades if rol_avaluo mismatches active SII role."""
        stats = await verify_title_analysis(
            golden_analysis,
            pages_by_doc,
            sii_rol_matriz="08179-00000"  # mismatch
        )
        assert stats["verified_count"] == 37
        assert stats["unverified_count"] == 1
        assert len(stats["failures"]) == 1
        
        failure = stats["failures"][0]
        assert failure["path"] == "property_identity.rol_avaluo"
        assert failure["reason"] == "sii_mismatch"

    async def test_verify_title_analysis_cross_check_superficie_matching(
        self,
        golden_analysis: TitleAnalysis,
        pages_by_doc: dict[str, dict[int, str]],
    ):
        """Cross-check passes if superficie_texto is consistent with plano_superficie."""
        # golden_analysis property_identity.superficie_texto.value is
        # "26,82 hectáreas"
        stats = await verify_title_analysis(
            golden_analysis,
            pages_by_doc,
            plano_superficie=26.82
        )
        assert stats["verified_count"] == 38
        assert stats["unverified_count"] == 0

    async def test_verify_title_analysis_cross_check_superficie_mismatch(
        self,
        golden_analysis: TitleAnalysis,
        pages_by_doc: dict[str, dict[int, str]],
    ):
        """Cross-check fails if superficie_texto mismatches plano_superficie."""
        stats = await verify_title_analysis(
            golden_analysis,
            pages_by_doc,
            plano_superficie=9999.0  # mismatch
        )
        assert stats["verified_count"] == 37
        assert stats["unverified_count"] == 1
        assert len(stats["failures"]) == 1
        
        failure = stats["failures"][0]
        assert failure["path"] == "property_identity.superficie_texto"
        assert failure["reason"] == "superficie_mismatch"


# ── check_value_snippet_consistency: years divisible by 100 ───────────


class TestCheckValueSnippetConsistencyCenturyYears:
    """For years divisible by 100 the two-digit remainder is 0; accepting
    'cero' or the digit '0' as year evidence would match almost any snippet."""

    def test_year_2000_matches_dos_mil(self):
        assert check_value_snippet_consistency(
            "2000-05-12", "doce de mayo de dos mil"
        ) is True

    def test_year_2000_does_not_match_stray_zero_digit(self):
        assert check_value_snippet_consistency(
            "2000-05-12", "doce de mayo, fojas 150"
        ) is False

    def test_year_1900_matches_mil_novecientos(self):
        assert check_value_snippet_consistency(
            "1900-01-15", "quince de enero de mil novecientos"
        ) is True

    def test_regular_year_still_matches_two_digit_words(self):
        assert check_value_snippet_consistency(
            "2010-03-01", "primero de marzo de dos mil diez"
        ) is True


# ── F3 hardening: thousands in words, token boundaries, ocr_suspect ───


class TestVerifierHardeningThousands:
    """Fojas/números in titles are in the thousands; words-form evidence must
    validate (the pre-migration verifier only handled numbers < 100)."""

    def test_fojas_in_words_validates_thousands(self):
        assert check_value_snippet_consistency(
            "1338-1322", "a fojas mil trescientos treinta y ocho numero mil trescientos veintidos"
        ) is True

    def test_year_token_does_not_match_inside_larger_number(self):
        # "23" must not be accepted as year evidence inside "123" or "2345".
        assert check_value_snippet_consistency(
            "2023-02-02", "dos de febrero, foja 1234, registro 2345"
        ) is False

    def test_day_word_does_not_match_inside_compound_word(self):
        # day 2 "dos" must not match inside "doscientos" (year and month do
        # match here; only the day evidence is missing).
        assert check_value_snippet_consistency(
            "1990-07-02", "doscientos de julio de mil novecientos noventa"
        ) is False


class TestOcrSuspect:
    def test_full_name_with_one_char_ocr_noise_is_suspect(self):
        from services.legal_title_verification import is_ocr_suspect

        assert is_ocr_suspect(
            "Luis Armando Minchel Balladares",
            "a don LUIS ARMANDO MINGHEL BALLADARES vendio",
        ) is True

    def test_minghel_minchel_is_ocr_suspect(self):
        from services.legal_title_verification import is_ocr_suspect

        assert is_ocr_suspect("Minchel", "don LUIS ARMANDO MINGHEL BALLADARES") is True

    def test_hallucinated_surname_is_not_ocr_suspect(self):
        from services.legal_title_verification import is_ocr_suspect

        assert is_ocr_suspect("Minchelli", "don LUIS ARMANDO MINGHEL BALLADARES") is False

    @pytest.mark.asyncio
    async def test_verify_marks_ocr_suspect_reason(self):
        from schemas.legal_titles import Evidence, EvidencedValue, TitleAnalysis
        from schemas.legal_titles import PropietarioActual
        from services.legal_title_verification import verify_title_analysis

        page_text = "comparece don LUIS ARMANDO MINGHEL BALLADARES, agricultor"
        analysis = TitleAnalysis(
            propietarios_actuales=[
                PropietarioActual(
                    nombre=EvidencedValue(
                        value="LUIS ARMANDO MINCHEL BALLADARES",
                        evidence=Evidence(
                            legal_document_id="doc-1",
                            page_number=1,
                            snippet="don LUIS ARMANDO MINGHEL BALLADARES",
                        ),
                    )
                )
            ]
        )
        stats = await verify_title_analysis(analysis, {"doc-1": {1: page_text}})
        reasons = {f["path"]: f["reason"] for f in stats["failures"]}
        assert reasons["propietarios_actuales[0].nombre"] == "value_mismatch_ocr_suspect"
