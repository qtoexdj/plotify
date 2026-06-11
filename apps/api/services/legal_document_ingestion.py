"""Legal document registration service for SDD 007.

This module keeps registration logic independent from FastAPI and arq so it can
be used by future endpoints, upload hooks, and workers without import-time side
effects.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Mapping

from core.logger import get_logger
from schemas.legal_variables import (
    DocumentIngestionJobResponse,
    LegalDocumentRegisterRequest,
    LegalDocumentResponse,
)
from services import legal_variable_catalog as catalog


logger = get_logger(__name__)

PIPELINE_VERSION = "sdd_007_v1"
DEFAULT_STORAGE_BUCKET = "project-files"
QUEUED_STATUS = "queued"
RETRYABLE_EXTRACTION_STATUSES = frozenset(
    {"failed", "needs_review", "text_extracted", "variables_proposed"}
)
ACTIVE_DOCUMENT_STATUSES = (
    "pending",
    "queued",
    "processing",
    "text_extracted",
    "variables_proposed",
    "needs_review",
    "failed",
)
# Document types consumed by the SDD 009 title analysis pipeline.
TITLE_ANALYSIS_DOCUMENT_TYPES = frozenset(
    {"dominio_vigente", "personeria", "hipoteca_gravamen"}
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
    replaces_legal_document_id: str | None = None

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
class LegalDocumentArchiveResult:
    legal_document: LegalDocumentResponse
    title_analysis_superseded: bool
    title_reanalysis_recommended: bool


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
    if not normalized.startswith(f"{project_id}/"):
        raise LegalDocumentValidationError(
            "storage_path must start with the project_id namespace."
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

    replaces_legal_document_id = (
        payload.replaces_legal_document_id.strip()
        if payload.replaces_legal_document_id
        else None
    )
    if replaces_legal_document_id and not catalog.is_multi_active_legal_document_type(
        document_type
    ):
        # Single-active types always supersede every previous version; an
        # explicit replace target would be ambiguous (FR-032).
        raise LegalDocumentValidationError(
            "replaces_legal_document_id is only supported for multi-active "
            f"document types, not for {document_type}."
        )

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
        replaces_legal_document_id=replaces_legal_document_id,
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


async def get_active_legal_document_for_type(
    *,
    project_id: str,
    organization_id: str,
    document_type: str,
    supabase: Any | None = None,
) -> LegalDocumentResponse:
    """Return the latest non-superseded legal document for the project/type."""
    client = supabase or _get_supabase_client()
    await ensure_project_scope(
        supabase=client,
        organization_id=organization_id,
        project_id=project_id,
    )
    if not catalog.is_legal_document_type(document_type):
        raise LegalDocumentValidationError(
            f"Unsupported legal document type: {document_type}"
        )

    result = await _run_supabase(
        lambda: (
            client.table("legal_documents")
            .select("*")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .eq("document_type", document_type)
            .in_("extraction_status", ACTIVE_DOCUMENT_STATUSES)
            .order("version_number", desc=True)
            .limit(1)
            .execute()
        )
    )
    row = _first_row(result)
    if not row:
        raise LegalDocumentNotFoundError(
            f"No active legal document found for type {document_type}."
        )
    return LegalDocumentResponse.model_validate(row)


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
    if registration.replaces_legal_document_id:
        await _ensure_replace_target(
            supabase=client,
            registration=registration,
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
    if catalog.is_multi_active_legal_document_type(legal_document.document_type):
        # FR-031/FR-032: multi-active types coexist; only an explicit replace
        # target is superseded.
        if registration.replaces_legal_document_id:
            await supersede_replaced_document(
                supabase=client,
                legal_document=legal_document,
                replaced_document_id=registration.replaces_legal_document_id,
            )
    else:
        await supersede_previous_document_versions(
            supabase=client,
            legal_document=legal_document,
        )
    if legal_document.document_type in TITLE_ANALYSIS_DOCUMENT_TYPES:
        try:
            from services.legal_title_analysis import _supersede_current_title_analyses
            await _supersede_current_title_analyses(
                supabase=client,
                organization_id=legal_document.organization_id,
                project_id=legal_document.project_id,
            )
        except Exception as exc:
            logger.error(
                "title_analysis_supersede_failed_on_registration",
                organization_id=legal_document.organization_id,
                project_id=legal_document.project_id,
                error=str(exc),
            )
    ingestion_job = await create_ingestion_job(
        supabase=client,
        legal_document=legal_document,
    )
    logger.info(
        "legal_document_registered",
        organization_id=legal_document.organization_id,
        project_id=legal_document.project_id,
        legal_document_id=legal_document.id,
        document_type=legal_document.document_type,
        version_number=legal_document.version_number,
        ingestion_job_id=ingestion_job.id,
    )
    return LegalDocumentRegistrationResult(
        legal_document=legal_document,
        ingestion_job=ingestion_job,
    )


async def _ensure_replace_target(
    *,
    supabase: Any,
    registration: LegalDocumentRegistrationInput,
) -> dict[str, Any]:
    result = await _run_supabase(
        lambda: (
            supabase.table("legal_documents")
            .select("id, organization_id, project_id, document_type, extraction_status")
            .eq("id", registration.replaces_legal_document_id)
            .limit(1)
            .execute()
        )
    )
    target = _first_row(result)
    if not target:
        raise LegalDocumentNotFoundError(
            "replaces_legal_document_id does not reference an existing document."
        )
    if (
        target.get("organization_id") != registration.organization_id
        or target.get("project_id") != registration.project_id
    ):
        raise LegalDocumentScopeError(
            "replaces_legal_document_id does not belong to the organization/project."
        )
    if target.get("document_type") != registration.document_type:
        raise LegalDocumentValidationError(
            "replaces_legal_document_id must reference a document of the same type."
        )
    if target.get("extraction_status") not in ACTIVE_DOCUMENT_STATUSES:
        raise LegalDocumentValidationError(
            "replaces_legal_document_id must reference an active document."
        )
    return target


async def supersede_replaced_document(
    *,
    supabase: Any,
    legal_document: LegalDocumentResponse,
    replaced_document_id: str,
) -> None:
    await _run_supabase(
        lambda: (
            supabase.table("legal_documents")
            .update(
                {
                    "extraction_status": "superseded",
                    "superseded_by": legal_document.id,
                }
            )
            .eq("id", replaced_document_id)
            .eq("organization_id", legal_document.organization_id)
            .eq("project_id", legal_document.project_id)
            .execute()
        )
    )
    logger.info(
        "legal_document_replaced",
        organization_id=legal_document.organization_id,
        project_id=legal_document.project_id,
        legal_document_id=legal_document.id,
        replaced_document_id=replaced_document_id,
        document_type=legal_document.document_type,
    )


async def supersede_previous_document_versions(
    *,
    supabase: Any,
    legal_document: LegalDocumentResponse,
) -> None:
    await _run_supabase(
        lambda: (
            supabase.table("legal_documents")
            .update(
                {
                    "extraction_status": "superseded",
                    "superseded_by": legal_document.id,
                }
            )
            .eq("organization_id", legal_document.organization_id)
            .eq("project_id", legal_document.project_id)
            .eq("document_type", legal_document.document_type)
            .neq("id", legal_document.id)
            .in_("extraction_status", ACTIVE_DOCUMENT_STATUSES)
            .execute()
        )
    )
    logger.info(
        "legal_document_previous_versions_superseded",
        organization_id=legal_document.organization_id,
        project_id=legal_document.project_id,
        legal_document_id=legal_document.id,
        document_type=legal_document.document_type,
        version_number=legal_document.version_number,
    )


async def archive_legal_document(
    *,
    legal_document_id: str,
    organization_id: str,
    project_id: str,
    supabase: Any | None = None,
) -> LegalDocumentArchiveResult:
    """Archive (soft-delete) a legal document by marking it superseded.

    The row and its storage object are preserved as historical evidence; the
    document simply stops being active. Archiving a title-type document
    supersedes the current title analysis (the active source set changed) and
    reports whether a reanalysis makes sense (other active title docs remain).
    """
    client = supabase or _get_supabase_client()
    result = await _run_supabase(
        lambda: (
            client.table("legal_documents")
            .select("*")
            .eq("id", legal_document_id)
            .limit(1)
            .execute()
        )
    )
    row = _first_row(result)
    if not row:
        raise LegalDocumentNotFoundError("Legal document not found.")
    if (
        row.get("organization_id") != organization_id
        or row.get("project_id") != project_id
    ):
        raise LegalDocumentScopeError(
            "Legal document does not belong to the organization/project."
        )
    if row.get("extraction_status") == "superseded":
        raise LegalDocumentValidationError(
            "Legal document is already archived/superseded."
        )

    await _run_supabase(
        lambda: (
            client.table("legal_documents")
            .update({"extraction_status": "superseded"})
            .eq("id", legal_document_id)
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .execute()
        )
    )
    archived = LegalDocumentResponse.model_validate(
        {**row, "extraction_status": "superseded"}
    )

    title_analysis_superseded = False
    title_reanalysis_recommended = False
    if archived.document_type in TITLE_ANALYSIS_DOCUMENT_TYPES:
        try:
            from services.legal_title_analysis import _supersede_current_title_analyses

            await _supersede_current_title_analyses(
                supabase=client,
                organization_id=organization_id,
                project_id=project_id,
            )
            title_analysis_superseded = True
        except Exception as exc:
            logger.error(
                "title_analysis_supersede_failed_on_archive",
                organization_id=organization_id,
                project_id=project_id,
                legal_document_id=legal_document_id,
                error=str(exc),
            )
        remaining_result = await _run_supabase(
            lambda: (
                client.table("legal_documents")
                .select("id")
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .in_("document_type", sorted(TITLE_ANALYSIS_DOCUMENT_TYPES))
                .in_("extraction_status", list(ACTIVE_DOCUMENT_STATUSES))
                .limit(1)
                .execute()
            )
        )
        title_reanalysis_recommended = _first_row(remaining_result) is not None

    logger.info(
        "legal_document_archived",
        organization_id=organization_id,
        project_id=project_id,
        legal_document_id=legal_document_id,
        document_type=archived.document_type,
        title_analysis_superseded=title_analysis_superseded,
        title_reanalysis_recommended=title_reanalysis_recommended,
    )
    return LegalDocumentArchiveResult(
        legal_document=archived,
        title_analysis_superseded=title_analysis_superseded,
        title_reanalysis_recommended=title_reanalysis_recommended,
    )


async def queue_retry_for_legal_document(
    *,
    legal_document_id: str,
    organization_id: str,
    project_id: str | None = None,
    supabase: Any | None = None,
) -> LegalDocumentRegistrationResult:
    client = supabase or _get_supabase_client()
    def _load_document() -> Any:
        query = (
            client.table("legal_documents")
            .select("*")
            .eq("id", legal_document_id)
            .eq("organization_id", organization_id)
        )
        if project_id is not None:
            query = query.eq("project_id", project_id)
        return query.single().execute()

    document_result = await _run_supabase(_load_document)
    document_row = _first_row(document_result)
    if not document_row:
        raise LegalDocumentNotFoundError("Legal document not found.")

    legal_document = LegalDocumentResponse.model_validate(document_row)
    if legal_document.extraction_status not in RETRYABLE_EXTRACTION_STATUSES:
        raise LegalDocumentValidationError(
            "Only completed, failed or review-required legal documents can be retried."
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
            .eq("organization_id", organization_id)
            .eq("project_id", legal_document.project_id)
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
    logger.info(
        "legal_document_retry_queued",
        organization_id=organization_id,
        project_id=legal_document.project_id,
        legal_document_id=legal_document.id,
        ingestion_job_id=ingestion_job.id,
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
    redis: Any | None = None,
) -> LegalDocumentIngestionRunResult:
    """Worker boundary for legal ingestion jobs."""
    from services.legal_text_extraction import (
        LegalTextExtractionService,
        SupabaseLegalTextExtractionRepository,
    )
    from services.legal_variable_resolution import (
        LegalVariableResolutionService,
        resolve_document_variables,
    )

    client = supabase or _get_supabase_client()
    document = await get_legal_document_for_ingestion(
        supabase=client,
        legal_document_id=legal_document_id,
        organization_id=organization_id,
        project_id=project_id,
    )
    logger.info(
        "legal_document_ingestion_started",
        organization_id=organization_id,
        project_id=project_id,
        legal_document_id=legal_document_id,
        ingestion_job_id=ingestion_job_id,
        document_type=document.document_type,
    )
    text_service = LegalTextExtractionService(
        repository=SupabaseLegalTextExtractionRepository(client)
    )
    persisted_extraction = await text_service.extract_and_persist_document(
        organization_id=organization_id,
        project_id=project_id,
        legal_document_id=legal_document_id,
        ingestion_job_id=ingestion_job_id,
    )
    variable_service = LegalVariableResolutionService()
    proposals = resolve_document_variables(
        variable_service,
        organization_id=organization_id,
        project_id=project_id,
        legal_document_id=legal_document_id,
        document_type=document.document_type,
        pages=persisted_extraction.stored_pages,
    )
    await variable_service.persist_proposals(proposals, supabase=client)
    final_status = "needs_review" if any(item.blocks_readiness for item in proposals) else "variables_proposed"
    await mark_variables_resolved(
        supabase=client,
        legal_document_id=legal_document_id,
        organization_id=organization_id,
        project_id=project_id,
        ingestion_job_id=ingestion_job_id,
        status=final_status,
    )
    logger.info(
        "legal_document_ingestion_completed",
        organization_id=organization_id,
        project_id=project_id,
        legal_document_id=legal_document_id,
        ingestion_job_id=ingestion_job_id,
        status=final_status,
        page_count=len(persisted_extraction.stored_pages),
        proposal_count=len(proposals),
        blocking_proposal_count=sum(1 for item in proposals if item.blocks_readiness),
    )
    if document.document_type in TITLE_ANALYSIS_DOCUMENT_TYPES:
        try:
            arq_pool = redis
            if arq_pool is None:
                from core.redis import get_arq_pool
                arq_pool = await get_arq_pool()
            
            if arq_pool is not None:
                await arq_pool.enqueue_job(
                    "analyze_project_title",
                    {
                        "organization_id": organization_id,
                        "project_id": project_id,
                    }
                )
                logger.info(
                    "title_analysis_queued_after_ingestion",
                    organization_id=organization_id,
                    project_id=project_id,
                    legal_document_id=legal_document_id,
                )
        except Exception as exc:
            logger.error(
                "title_analysis_enqueue_failed_after_ingestion",
                organization_id=organization_id,
                project_id=project_id,
                error=str(exc),
            )
    return LegalDocumentIngestionRunResult(
        legal_document_id=legal_document_id,
        organization_id=organization_id,
        project_id=project_id,
        ingestion_job_id=ingestion_job_id,
        status=final_status,
    )


async def get_legal_document_for_ingestion(
    *,
    supabase: Any,
    legal_document_id: str,
    organization_id: str,
    project_id: str,
) -> LegalDocumentResponse:
    result = await _run_supabase(
        lambda: (
            supabase.table("legal_documents")
            .select("*")
            .eq("id", legal_document_id)
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .single()
            .execute()
        )
    )
    row = _first_row(result)
    if not row:
        raise LegalDocumentNotFoundError("Legal document not found.")
    return LegalDocumentResponse.model_validate(row)


async def mark_variables_resolved(
    *,
    supabase: Any,
    legal_document_id: str,
    organization_id: str,
    project_id: str,
    ingestion_job_id: str | None,
    status: str,
) -> None:
    job_status = "variables_proposed" if status in {"variables_proposed", "needs_review"} else status

    def _mark() -> None:
        (
            supabase.table("legal_documents")
            .update({"extraction_status": status})
            .eq("id", legal_document_id)
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .execute()
        )
        if ingestion_job_id:
            (
                supabase.table("document_ingestion_jobs")
                .update({"status": job_status})
                .eq("id", ingestion_job_id)
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .eq("legal_document_id", legal_document_id)
                .execute()
            )

    await _run_supabase(_mark)
