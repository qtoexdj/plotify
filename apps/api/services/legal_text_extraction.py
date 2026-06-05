"""Legal document text extraction and page persistence helpers for SDD 007.

This module intentionally has no database or converter side effects at import
time. Callers may inject a repository/storage reader in tests or workers.
"""

from __future__ import annotations

import asyncio
import hashlib
from io import BytesIO
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from services.legal_variable_catalog import (
    DOCUMENT_INGESTION_JOB_STATUS_SET,
    LEGAL_DOCUMENT_EXTRACTION_STATUS_SET,
)

PIPELINE_VERSION = "sdd_007_text_extraction_v1"
PDF_LOW_TEXT_CHAR_THRESHOLD = 100
SUPPORTED_TEXT_MIME_TYPES = frozenset(
    {
        "text/plain",
        "text/markdown",
        "application/json",
        "application/xml",
        "text/xml",
    }
)
FUTURE_CONVERTER_MIME_TYPES = frozenset(
    {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    }
)
SUPPORTED_PDF_MIME_TYPES = frozenset({"application/pdf"})


class LegalTextExtractionError(ValueError):
    """Base error for extraction failures with a machine-readable code."""

    error_code = "legal_text_extraction_error"


class UnsupportedLegalTextConverterError(LegalTextExtractionError):
    """Raised when a future OCR/converter-backed format is not wired yet."""

    error_code = "unsupported_converter"


class EmptyLegalTextExtractionError(LegalTextExtractionError):
    """Raised when a supported converter cannot recover usable text."""

    error_code = "empty_text_extraction"


class EncryptedLegalTextExtractionError(LegalTextExtractionError):
    """Raised when a source PDF is encrypted and cannot be opened."""

    error_code = "encrypted_pdf"


@dataclass(frozen=True)
class LegalDocumentExtractionSource:
    """Input document bytes and tenant scope required for page persistence."""

    organization_id: str
    project_id: str
    legal_document_id: str
    ingestion_job_id: str
    content: bytes
    mime_type: str
    original_filename: str | None = None
    storage_bucket: str | None = None
    storage_path: str | None = None
    converter: str | None = None


@dataclass(frozen=True)
class ExtractedLegalTextPage:
    page_number: int
    text_content: str
    markdown_content: str | None = None
    page_kind: str = "logical"

    @property
    def char_count(self) -> int:
        return len(self.text_content)

    @property
    def checksum(self) -> str:
        return checksum_text(self.text_content)


@dataclass(frozen=True)
class LegalTextExtractionResult:
    pages: tuple[ExtractedLegalTextPage, ...]
    converter: str
    pipeline_version: str = PIPELINE_VERSION
    stats: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class PersistedLegalTextExtractionResult:
    extraction: LegalTextExtractionResult
    stored_pages: tuple[dict[str, Any], ...]


