"""Tests for SDD 007 US2 legal text/page extraction persistence."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from services.legal_text_extraction import (
    LegalDocumentExtractionSource,
    LegalTextExtractionService,
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


async def test_extract_and_persist_document_marks_failed_for_unwired_pdf_converter():
    source = _source(content=b"%PDF-1.7", mime_type="application/pdf")
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
    assert repository.update_job_status.await_args_list[-1].kwargs["status"] == "failed"
    assert repository.update_job_status.await_args_list[-1].kwargs["error_code"] == (
        "unsupported_converter"
    )
    assert repository.update_document_status.await_args_list[-1].kwargs == {
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "extraction_status": "failed",
    }


class FakeStorageBucket:
    def download(self, storage_path: str) -> bytes:
        assert storage_path == f"{PROJECT_ID}/legal/dominio-vigente.txt"
        return (
            b"Inscrita a fojas 4699 numero 3784 del ano 2020 en el Conservador "
            b"de Bienes Raices de Puerto Varas. Rol de avaluo 1234-56."
        )


class FakeStorage:
    def from_(self, bucket: str) -> FakeStorageBucket:
        assert bucket == "project-files"
        return FakeStorageBucket()


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

    def single(self):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        return self.supabase.execute(self)


class FakeSupabase:
    def __init__(self) -> None:
        self.storage = FakeStorage()
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
                    "document_type": "dominio_vigente",
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

    supabase = FakeSupabase()

    result = await run_document_ingestion_job(
        legal_document_id=LEGAL_DOCUMENT_ID,
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        ingestion_job_id=INGESTION_JOB_ID,
        supabase=supabase,
    )

    assert result.status == "needs_review"
    assert supabase.document_updates[-1] == {"extraction_status": "needs_review"}
    assert supabase.job_updates[-1] == {"status": "variables_proposed"}
    variable_by_key = {
        row["variable_key"]: row for row in supabase.inserted_variables
    }
    assert variable_by_key["matriz.inscripcion_fojas"]["value_text"] == "4699"
    assert variable_by_key["matriz.inscripcion_numero"]["value_text"] == "3784"
    assert variable_by_key["matriz.inscripcion_anio"]["value_text"] == "2020"
    assert variable_by_key["matriz.inscripcion_cbr"]["value_text"] == "Puerto Varas"
    assert variable_by_key["matriz.rol_avaluo"]["value_text"] == "1234-56"
    assert variable_by_key["matriz.nombre_predio"]["state"] == "missing"
    evidence_for_fojas = [
        row for row in supabase.inserted_evidence
        if row["variable_resolution_id"] == variable_by_key["matriz.inscripcion_fojas"]["id"]
    ]
    assert evidence_for_fojas[0]["legal_document_id"] == LEGAL_DOCUMENT_ID
    assert evidence_for_fojas[0]["legal_document_page_id"] == PAGE_ID
    assert evidence_for_fojas[0]["snippet_hash"]


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
