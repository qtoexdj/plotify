"""Legal document registration service for SDD 007.

This module keeps registration logic independent from FastAPI and arq so it can
be used by future endpoints, upload hooks, and workers without import-time side
effects.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Mapping

from schemas.legal_variables import (
    DocumentIngestionJobResponse,
    LegalDocumentRegisterRequest,
    LegalDocumentResponse,
)
from services import legal_variable_catalog as catalog


PIPELINE_VERSION = "sdd_007_v1"
DEFAULT_STORAGE_BUCKET = "project-files"
QUEUED_STATUS = "queued"
ACTIVE_DOCUMENT_STATUSES = (
    "pending",
    "queued",
    "processing",
    "text_extracted",
    "variables_proposed",
    "needs_review",
    "failed",
)

SUPPORTED_MIME_TYPES: frozenset[str] = frozenset(
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/rtf",
        "text/rtf",
        "image/jpeg",
        "image/png",
        "image/tiff",
    }
)

SUPPORTED_EXTENSIONS_BY_MIME: dict[str, tuple[str, ...]] = {
    "application/pdf": (".pdf",),
    "application/msword": (".doc",),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (
        ".docx",
    ),
    "application/rtf": (".rtf",),
    "text/rtf": (".rtf",),
    "image/jpeg": (".jpg", ".jpeg"),
    "image/png": (".png",),
    "image/tiff": (".tif", ".tiff"),
}


class LegalDocumentIngestionError(Exception):
    """Base exception for legal document ingestion service errors."""


class LegalDocumentValidationError(LegalDocumentIngestionError, ValueError):
    """Raised when registration input cannot be persisted safely."""


class LegalDocumentScopeError(LegalDocumentIngestionError, PermissionError):
    """Raised when project or lot scope does not match the organization."""


class LegalDocumentNotFoundError(LegalDocumentIngestionError, LookupError):
    """Raised when a referenced project, lot, document, or job is missing."""


@dataclass(frozen=True, slots=True)
class LegalDocumentRegistrationInput:
    organization_id: str
    project_id: str
    lot_id: str | None
    document_type: str
    source_field: str | None
    storage_bucket: str
    storage_path: str
    original_filename: str
    mime_type: str
    file_size_bytes: int
    sha256_hash: str | None
    upload_source: str
    uploaded_by: str | None

    @classmethod
    def from_schema(
        cls, payload: LegalDocumentRegisterRequest
    ) -> "LegalDocumentRegistrationInput":
        data = payload.model_dump()
        return cls(**data)


@dataclass(frozen=True, slots=True)
class LegalDocumentRegistrationResult:
    legal_document: LegalDocumentResponse
    ingestion_job: DocumentIngestionJobResponse


@dataclass(frozen=True, slots=True)
class LegalDocumentIngestionRunResult:
    legal_document_id: str
    organization_id: str
    project_id: str
    ingestion_job_id: str | None
    status: str


def _get_supabase_client() -> Any:
    from core.database import get_supabase_client

    return get_supabase_client()


async def _run_supabase(operation: Any) -> Any:
    return await asyncio.to_thread(operation)


def _first_row(result: Any) -> dict[str, Any] | None:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return data[0] if data else None
    if isinstance(data, dict):
        return data
    return None


def _rows(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def _normalize_mapping(payload: Mapping[str, Any]) -> LegalDocumentRegistrationInput:
    return LegalDocumentRegistrationInput.from_schema(
        LegalDocumentRegisterRequest.model_validate(payload)
    )


def normalize_registration_input(
    payload: LegalDocumentRegisterRequest
    | LegalDocumentRegistrationInput
    | Mapping[str, Any],
) -> LegalDocumentRegistrationInput:
    if isinstance(payload, LegalDocumentRegistrationInput):
        return payload
    if isinstance(payload, LegalDocumentRegisterRequest):
        return LegalDocumentRegistrationInput.from_schema(payload)
    return _normalize_mapping(payload)


def _validate_non_empty(value: str | None, field_name: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise LegalDocumentValidationError(f"{field_name} is required.")
    return normalized


def _validate_storage_path(project_id: str, storage_path: str) -> str:
    normalized = _validate_non_empty(storage_path, "storage_path")
    if normalized.startswith("/") or ".." in normalized.split("/"):
        raise LegalDocumentValidationError(
            "storage_path must be a relative object path."
        )
    if project_id not in normalized:
        raise LegalDocumentValidationError(
            "storage_path must include the project_id namespace."
        )
    return normalized


def _validate_mime_and_extension(mime_type: str, filename: str, storage_path: str) -> str:
    normalized_mime = _validate_non_empty(mime_type, "mime_type").lower()
    if normalized_mime not in SUPPORTED_MIME_TYPES:
        raise LegalDocumentValidationError(
            f"Unsupported legal document MIME: {mime_type}"
        )

    allowed_extensions = SUPPORTED_EXTENSIONS_BY_MIME[normalized_mime]
    candidates = (filename.lower(), storage_path.lower())
    if not any(candidate.endswith(allowed_extensions) for candidate in candidates):
        raise LegalDocumentValidationError(
            "original_filename or storage_path extension must match mime_type."
        )
    return normalized_mime


def _validate_sha256(value: str | None) -> str:
    if value is None or not value.strip():
        raise LegalDocumentValidationError(
            "sha256_hash is required for legal document registration."
        )

    normalized = value.strip().lower()
    if len(normalized) != 64 or any(
        char not in "0123456789abcdef" for char in normalized
    ):
        raise LegalDocumentValidationError(
            "sha256_hash must be a 64 character hex digest."
        )
    return normalized


def validate_registration_input(
    payload: LegalDocumentRegistrationInput,
) -> LegalDocumentRegistrationInput:
    organization_id = _validate_non_empty(payload.organization_id, "organization_id")
    project_id = _validate_non_empty(payload.project_id, "project_id")
    document_type = _validate_non_empty(payload.document_type, "document_type")
    upload_source = _validate_non_empty(payload.upload_source, "upload_source")
    storage_bucket = _validate_non_empty(payload.storage_bucket, "storage_bucket")
    original_filename = _validate_non_empty(
        payload.original_filename, "original_filename"
    )

    if not catalog.is_legal_document_type(document_type):
        raise LegalDocumentValidationError(
            f"Unsupported legal document type: {document_type}"
        )
    if upload_source not in catalog.LEGAL_DOCUMENT_UPLOAD_SOURCE_SET:
        raise LegalDocumentValidationError(
            f"Unsupported legal document upload source: {upload_source}"
        )
    if storage_bucket != DEFAULT_STORAGE_BUCKET:
        raise LegalDocumentValidationError(
            f"Unsupported legal document storage bucket: {storage_bucket}"
        )
    if payload.file_size_bytes <= 0:
        raise LegalDocumentValidationError("file_size_bytes must be greater than zero.")

    storage_path = _validate_storage_path(project_id, payload.storage_path)
    mime_type = _validate_mime_and_extension(
        payload.mime_type, original_filename, storage_path
    )
    sha256_hash = _validate_sha256(payload.sha256_hash)

    return LegalDocumentRegistrationInput(
        organization_id=organization_id,
        project_id=project_id,
        lot_id=payload.lot_id.strip() if payload.lot_id else None,
        document_type=document_type,
        source_field=payload.source_field.strip() if payload.source_field else None,
        storage_bucket=storage_bucket,
        storage_path=storage_path,
        original_filename=original_filename,
        mime_type=mime_type,
        file_size_bytes=payload.file_size_bytes,
        sha256_hash=sha256_hash,
        upload_source=upload_source,
        uploaded_by=payload.uploaded_by.strip() if payload.uploaded_by else None,
    )


async def ensure_project_scope(
    *,
    supabase: Any,
    organization_id: str,
    project_id: str,
) -> None:
    result = await _run_supabase(
        lambda: (
            supabase.table("projects")
            .select("id, organization_id")
            .eq("id", project_id)
            .single()
            .execute()
        )
    )
    project = _first_row(result)
    if not project:
        raise LegalDocumentNotFoundError("Project not found.")
    if project.get("organization_id") != organization_id:
        raise LegalDocumentScopeError(
            "project_id does not belong to organization_id."
        )


async def ensure_lot_scope(
    *,
    supabase: Any,
    project_id: str,
    lot_id: str | None,
) -> None:
    if not lot_id:
        return

    result = await _run_supabase(
        lambda: (
            supabase.table("lots")
            .select("id, project_id")
            .eq("id", lot_id)
            .single()
            .execute()
        )
    )
    lot = _first_row(result)
    if not lot:
        raise LegalDocumentNotFoundError("Lot not found.")
    if lot.get("project_id") != project_id:
        raise LegalDocumentScopeError("lot_id does not belong to project_id.")


async def next_document_version(
    *,
    supabase: Any,
    project_id: str,
    document_type: str,
) -> int:
    result = await _run_supabase(
        lambda: (
            supabase.table("legal_documents")
            .select("version_number")
            .eq("project_id", project_id)
            .eq("document_type", document_type)
            .order("version_number", desc=True)
            .limit(1)
            .execute()
        )
    )
    latest = _first_row(result)
    return int(latest.get("version_number") or 0) + 1 if latest else 1


async def list_project_legal_documents(
    *,
    project_id: str,
    organization_id: str,
    supabase: Any | None = None,
) -> list[LegalDocumentResponse]:
    client = supabase or _get_supabase_client()
    await ensure_project_scope(
        supabase=client,
        organization_id=organization_id,
        project_id=project_id,
    )
    result = await _run_supabase(
        lambda: (
            client.table("legal_documents")
            .select("*")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .order("document_type")
            .order("version_number", desc=True)
            .execute()
        )
    )
    return [LegalDocumentResponse.model_validate(row) for row in _rows(result)]


async def create_ingestion_job(
    *,
    supabase: Any,
    legal_document: LegalDocumentResponse,
    attempt_number: int = 1,
) -> DocumentIngestionJobResponse:
    job_payload = {
        "organization_id": legal_document.organization_id,
        "project_id": legal_document.project_id,
        "legal_document_id": legal_document.id,
        "status": QUEUED_STATUS,
        "pipeline_version": PIPELINE_VERSION,
        "attempt_number": attempt_number,
        "stats": {},
    }
    result = await _run_supabase(
        lambda: supabase.table("document_ingestion_jobs").insert(job_payload).execute()
    )
    row = _first_row(result)
    if not row:
        raise LegalDocumentIngestionError("Failed to create ingestion job.")
    return DocumentIngestionJobResponse.model_validate(row)


async def register_legal_document(
    payload: LegalDocumentRegisterRequest
    | LegalDocumentRegistrationInput
    | Mapping[str, Any],
    *,
    supabase: Any | None = None,
) -> LegalDocumentRegistrationResult:
    registration = validate_registration_input(normalize_registration_input(payload))
    client = supabase or _get_supabase_client()

    await ensure_project_scope(
        supabase=client,
        organization_id=registration.organization_id,
        project_id=registration.project_id,
    )
    await ensure_lot_scope(
        supabase=client,
        project_id=registration.project_id,
        lot_id=registration.lot_id,
    )

    version_number = await next_document_version(
        supabase=client,
        project_id=registration.project_id,
        document_type=registration.document_type,
    )
    document_payload = {
        "organization_id": registration.organization_id,
        "project_id": registration.project_id,
        "lot_id": registration.lot_id,
        "document_type": registration.document_type,
        "source_field": registration.source_field,
        "storage_bucket": registration.storage_bucket,
        "storage_path": registration.storage_path,
        "original_filename": registration.original_filename,
        "mime_type": registration.mime_type,
        "file_size_bytes": registration.file_size_bytes,
        "sha256_hash": registration.sha256_hash,
        "version_number": version_number,
        "upload_source": registration.upload_source,
        "uploaded_by": registration.uploaded_by,
        "extraction_status": QUEUED_STATUS,
    }
    document_result = await _run_supabase(
        lambda: client.table("legal_documents").insert(document_payload).execute()
    )
    document_row = _first_row(document_result)
    if not document_row:
        raise LegalDocumentIngestionError("Failed to register legal document.")

    legal_document = LegalDocumentResponse.model_validate(document_row)
    ingestion_job = await create_ingestion_job(
        supabase=client,
        legal_document=legal_document,
    )
    return LegalDocumentRegistrationResult(
        legal_document=legal_document,
        ingestion_job=ingestion_job,
    )


async def queue_retry_for_legal_document(
    *,
    legal_document_id: str,
    organization_id: str,
    supabase: Any | None = None,
) -> LegalDocumentRegistrationResult:
    client = supabase or _get_supabase_client()
    document_result = await _run_supabase(
        lambda: (
            client.table("legal_documents")
            .select("*")
            .eq("id", legal_document_id)
            .eq("organization_id", organization_id)
            .single()
            .execute()
        )
    )
    document_row = _first_row(document_result)
    if not document_row:
        raise LegalDocumentNotFoundError("Legal document not found.")

    legal_document = LegalDocumentResponse.model_validate(document_row)
    if legal_document.extraction_status not in {"failed", "needs_review"}:
        raise LegalDocumentValidationError(
            "Only failed or needs_review legal documents can be retried."
        )

    attempts_result = await _run_supabase(
        lambda: (
            client.table("document_ingestion_jobs")
            .select("attempt_number")
            .eq("legal_document_id", legal_document_id)
            .order("attempt_number", desc=True)
            .limit(1)
            .execute()
        )
    )
    latest_attempt = _first_row(attempts_result)
    attempt_number = (
        int(latest_attempt.get("attempt_number") or 0) + 1
        if latest_attempt
        else 1
    )

    await _run_supabase(
        lambda: (
            client.table("legal_documents")
            .update({"extraction_status": QUEUED_STATUS})
            .eq("id", legal_document_id)
            .execute()
        )
    )
    queued_document = legal_document.model_copy(
        update={"extraction_status": QUEUED_STATUS}
    )
    ingestion_job = await create_ingestion_job(
        supabase=client,
        legal_document=queued_document,
        attempt_number=attempt_number,
    )
    return LegalDocumentRegistrationResult(
        legal_document=queued_document,
        ingestion_job=ingestion_job,
    )


async def run_document_ingestion_job(
    *,
    legal_document_id: str,
    organization_id: str,
    project_id: str,
    ingestion_job_id: str | None = None,
    supabase: Any | None = None,
) -> LegalDocumentIngestionRunResult:
    """Worker boundary for legal ingestion jobs.

    Full text extraction is implemented in later SDD tasks. This foundation
    step must still be executable by ARQ and move the persisted job/document
    into a consistent processing state instead of crashing at runtime.
    """
    client = supabase or _get_supabase_client()

    def _mark_processing() -> None:
        (
            client.table("legal_documents")
            .update({"extraction_status": "processing"})
            .eq("id", legal_document_id)
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .execute()
        )
        if ingestion_job_id:
            (
                client.table("document_ingestion_jobs")
                .update({"status": "processing"})
                .eq("id", ingestion_job_id)
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .eq("legal_document_id", legal_document_id)
                .execute()
            )

    await _run_supabase(_mark_processing)
    return LegalDocumentIngestionRunResult(
        legal_document_id=legal_document_id,
        organization_id=organization_id,
        project_id=project_id,
        ingestion_job_id=ingestion_job_id,
        status="processing",
    )
