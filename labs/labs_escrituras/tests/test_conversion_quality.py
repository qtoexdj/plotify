from lab_escrituras.conversion_quality import evaluate_document_quality, evaluate_page_quality


def legal_body(repeat: int = 18) -> str:
    sentence = (
        "Comparecen las partes a celebrar contrato de compraventa. "
        "La vendedora vende, cede y transfiere el lote numero doce. "
        "El precio se paga al contado. El inmueble rola inscrito a fojas "
        "del Conservador y deslinda con servidumbre segun plano SAG. "
    )
    return sentence * repeat


def test_certification_only_document_is_not_analysis_ready():
    pages = [
        {
            "page_number": index,
            "markdown": (
                f"<!-- Page {index} -->\n\nCertificado Nº 123456\n"
                "Verifique validez en http://www.fojas.cl\nPag: "
                f"{index}/10\nFirma electrónica avanzada. Copia fiel."
            ),
        }
        for index in range(1, 4)
    ]

    quality = evaluate_document_quality(pages)

    assert quality.analysis_ready is False
    assert quality.reason == "certification_only"
    assert quality.usable_pages == []
    assert quality.low_signal_pages == [1, 2, 3]
    assert all(page.status == "boilerplate_only" for page in quality.page_quality)


def test_legal_body_document_is_analysis_ready():
    pages = [
        {"page_number": 1, "markdown": legal_body()},
        {"page_number": 2, "markdown": legal_body()},
    ]

    quality = evaluate_document_quality(pages)

    assert quality.analysis_ready is True
    assert quality.reason == "sufficient_legal_markdown"
    assert quality.usable_pages == [1, 2]
    assert quality.low_signal_pages == []


def test_mixed_document_keeps_only_usable_pages_for_analysis():
    pages = [
        {
            "page_number": 1,
            "markdown": "Certificado Nº 123456\nVerifique validez en http://www.fojas.cl\nPag: 1/3",
        },
        {"page_number": 2, "markdown": legal_body()},
        {"page_number": 3, "markdown": legal_body()},
    ]

    quality = evaluate_document_quality(pages)

    assert quality.analysis_ready is True
    assert quality.usable_pages == [2, 3]
    assert quality.low_signal_pages == [1]


def test_single_page_legal_document_can_be_analysis_ready():
    quality = evaluate_document_quality(
        [
            {
                "page_number": 1,
                "markdown": (
                    "Certificado SAG de subdivisión. La inscripción consta a fojas del Conservador. "
                    "El lote forma parte del plano aprobado y la servidumbre se indica en el documento. "
                    * 12
                ),
            }
        ]
    )

    assert quality.analysis_ready is True
    assert quality.usable_pages == [1]
    assert quality.reason == "sufficient_legal_markdown"


def test_page_score_improves_when_ocr_adds_legal_signal():
    original = evaluate_page_quality(
        page_number=1,
        markdown="Certificado Nº 123456\nVerifique validez en http://www.fojas.cl\nPag: 1/1",
    )
    improved = evaluate_page_quality(
        page_number=1,
        markdown=legal_body(),
    )

    assert original.status == "boilerplate_only"
    assert improved.status == "usable"
    assert improved.score > original.score