class LegalTextExtractionRepository(Protocol):
    async def load_document_source(
        self,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
        ingestion_job_id: str | None = None,
    ) -> LegalDocumentExtractionSource:
        ...

    async def replace_document_pages(
        self,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
        ingestion_job_id: str,
        pages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        ...

    async def update_job_status(
        self,
        ingestion_job_id: str,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
        status: str,
        converter: str | None = None,
        stats: dict[str, Any] | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
        completed: bool = False,
    ) -> None:
        ...

    async def update_document_status(
        self,
        legal_document_id: str,
        *,
        organization_id: str,
        project_id: str,
        extraction_status: str,
    ) -> None:
        ...


def checksum_text(text: str) -> str:
    """Return a stable SHA-256 checksum for evidence/page integrity."""

    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def checksum_bytes(content: bytes) -> str:
    """Return a stable SHA-256 checksum for raw document payloads."""

    return hashlib.sha256(content).hexdigest()


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _assert_job_status(status: str) -> None:
    if status not in DOCUMENT_INGESTION_JOB_STATUS_SET:
        raise ValueError(f"Invalid document ingestion job status: {status}")


def _assert_document_status(status: str) -> None:
    if status not in LEGAL_DOCUMENT_EXTRACTION_STATUS_SET:
        raise ValueError(f"Invalid legal document extraction status: {status}")


def _decode_text_content(content: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise LegalTextExtractionError("Unable to decode legal document text")


def split_text_into_logical_pages(
    text: str,
    *,
    max_chars_per_page: int = 12_000,
) -> tuple[ExtractedLegalTextPage, ...]:
    """Split text into deterministic logical pages until physical pages exist."""

    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return (ExtractedLegalTextPage(page_number=1, text_content=""),)

    chunks: list[str] = []
    remaining = normalized
    while len(remaining) > max_chars_per_page:
        boundary = remaining.rfind("\n", 0, max_chars_per_page)
        if boundary <= 0:
            boundary = max_chars_per_page
        chunks.append(remaining[:boundary].strip())
        remaining = remaining[boundary:].strip()
    chunks.append(remaining)

    return tuple(
        ExtractedLegalTextPage(page_number=index, text_content=chunk)
        for index, chunk in enumerate(chunks, start=1)
    )


def _extract_pdf_text_pages(source: LegalDocumentExtractionSource) -> LegalTextExtractionResult:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise UnsupportedLegalTextConverterError(
            "PDF converter dependency pypdf is not installed."
        ) from exc

    try:
        reader = PdfReader(BytesIO(source.content))
        if reader.is_encrypted:
            decrypt_result = reader.decrypt("")
            if not decrypt_result:
                raise EncryptedLegalTextExtractionError(
                    "Encrypted PDF cannot be extracted without a password."
                )
        pages = tuple(
            ExtractedLegalTextPage(
                page_number=index,
                page_kind="physical",
                text_content=(page.extract_text() or "").strip(),
            )
            for index, page in enumerate(reader.pages, start=1)
        )
    except LegalTextExtractionError:
        raise
    except Exception as exc:
        raise LegalTextExtractionError(f"Unable to extract text from PDF: {exc}") from exc

    non_empty_pages = tuple(page for page in pages if page.text_content)
    pages_needing_ocr = tuple(
        page.page_number
        for page in pages
        if page.char_count < PDF_LOW_TEXT_CHAR_THRESHOLD
    )
    if not non_empty_pages:
        raise EmptyLegalTextExtractionError(
            "PDF has no extractable text; OCR/manual review is required."
        )

    return LegalTextExtractionResult(
        pages=non_empty_pages,
        converter="pdf_text",
        stats={
            "page_count": len(pages),
            "text_page_count": len(non_empty_pages),
            "empty_page_count": len(pages) - len(non_empty_pages),
            "low_text_page_count": len(pages_needing_ocr),
            "pages_needing_ocr": list(pages_needing_ocr),
            "ocr_required": bool(pages_needing_ocr),
            "char_count": sum(page.char_count for page in non_empty_pages),
            "raw_sha256_hash": checksum_bytes(source.content),
            "mime_type": source.mime_type,
            "storage_bucket": source.storage_bucket,
            "storage_path": source.storage_path,
        },
    )


async def extract_text_pages(
    source: LegalDocumentExtractionSource,
) -> LegalTextExtractionResult:
    """Extract text pages from supported legal document inputs."""

    mime_type = source.mime_type.split(";")[0].strip().lower()
    if mime_type in SUPPORTED_PDF_MIME_TYPES:
        return _extract_pdf_text_pages(source)
    if mime_type in FUTURE_CONVERTER_MIME_TYPES:
        raise UnsupportedLegalTextConverterError(
            f"Converter for {mime_type} is not implemented yet"
        )
    if mime_type not in SUPPORTED_TEXT_MIME_TYPES:
        raise UnsupportedLegalTextConverterError(
            f"Unsupported legal document MIME type: {source.mime_type}"
        )

    text = _decode_text_content(source.content)
    pages = split_text_into_logical_pages(text)
    converter = source.converter or "manual"
    return LegalTextExtractionResult(
        pages=pages,
        converter=converter,
        stats={
            "page_count": len(pages),
            "char_count": sum(page.char_count for page in pages),
            "raw_sha256_hash": checksum_bytes(source.content),
            "mime_type": source.mime_type,
            "storage_bucket": source.storage_bucket,
            "storage_path": source.storage_path,
        },
    )


def build_page_payloads(
    source: LegalDocumentExtractionSource,
    pages: tuple[ExtractedLegalTextPage, ...],
) -> list[dict[str, Any]]:
    """Build legal_document_pages rows with stable checksums."""

    return [
        {
            "organization_id": source.organization_id,
            "project_id": source.project_id,
            "legal_document_id": source.legal_document_id,
            "ingestion_job_id": source.ingestion_job_id,
            "page_number": page.page_number,
            "page_kind": page.page_kind,
            "text_content": page.text_content,
            "markdown_content": page.markdown_content,
            "char_count": page.char_count,
            "checksum": page.checksum,
        }
        for page in pages
    ]


@dataclass
class LegalTextExtractionService:
    repository: LegalTextExtractionRepository

    async def extract_and_persist_document(
        self,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
        ingestion_job_id: str | None = None,
    ) -> PersistedLegalTextExtractionResult:
        source = await self.repository.load_document_source(
            organization_id=organization_id,
            project_id=project_id,
            legal_document_id=legal_document_id,
            ingestion_job_id=ingestion_job_id,
        )
        return await self.extract_and_persist_text(source)

    async def persist_extracted_pages(
        self,
        source: LegalDocumentExtractionSource,
        extraction: LegalTextExtractionResult,
    ) -> list[dict[str, Any]]:
        pages = build_page_payloads(source, extraction.pages)
        stored_pages = await self.repository.replace_document_pages(
            organization_id=source.organization_id,
            project_id=source.project_id,
            legal_document_id=source.legal_document_id,
            ingestion_job_id=source.ingestion_job_id,
            pages=pages,
        )
        await self.mark_text_extracted(source, extraction)
        return stored_pages

    async def extract_and_persist_text(
        self,
        source: LegalDocumentExtractionSource,
    ) -> PersistedLegalTextExtractionResult:
        await self.mark_processing(source)
        try:
            extraction = await extract_text_pages(source)
            stored_pages = await self.persist_extracted_pages(source, extraction)
            return PersistedLegalTextExtractionResult(
                extraction=extraction,
                stored_pages=tuple(stored_pages),
            )
        except LegalTextExtractionError as exc:
            await self.mark_failed(source, exc.error_code, str(exc))
            raise
        except Exception as exc:
            await self.mark_failed(source, "text_extraction_failed", str(exc))
            raise

    async def mark_processing(self, source: LegalDocumentExtractionSource) -> None:
        await self._set_statuses(
            source,
            job_status="processing",
            document_status="processing",
        )

    async def mark_text_extracted(
        self,
        source: LegalDocumentExtractionSource,
        extraction: LegalTextExtractionResult,
    ) -> None:
        await self._set_statuses(
            source,
            job_status="text_extracted",
            document_status="text_extracted",
            converter=extraction.converter,
            stats=extraction.stats,
            completed=True,
        )

    async def mark_failed(
        self,
        source: LegalDocumentExtractionSource,
        error_code: str,
        error_message: str,
    ) -> None:
        await self._set_statuses(
            source,
            job_status="failed",
            document_status="failed",
            error_code=error_code,
            error_message=error_message,
            completed=True,
        )

    async def _set_statuses(
        self,
        source: LegalDocumentExtractionSource,
        *,
        job_status: str,
        document_status: str,
        converter: str | None = None,
        stats: dict[str, Any] | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
        completed: bool = False,
    ) -> None:
        _assert_job_status(job_status)
        _assert_document_status(document_status)
        await self.repository.update_job_status(
            source.ingestion_job_id,
            organization_id=source.organization_id,
            project_id=source.project_id,
            legal_document_id=source.legal_document_id,
            status=job_status,
            converter=converter,
            stats=stats,
            error_code=error_code,
            error_message=error_message,
            completed=completed,
        )
        await self.repository.update_document_status(
            source.legal_document_id,
            organization_id=source.organization_id,
            project_id=source.project_id,
            extraction_status=document_status,
        )


@dataclass
class SupabaseLegalTextExtractionRepository:
    """Supabase adapter for workers/endpoints; tests should inject a fake repo."""

    supabase: Any

    async def load_document_source(
        self,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
        ingestion_job_id: str | None = None,
    ) -> LegalDocumentExtractionSource:
        def _load() -> LegalDocumentExtractionSource:
            document_result = (
                self.supabase.table("legal_documents")
                .select("*")
                .eq("id", legal_document_id)
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .single()
                .execute()
            )
            document = _first_row(document_result)
            if not document:
                raise LegalTextExtractionError("Legal document not found")

            resolved_job_id = ingestion_job_id or self._latest_ingestion_job_id(
                organization_id=organization_id,
                project_id=project_id,
                legal_document_id=legal_document_id,
            )
            if not resolved_job_id:
                raise LegalTextExtractionError("Document ingestion job not found")

            storage_bucket = str(document.get("storage_bucket") or "")
            storage_path = str(document.get("storage_path") or "")
            if not storage_bucket or not storage_path:
                raise LegalTextExtractionError("Legal document storage reference is missing")

            downloaded = (
                self.supabase.storage.from_(storage_bucket).download(storage_path)
            )
            content = _storage_download_to_bytes(downloaded)

            return LegalDocumentExtractionSource(
                organization_id=organization_id,
                project_id=project_id,
                legal_document_id=legal_document_id,
                ingestion_job_id=resolved_job_id,
                content=content,
                mime_type=str(document.get("mime_type") or ""),
                original_filename=document.get("original_filename"),
                storage_bucket=storage_bucket,
                storage_path=storage_path,
            )

        return await asyncio.to_thread(_load)

    def _latest_ingestion_job_id(
        self,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
    ) -> str | None:
        result = (
            self.supabase.table("document_ingestion_jobs")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .eq("legal_document_id", legal_document_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        row = _first_row(result)
        return str(row["id"]) if row and row.get("id") else None

    async def replace_document_pages(
        self,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
        ingestion_job_id: str,
        pages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        def _replace() -> list[dict[str, Any]]:
            (
                self.supabase.table("legal_document_pages")
                .delete()
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .eq("legal_document_id", legal_document_id)
                .eq("ingestion_job_id", ingestion_job_id)
                .execute()
            )
            if not pages:
                return []
            result = self.supabase.table("legal_document_pages").insert(pages).execute()
            return result.data or []

        return await asyncio.to_thread(_replace)

    async def update_job_status(
        self,
        ingestion_job_id: str,
        *,
        organization_id: str,
        project_id: str,
        legal_document_id: str,
        status: str,
        converter: str | None = None,
        stats: dict[str, Any] | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
        completed: bool = False,
    ) -> None:
        _assert_job_status(status)
        payload: dict[str, Any] = {
            "status": status,
            "error_code": error_code,
            "error_message": error_message,
        }
        if converter is not None:
            payload["converter"] = converter
        if stats is not None:
            payload["stats"] = stats
        if status == "processing":
            payload["started_at"] = utc_now_iso()
        if completed:
            payload["completed_at"] = utc_now_iso()

        await asyncio.to_thread(
            lambda: (
                self.supabase.table("document_ingestion_jobs")
                .update(payload)
                .eq("id", ingestion_job_id)
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .eq("legal_document_id", legal_document_id)
                .execute()
            )
        )

    async def update_document_status(
        self,
        legal_document_id: str,
        *,
        organization_id: str,
        project_id: str,
        extraction_status: str,
    ) -> None:
        _assert_document_status(extraction_status)
        await asyncio.to_thread(
            lambda: (
                self.supabase.table("legal_documents")
                .update({"extraction_status": extraction_status})
                .eq("id", legal_document_id)
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .execute()
            )
        )


def create_default_legal_text_extraction_service() -> LegalTextExtractionService:
    """Create the service with a lazily imported Supabase client."""

    from core.database import get_supabase_client

    return LegalTextExtractionService(
        repository=SupabaseLegalTextExtractionRepository(get_supabase_client())
    )


def _first_row(result: Any) -> dict[str, Any] | None:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return data[0] if data else None
    if isinstance(data, dict):
        return data
    return None


def _storage_download_to_bytes(downloaded: Any) -> bytes:
    if isinstance(downloaded, bytes):
        return downloaded
    if isinstance(downloaded, bytearray):
        return bytes(downloaded)
    if isinstance(downloaded, str):
        return downloaded.encode("utf-8")
    content = getattr(downloaded, "content", None)
    if isinstance(content, bytes):
        return content
    data = getattr(downloaded, "data", None)
    if isinstance(data, bytes):
        return data
    read = getattr(downloaded, "read", None)
    if callable(read):
        value = read()
        if isinstance(value, bytes):
            return value
    raise LegalTextExtractionError("Unable to read legal document storage bytes")
