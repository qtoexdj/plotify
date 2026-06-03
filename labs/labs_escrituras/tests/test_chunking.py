from lab_escrituras.chunking import chunk_markdown, detect_section_label


def test_detect_section_label_for_legal_domains():
    assert detect_section_label("Inscrita a fojas 123 en el Conservador") == "matriz_dominio"
    assert detect_section_label("Resolucion SAG y plano archivado") == "sag_plano"
    assert detect_section_label("Servidumbre de transito") == "servidumbre"


def test_chunk_markdown_keeps_order_and_labels():
    chunks = chunk_markdown(
        "Comparecen las partes.\n\n"
        "El lote numero uno tiene una superficie de 5000 metros cuadrados.\n\n"
        "El precio se paga al contado.",
        max_chars=90,
    )

    assert [chunk.index for chunk in chunks] == list(range(len(chunks)))
    assert chunks[0].section_label == "comparecencia"
    assert any(chunk.section_label == "lote" for chunk in chunks)
    assert any(chunk.section_label == "precio" for chunk in chunks)
