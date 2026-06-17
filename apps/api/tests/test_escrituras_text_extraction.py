"""Tests for SDD 007 US2 legal text/page extraction persistence."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import AsyncMock

import pytest

from services.legal_text_extraction import (
    ExtractedLegalTextPage,
    LegalDocumentExtractionSource,
    LegalTextExtractionResult,
    LegalTextExtractionService,
    OcrRequiredLegalTextExtractionError,
    UnsupportedLegalTextConverterError,
)


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LEGAL_DOCUMENT_ID = "00000000-0000-4000-8000-000000000003"
INGESTION_JOB_ID = "00000000-0000-4000-8000-000000000004"
PAGE_ID = "00000000-0000-4000-8000-000000000005"


class FakeTextExtractionRepository:
    def __init__(self, source: LegalDocumentExtractionSource) -> None:
        self.source = source
        self.load_document_source = AsyncMock(return_value=source)
        self.replace_document_pages = AsyncMock(side_effect=lambda **kwargs: kwargs["pages"])
        self.update_job_status = AsyncMock()
        self.update_document_status = AsyncMock()


def _source(*, content: bytes, mime_type: str = "text/plain") -> LegalDocumentExtractionSource:
    return LegalDocumentExtractionSource(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=LEGAL_DOCUMENT_ID,
        ingestion_job_id=INGESTION_JOB_ID,
        content=content,
        mime_type=mime_type,
        original_filename="dominio-vigente.txt",
        storage_bucket="project-files",
        storage_path=f"{PROJECT_ID}/legal/dominio-vigente.txt",
    )


def _text_pdf_bytes(*page_texts: str) -> bytes:
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    resources = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
    )

    for page_text in page_texts:
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = resources
        if page_text:
            stream = DecodedStreamObject()
            escaped = page_text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            stream.set_data(f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("utf-8"))
            page[NameObject("/Contents")] = stream

    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


async def test_extract_and_persist_document_replaces_pages_and_marks_text_extracted():
    source = _source(content=b"fojas 4699\nnumero 3784\nano 2020")
    repository = FakeTextExtractionRepository(source)
    service = LegalTextExtractionService(repository=repository)

    result = await service.extract_and_persist_document(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=LEGAL_DOCUMENT_ID,
        ingestion_job_id=INGESTION_JOB_ID,
    )

    repository.load_document_source.assert_awaited_once_with(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=LEGAL_DOCUMENT_ID,
        ingestion_job_id=INGESTION_JOB_ID,
    )
    repository.replace_document_pages.assert_awaited_once()
    persisted_pages = repository.replace_document_pages.await_args.kwargs["pages"]
    assert persisted_pages == [
        {
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "legal_document_id": LEGAL_DOCUMENT_ID,
            "ingestion_job_id": INGESTION_JOB_ID,
            "page_number": 1,
            "page_kind": "logical",
            "text_content": "fojas 4699\nnumero 3784\nano 2020",
            "markdown_content": None,
            "char_count": 31,
            "checksum": persisted_pages[0]["checksum"],
        }
    ]
    assert result.extraction.stats["page_count"] == 1
    assert result.extraction.stats["char_count"] == 31
    assert result.extraction.stats["storage_bucket"] == "project-files"
    assert result.extraction.stats["storage_path"] == f"{PROJECT_ID}/legal/dominio-vigente.txt"
    assert result.stored_pages == tuple(persisted_pages)
    assert repository.update_job_status.await_args_list[-1].kwargs["status"] == "text_extracted"
    assert repository.update_job_status.await_args_list[-1].kwargs["completed"] is True
    assert repository.update_document_status.await_args_list[-1].kwargs == {
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "extraction_status": "text_extracted",
    }


async def test_extract_and_persist_document_extracts_textual_pdf_and_marks_ocr_candidates():
    source = _source(
        content=_text_pdf_bytes(
            (
                "Certificado SII LOTE 1 SECTOR EL CONDOR 08179-00001. "
                "Texto suficiente para superar el umbral de baja señal y "
                "mantener esta página como evidencia textual confiable."
            ),
            "",
        ),
        mime_type="application/pdf",
    )
    repository = FakeTextExtractionRepository(source)
    service = LegalTextExtractionService(repository=repository)

    result = await service.extract_and_persist_document(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=LEGAL_DOCUMENT_ID,
        ingestion_job_id=INGESTION_JOB_ID,
    )

    persisted_pages = repository.replace_document_pages.await_args.kwargs["pages"]
    assert persisted_pages[0]["page_kind"] == "physical"
    assert persisted_pages[0]["page_number"] == 1
    assert "08179-00001" in persisted_pages[0]["text_content"]
    assert result.extraction.converter == "pdf_text"
    assert result.extraction.stats["page_count"] == 2
    assert result.extraction.stats["text_page_count"] == 1
    assert result.extraction.stats["empty_page_count"] == 1
    assert result.extraction.stats["pages_needing_ocr"] == [2]
    assert result.extraction.stats["ocr_required"] is True
    assert repository.update_job_status.await_args_list[-1].kwargs["status"] == "text_extracted"


async def test_extract_and_persist_document_uses_ocr_fallback_for_image_only_pdf(monkeypatch):
    source = _source(content=_text_pdf_bytes(""), mime_type="application/pdf")
    repository = FakeTextExtractionRepository(source)
    service = LegalTextExtractionService(repository=repository)

    def fake_ocr_pages(source: LegalDocumentExtractionSource, *, page_count: int):
        assert page_count == 1
        return LegalTextExtractionResult(
            pages=(
                ExtractedLegalTextPage(
                    page_number=1,
                    page_kind="ocr_image",
                    text_content=(
                        "Certificado SII LOTE 1 SECTOR EL CONDOR 08179-00001"
                    ),
                ),
            ),
            converter="ocr",
            stats={
                "page_count": 1,
                "text_page_count": 1,
                "empty_page_count": 0,
                "low_text_page_count": 1,
                "pages_needing_ocr": [1],
                "ocr_required": False,
                "ocr_status": "succeeded",
                "char_count": 59,
                "raw_sha256_hash": "patched",
                "mime_type": source.mime_type,
            },
        )

    monkeypatch.setattr(
        "services.legal_text_extraction._extract_pdf_ocr_pages",
        fake_ocr_pages,
    )

    result = await service.extract_and_persist_document(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=LEGAL_DOCUMENT_ID,
        ingestion_job_id=INGESTION_JOB_ID,
    )

    persisted_pages = repository.replace_document_pages.await_args.kwargs["pages"]
    assert persisted_pages[0]["page_kind"] == "ocr_image"
    assert persisted_pages[0]["text_content"] == (
        "Certificado SII LOTE 1 SECTOR EL CONDOR 08179-00001"
    )
    assert result.extraction.converter == "ocr"
    assert result.extraction.stats["ocr_status"] == "succeeded"
    assert result.extraction.stats["ocr_required"] is False
    assert repository.update_job_status.await_args_list[-1].kwargs["converter"] == "ocr"
    assert repository.update_job_status.await_args_list[-1].kwargs["status"] == (
        "text_extracted"
    )


async def test_extract_and_persist_document_marks_ocr_required_when_pdf_has_no_text():
    source = _source(content=_text_pdf_bytes(""), mime_type="application/pdf")
    repository = FakeTextExtractionRepository(source)
    service = LegalTextExtractionService(repository=repository)

    with pytest.raises(OcrRequiredLegalTextExtractionError):
        await service.extract_and_persist_document(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            legal_document_id=LEGAL_DOCUMENT_ID,
            ingestion_job_id=INGESTION_JOB_ID,
        )

    repository.replace_document_pages.assert_not_awaited()
    assert repository.update_job_status.await_args_list[-1].kwargs["status"] == "failed"
    assert repository.update_job_status.await_args_list[-1].kwargs["error_code"] == (
        "ocr_required"
    )
    assert repository.update_job_status.await_args_list[-1].kwargs["stats"][
        "ocr_required"
    ] is True
    assert repository.update_job_status.await_args_list[-1].kwargs["stats"][
        "ocr_status"
    ] == "required"
    assert repository.update_document_status.await_args_list[-1].kwargs == {
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "extraction_status": "failed",
    }


async def test_extract_and_persist_document_marks_failed_for_unwired_docx_converter():
    source = _source(
        content=b"PK\x03\x04",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    repository = FakeTextExtractionRepository(source)
    service = LegalTextExtractionService(repository=repository)

    with pytest.raises(UnsupportedLegalTextConverterError):
        await service.extract_and_persist_document(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            legal_document_id=LEGAL_DOCUMENT_ID,
            ingestion_job_id=INGESTION_JOB_ID,
        )

    repository.replace_document_pages.assert_not_awaited()
    assert repository.update_job_status.await_args_list[-1].kwargs["error_code"] == (
        "unsupported_converter"
    )


class FakeStorageBucket:
    def __init__(self, document_type: str = "dominio_vigente") -> None:
        self.document_type = document_type

    def download(self, storage_path: str) -> bytes:
        if self.document_type == "certificado_roles_sii":
            return (
                b"Certificado de Asignacion de Roles numero CAR-2026-001. "
                b"Fecha de emision 04-06-2026. Solicitud F2118 998877. "
                b"Comuna TENO. "
                b"Rol matriz 123-45. Unidad Lote 29 Rol de avaluo en tramite 08179-00029."
            )
        return (
            b"Inscrita a fojas 4699 numero 3784 del ano 2020 en el Conservador "
            b"de Bienes Raices de Puerto Varas. Rol de avaluo 1234-56."
        )


class FakeStorage:
    def __init__(self, document_type: str = "dominio_vigente") -> None:
        self.document_type = document_type

    def from_(self, bucket: str) -> FakeStorageBucket:
        assert bucket == "project-files"
        return FakeStorageBucket(document_type=self.document_type)


class FakeSupabaseTable:
    def __init__(self, supabase: "FakeSupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.operation = "select"
        self.payload = None

    def select(self, *_args):
        self.operation = "select"
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, *_args):
        return self

    def neq(self, *_args):
        return self

    def is_(self, *_args):
        return self

    def single(self):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        return self.supabase.execute(self)


class FakeSupabase:
    def __init__(self, document_type: str = "dominio_vigente") -> None:
        self.document_type = document_type
        self.storage = FakeStorage(document_type=document_type)
        self.inserted_variables = []
        self.inserted_evidence = []
        self.document_updates = []
        self.job_updates = []
        self.page_rows = []

    def table(self, name: str) -> FakeSupabaseTable:
        return FakeSupabaseTable(self, name)

    def execute(self, table: FakeSupabaseTable):
        from types import SimpleNamespace

        if table.name == "legal_documents" and table.operation == "select":
            return SimpleNamespace(
                data={
                    "id": LEGAL_DOCUMENT_ID,
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "document_type": self.document_type,
                    "source_field": "doc_dominio_vigente",
                    "storage_bucket": "project-files",
                    "storage_path": f"{PROJECT_ID}/legal/dominio-vigente.txt",
                    "original_filename": "dominio-vigente.txt",
                    "mime_type": "text/plain",
                    "file_size_bytes": 128,
                    "sha256_hash": "a" * 64,
                    "version_number": 1,
                    "upload_source": "api",
                    "extraction_status": "queued",
                }
            )
        if table.name == "legal_documents" and table.operation == "update":
            self.document_updates.append(table.payload)
            return SimpleNamespace(data=[table.payload])
        if table.name == "document_ingestion_jobs" and table.operation == "update":
            self.job_updates.append(table.payload)
            return SimpleNamespace(data=[table.payload])
        if table.name == "legal_document_pages" and table.operation == "delete":
            self.page_rows.clear()
            return SimpleNamespace(data=[])
        if table.name == "legal_document_pages" and table.operation == "insert":
            self.page_rows = [
                {**row, "id": PAGE_ID if index == 0 else f"{PAGE_ID}-{index}"}
                for index, row in enumerate(table.payload)
            ]
            return SimpleNamespace(data=self.page_rows)
        if table.name == "variable_resolutions" and table.operation == "insert":
            self.inserted_variables = [
                {**row, "id": f"variable-{index}"}
                for index, row in enumerate(table.payload)
            ]
            return SimpleNamespace(data=self.inserted_variables)
        if table.name == "document_evidence" and table.operation == "insert":
            self.inserted_evidence = table.payload
            return SimpleNamespace(data=self.inserted_evidence)
        return SimpleNamespace(data=[])


async def test_ingestion_job_persists_variable_proposals_and_document_evidence():
    from services.legal_document_ingestion import run_document_ingestion_job

    supabase = FakeSupabase(document_type="certificado_roles_sii")

    result = await run_document_ingestion_job(
        legal_document_id=LEGAL_DOCUMENT_ID,
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        ingestion_job_id=INGESTION_JOB_ID,
        supabase=supabase,
    )

    assert result.status == "variables_proposed"
    assert supabase.document_updates[-1] == {"extraction_status": "variables_proposed"}
    assert supabase.job_updates[-1] == {"status": "variables_proposed"}
    variable_by_key = {
        row["variable_key"]: row for row in supabase.inserted_variables
    }
    assert variable_by_key["sii.rol_matriz"]["value_text"] == "123-45"
    assert variable_by_key["sii.pre_rol_lote"]["value_text"] == "08179-00029"
    assert variable_by_key["sii.unidad_nombre"]["value_text"] == "Unidad Lote 29"
    evidence_for_rol = [
        row for row in supabase.inserted_evidence
        if row["variable_resolution_id"] == variable_by_key["sii.rol_matriz"]["id"]
    ]
    assert evidence_for_rol[0]["legal_document_id"] == LEGAL_DOCUMENT_ID
    assert evidence_for_rol[0]["legal_document_page_id"] == PAGE_ID
    assert evidence_for_rol[0]["snippet_hash"]


async def test_mark_variables_resolved_maps_needs_review_document_status_to_job_terminal_status():
    from services.legal_document_ingestion import mark_variables_resolved

    supabase = FakeSupabase()

    await mark_variables_resolved(
        supabase=supabase,
        legal_document_id=LEGAL_DOCUMENT_ID,
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        ingestion_job_id=INGESTION_JOB_ID,
        status="needs_review",
    )

    assert supabase.document_updates[-1] == {"extraction_status": "needs_review"}
    assert supabase.job_updates[-1] == {"status": "variables_proposed"}


async def test_ocr_missing_python_dependencies_raises_error(monkeypatch):
    import sys
    from core.config import get_settings

    # Habilitar OCR en settings
    settings = get_settings()
    monkeypatch.setattr(settings, "LEGAL_TEXT_OCR_ENABLED", True)

    # Provocar ImportError al importar pdf2image/pytesseract
    monkeypatch.setitem(sys.modules, "pdf2image", None)
    monkeypatch.setitem(sys.modules, "pytesseract", None)

    source = _source(content=_text_pdf_bytes(""), mime_type="application/pdf")
    repository = FakeTextExtractionRepository(source)
    service = LegalTextExtractionService(repository=repository)

    with pytest.raises(OcrRequiredLegalTextExtractionError) as exc_info:
        await service.extract_and_persist_document(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            legal_document_id=LEGAL_DOCUMENT_ID,
            ingestion_job_id=INGESTION_JOB_ID,
        )

    assert exc_info.value.stats["ocr_status"] == "unavailable"
    assert repository.update_job_status.await_args_list[-1].kwargs["error_code"] == "ocr_required"


async def test_ocr_missing_poppler_raises_error(monkeypatch):
    from core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "LEGAL_TEXT_OCR_ENABLED", True)

    try:
        from pdf2image.exceptions import PDFInfoNotInstalledError
    except ImportError:
        class PDFInfoNotInstalledError(Exception):
            pass

    def mock_convert(*args, **kwargs):
        raise PDFInfoNotInstalledError("Unable to get page count. Poppler is not installed?")

    try:
        import pdf2image
        monkeypatch.setattr(pdf2image, "convert_from_bytes", mock_convert)
    except ImportError:
        class FakePdf2Image:
            @staticmethod
            def convert_from_bytes(*args, **kwargs):
                raise PDFInfoNotInstalledError("Poppler missing")
        import sys
        monkeypatch.setitem(sys.modules, "pdf2image", FakePdf2Image)

    # Mockear pytesseract también para evitar que la importación falle temprano en la máquina de pruebas
    try:
        import pytesseract
    except ImportError:
        class FakePyTesseract:
            @staticmethod
            def image_to_string(*args, **kwargs):
                return "fake"
        import sys
        monkeypatch.setitem(sys.modules, "pytesseract", FakePyTesseract)

    source = _source(content=_text_pdf_bytes(""), mime_type="application/pdf")
    repository = FakeTextExtractionRepository(source)
    service = LegalTextExtractionService(repository=repository)

    with pytest.raises(Exception) as exc_info:
        await service.extract_and_persist_document(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            legal_document_id=LEGAL_DOCUMENT_ID,
            ingestion_job_id=INGESTION_JOB_ID,
        )

    # Dado que es TDD y el error real de Poppler (PDFInfoNotInstalledError) se propaga
    # (o lanza un Exception genérico que resolveremos en T093),
    # asertamos que el mensaje del error mencione "poppler".
    assert "poppler" in str(exc_info.value).lower() or (exc_info.value.__cause__ and "poppler" in str(exc_info.value.__cause__).lower())
    assert repository.update_job_status.await_args_list[-1].kwargs["error_code"] == "poppler_not_found"


async def test_ocr_missing_tesseract_raises_error(monkeypatch):
    from core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "LEGAL_TEXT_OCR_ENABLED", True)

    try:
        from pytesseract import TesseractNotFoundError
    except ImportError:
        class TesseractNotFoundError(Exception):
            pass

    def mock_convert_ok(*args, **kwargs):
        return ["fake_image_object"]

    def mock_ocr(*args, **kwargs):
        raise TesseractNotFoundError("tesseract is not installed or it's not in your PATH")

    try:
        import pdf2image
        monkeypatch.setattr(pdf2image, "convert_from_bytes", mock_convert_ok)
    except ImportError:
        class FakePdf2Image:
            @staticmethod
            def convert_from_bytes(*args, **kwargs):
                return ["fake_image_object"]
        import sys
        monkeypatch.setitem(sys.modules, "pdf2image", FakePdf2Image)

    try:
        import pytesseract
        monkeypatch.setattr(pytesseract, "image_to_string", mock_ocr)
    except ImportError:
        class FakePyTesseract:
            @staticmethod
            def image_to_string(*args, **kwargs):
                raise TesseractNotFoundError("Tesseract missing")
        import sys
        monkeypatch.setitem(sys.modules, "pytesseract", FakePyTesseract)

    source = _source(content=_text_pdf_bytes(""), mime_type="application/pdf")
    repository = FakeTextExtractionRepository(source)
    service = LegalTextExtractionService(repository=repository)

    with pytest.raises(Exception) as exc_info:
        await service.extract_and_persist_document(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            legal_document_id=LEGAL_DOCUMENT_ID,
            ingestion_job_id=INGESTION_JOB_ID,
        )

    assert "tesseract" in str(exc_info.value).lower() or "tesseract" in str(exc_info.value.__cause__).lower()
    # En T093 capturaremos el error y asignaremos "tesseract_not_found" al job
    assert repository.update_job_status.await_args_list[-1].kwargs["error_code"] == "tesseract_not_found"


async def test_ocr_timeout_expired_raises_error(monkeypatch):
    import subprocess
    from core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "LEGAL_TEXT_OCR_ENABLED", True)

    def mock_convert_ok(*args, **kwargs):
        return ["fake_image_object"]

    def mock_ocr_timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="tesseract", timeout=10)

    try:
        import pdf2image
        monkeypatch.setattr(pdf2image, "convert_from_bytes", mock_convert_ok)
    except ImportError:
        class FakePdf2Image:
            @staticmethod
            def convert_from_bytes(*args, **kwargs):
                return ["fake_image_object"]
        import sys
        monkeypatch.setitem(sys.modules, "pdf2image", FakePdf2Image)

    try:
        import pytesseract
        monkeypatch.setattr(pytesseract, "image_to_string", mock_ocr_timeout)
    except ImportError:
        class FakePyTesseract:
            @staticmethod
            def image_to_string(*args, **kwargs):
                raise subprocess.TimeoutExpired(cmd="tesseract", timeout=10)
        import sys
        monkeypatch.setitem(sys.modules, "pytesseract", FakePyTesseract)

    source = _source(content=_text_pdf_bytes(""), mime_type="application/pdf")
    repository = FakeTextExtractionRepository(source)
    service = LegalTextExtractionService(repository=repository)

    with pytest.raises(Exception) as exc_info:
        await service.extract_and_persist_document(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            legal_document_id=LEGAL_DOCUMENT_ID,
            ingestion_job_id=INGESTION_JOB_ID,
        )

    assert "tesseract" in str(exc_info.value).lower() or "timeout" in str(exc_info.value).lower()
    # En T093 capturaremos el error y asignaremos "ocr_timeout" al job
    assert repository.update_job_status.await_args_list[-1].kwargs["error_code"] == "ocr_timeout"


async def test_ingestion_job_queues_title_analysis_for_title_document():
    from services.legal_document_ingestion import run_document_ingestion_job

    supabase = FakeSupabase()
    mock_redis = AsyncMock()

    result = await run_document_ingestion_job(
        legal_document_id=LEGAL_DOCUMENT_ID,
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        ingestion_job_id=INGESTION_JOB_ID,
        supabase=supabase,
        redis=mock_redis,
    )

    assert result.status == "variables_proposed"
    mock_redis.enqueue_job.assert_awaited_once_with(
        "analyze_project_title",
        {
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
        }
    )


