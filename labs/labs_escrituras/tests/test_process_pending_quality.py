from lab_escrituras.config import LabConfig
from lab_escrituras.chunking import chunk_markdown
from lab_escrituras.conversion_quality import evaluate_document_quality
from lab_escrituras.document_converter import ConvertedDocument, ConvertedPage
from lab_escrituras.process_pending import _attempt_quality_ocr, persist_converted_document


def config(tmp_path, *, ocr_enabled=True) -> LabConfig:
    return LabConfig(
        db_url="postgresql://example",
        supabase_url=None,
        supabase_service_role_key=None,
        pdf_inspector_command="pdf2md",
        output_dir=tmp_path / "output",
        ocr_enabled=ocr_enabled,
        ocr_language="spa",
        ocr_dpi=220,
        openai_api_key=None,
        embedding_model="text-embedding-3-small",
        embedding_batch_size=64,
    )


def legal_body(repeat: int = 18) -> str:
    return (
        "Comparecen las partes a celebrar compraventa. La vendedora vende el lote doce. "
        "El precio consta en esta escritura. La inscripción rola a fojas del Conservador. "
        "El lote deslinda con servidumbre y plano SAG. "
        * repeat
    )


def converted_with_pages(pages: list[ConvertedPage]) -> ConvertedDocument:
    return ConvertedDocument(
        source_format="pdf",
        detected_type="TextBased",
        confidence=0.95,
        page_count=len(pages),
        pages=pages,
        raw={"engine": "test"},
    )


def test_quality_ocr_replaces_low_signal_page_when_it_improves(monkeypatch, tmp_path):
    converted = converted_with_pages(
        [
            ConvertedPage(
                page_number=1,
                markdown="Certificado Nº 123\nVerifique validez en http://www.fojas.cl\nPag: 1/1",
            )
        ]
    )
    quality = evaluate_document_quality(converted.pages)
    monkeypatch.setattr("lab_escrituras.process_pending.ocr_pdf_pages", lambda *_args, **_kwargs: legal_body())

    updated, updated_quality = _attempt_quality_ocr(config(tmp_path), tmp_path / "document.pdf", converted, quality)

    assert updated.detected_type == "TextBased+OCR"
    assert "OCR fallback" in updated.pages[0].markdown
    assert updated.pages[0].metadata["ocrApplied"] is True
    assert updated_quality.analysis_ready is True
    assert updated_quality.ocr_applied is True


def test_quality_ocr_keeps_original_page_when_ocr_does_not_improve(monkeypatch, tmp_path):
    original_markdown = "Certificado Nº 123\nVerifique validez en http://www.fojas.cl\nPag: 1/1"
    converted = converted_with_pages([ConvertedPage(page_number=1, markdown=original_markdown)])
    quality = evaluate_document_quality(converted.pages)
    monkeypatch.setattr(
        "lab_escrituras.process_pending.ocr_pdf_pages",
        lambda *_args, **_kwargs: "Certificado Nº 123\nPag: 1/1",
    )

    updated, updated_quality = _attempt_quality_ocr(config(tmp_path), tmp_path / "document.pdf", converted, quality)

    assert updated.detected_type == "TextBased"
    assert updated.pages[0].markdown == original_markdown
    assert updated_quality.analysis_ready is False
    assert updated_quality.ocr_applied is True


class FakeCursor:
    def __init__(self):
        self.chunk_inserts = 0
        self.page_inserts = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, _params=None):
        if "insert into lab_escrituras.document_pages" in sql:
            self.page_inserts += 1
        if "insert into lab_escrituras.document_chunks" in sql:
            self.chunk_inserts += 1

    def fetchone(self):
        return {"id": f"page-{self.page_inserts}"}


class FakeConnection:
    def __init__(self):
        self.cursor_instance = FakeCursor()

    def cursor(self):
        return self.cursor_instance


def test_persist_converted_document_chunks_only_usable_pages():
    converted = converted_with_pages(
        [
            ConvertedPage(
                page_number=1,
                markdown="Certificado Nº 123\nVerifique validez en http://www.fojas.cl\nPag: 1/3",
            ),
            ConvertedPage(page_number=2, markdown=legal_body()),
            ConvertedPage(page_number=3, markdown=legal_body()),
        ]
    )
    quality = evaluate_document_quality(converted.pages)
    conn = FakeConnection()

    persist_converted_document(
        conn,
        {"id": "document-id"},
        converted,
        quality,
    )

    assert conn.cursor_instance.page_inserts == 3
    assert conn.cursor_instance.chunk_inserts == len(chunk_markdown(legal_body())) * 2
