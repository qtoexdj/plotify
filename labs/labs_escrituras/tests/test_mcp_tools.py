from lab_escrituras.mcp_tools import _analysis_readiness, _quality_report_markdown, get_analysis_guidance, safe_slug


def test_safe_slug_removes_unsafe_characters():
    assert safe_slug(" Escritura / Lote Nº 12.pdf ") == "Escritura-Lote-N-12.pdf"
    assert safe_slug("!!!", "fallback") == "fallback"


def test_analysis_guidance_exposes_llm_contract():
    guidance = get_analysis_guidance()["guidance"]

    assert "manual_review" in guidance["allowed_future_sources"]
    assert "canonical_variable" in guidance["variable_fields"]
    assert any(example["canonical_variable"] == "lote.numero" for example in guidance["examples"])
    assert any("analysis_readiness.ready is false" in rule for rule in guidance["rules"])


def test_analysis_readiness_uses_quality_summary():
    document = {
        "processing_status": "low_quality_extraction",
        "layout_metadata": {
            "quality_summary": {
                "analysis_ready": False,
                "reason": "certification_only",
                "usable_pages": [],
                "low_signal_pages": [1, 2],
                "ocr_applied": True,
            }
        },
    }

    readiness = _analysis_readiness(document)

    assert readiness["ready"] is False
    assert readiness["reason"] == "certification_only"
    assert readiness["low_signal_pages"] == [1, 2]
    assert "do not invent variables" in readiness["warning"]


def test_quality_report_markdown_includes_page_metrics():
    document = {
        "id": "doc-1",
        "original_filename": "escritura.pdf",
        "processing_status": "low_quality_extraction",
        "layout_metadata": {
            "quality_summary": {
                "analysis_ready": False,
                "reason": "certification_only",
                "usable_pages": [],
                "low_signal_pages": [1],
                "ocr_applied": True,
                "pages": [
                    {
                        "page_number": 1,
                        "status": "boilerplate_only",
                        "word_count": 18,
                        "legal_term_hits": 0,
                        "boilerplate_hits": 3,
                        "boilerplate_ratio": 1.0,
                        "repeated_page_ratio": 1.0,
                        "reason": "certification_or_validation_boilerplate",
                    }
                ],
            }
        },
    }

    report = _quality_report_markdown(document)

    assert "# Quality Report: escritura.pdf" in report
    assert "`analysis_ready`: False" in report
    assert "boilerplate_only" in report
