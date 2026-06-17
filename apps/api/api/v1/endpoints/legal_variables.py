"""SDD 007 legal document, variable, role matching and readiness endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.deps import verify_internal_secret
from core.logger import get_logger
from core.redis import get_arq_pool
from core.config import get_settings
from schemas.legal_variables import (
    EscrituraCaseCreateRequest,
    EscrituraCaseResponse,
    EscrituraCaseSnapshotResponse,
    EscrituraReadinessResponse,
    LegalDocumentArchiveResponse,
    LegalDocumentListResponse,
    LegalDocumentRegisterRequest,
    LegalDocumentRegistrationQueuedResponse,
    LegalDocumentRetryResponse,
    LotLegalDataResponse,
    RoleManualOverrideRequest,
    RoleMatchingInventoryResponse,
    VariableInventoryResponse,
    VariableReviewResponse,
    VariableUpdateRequest,
)
from services.legal_document_ingestion import (
    LegalDocumentNotFoundError,
    LegalDocumentScopeError,
    LegalDocumentValidationError,
    archive_legal_document as archive_legal_document_service,
    list_project_legal_documents as list_project_legal_documents_service,
    queue_retry_for_legal_document as queue_retry_for_legal_document_service,
    register_legal_document as register_legal_document_service,
)
from services.legal_variable_resolution import (
    LegalVariableAuditError,
    LegalVariableInventoryNotFoundError,
    LegalVariableInventoryScopeError,
    LegalVariableResolutionError,
    get_project_variable_inventory as get_project_variable_inventory_service,
    update_legal_variable as update_legal_variable_service,
)
from services.legal_role_matching import (
    LegalRoleMatchingError,
    LegalRoleMatchingNotFoundError,
    LegalRoleMatchingScopeError,
    apply_manual_role_override,
    get_project_role_matching_inventory,
)
from services.escritura_readiness import (
    EscrituraReadinessScopeError,
    create_escritura_case_snapshot as create_escritura_case_snapshot_service,
    get_escritura_readiness as get_escritura_readiness_service,
)

logger = get_logger(__name__)

router = APIRouter(
    tags=["legal-variables"],
    dependencies=[Depends(verify_internal_secret)],
)


async def get_optional_arq_pool() -> Any | None:
    try:
        return await get_arq_pool()
    except Exception as exc:
        logger.error("legal_document_ingestion_redis_unavailable", error=str(exc))
        return None


def _csv_contains(value: str, candidate: str) -> bool:
    return candidate in {item.strip() for item in value.split(",") if item.strip()}


def ensure_legal_documents_feature_enabled(
    *, organization_id: str, project_id: str | None = None
) -> None:
    settings = get_settings()
    if not settings.ENABLE_LEGAL_DOCUMENTS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Legal document extraction/readiness is disabled.",
        )
    if settings.LEGAL_DOCUMENTS_ORG_ALLOWLIST and not _csv_contains(
        settings.LEGAL_DOCUMENTS_ORG_ALLOWLIST, organization_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Legal document extraction/readiness is not enabled for this organization.",
        )
    if project_id and settings.LEGAL_DOCUMENTS_PROJECT_ALLOWLIST and not _csv_contains(
        settings.LEGAL_DOCUMENTS_PROJECT_ALLOWLIST, project_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Legal document extraction/readiness is not enabled for this project.",
        )


@router.post(
    "/legal-documents/register",
    response_model=LegalDocumentRegistrationQueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def register_legal_document(
    payload: LegalDocumentRegisterRequest,
    redis: Any | None = Depends(get_optional_arq_pool),
) -> LegalDocumentRegistrationQueuedResponse:
    ensure_legal_documents_feature_enabled(
        organization_id=payload.organization_id,
        project_id=payload.project_id,
    )
    try:
        result = await register_legal_document_service(payload)
    except LegalDocumentValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except LegalDocumentScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LegalDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    job_payload = {
        "legal_document_id": result.legal_document.id,
        "organization_id": result.legal_document.organization_id,
        "project_id": result.legal_document.project_id,
        "ingestion_job_id": result.ingestion_job.id,
    }
    if redis is not None:
        try:
            await redis.enqueue_job("process_legal_document_ingestion", job_payload)
        except Exception as exc:
            logger.error(
                "legal_document_ingestion_enqueue_failed",
                legal_document_id=result.legal_document.id,
                ingestion_job_id=result.ingestion_job.id,
                error=str(exc),
            )

    return LegalDocumentRegistrationQueuedResponse(
        legal_document_id=result.legal_document.id,
        ingestion_job_id=result.ingestion_job.id,
        extraction_status=result.legal_document.extraction_status,
        version_number=result.legal_document.version_number,
    )


@router.get(
    "/legal-documents/project/{project_id}",
    response_model=LegalDocumentListResponse,
)
async def list_project_legal_documents(
    project_id: str,
    organization_id: str = Query(...),
) -> LegalDocumentListResponse:
    ensure_legal_documents_feature_enabled(
        organization_id=organization_id,
        project_id=project_id,
    )
    try:
        documents = await list_project_legal_documents_service(
            project_id=project_id,
            organization_id=organization_id,
        )
    except LegalDocumentScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LegalDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return LegalDocumentListResponse(project_id=project_id, documents=documents)


@router.post(
    "/legal-documents/{legal_document_id}/retry",
    response_model=LegalDocumentRetryResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_legal_document_ingestion(
    legal_document_id: str,
    organization_id: str = Query(...),
    project_id: str = Query(...),
    redis: Any | None = Depends(get_optional_arq_pool),
) -> LegalDocumentRetryResponse:
    ensure_legal_documents_feature_enabled(
        organization_id=organization_id,
        project_id=project_id,
    )
    try:
        result = await queue_retry_for_legal_document_service(
            legal_document_id=legal_document_id,
            organization_id=organization_id,
            project_id=project_id,
        )
    except LegalDocumentValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except LegalDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    job_payload = {
        "legal_document_id": result.legal_document.id,
        "organization_id": result.legal_document.organization_id,
        "project_id": result.legal_document.project_id,
        "ingestion_job_id": result.ingestion_job.id,
    }
    if redis is not None:
        try:
            await redis.enqueue_job("process_legal_document_ingestion", job_payload)
        except Exception as exc:
            logger.error(
                "legal_document_retry_enqueue_failed",
                legal_document_id=result.legal_document.id,
                ingestion_job_id=result.ingestion_job.id,
                error=str(exc),
            )

    return LegalDocumentRetryResponse(
        legal_document_id=result.legal_document.id,
        ingestion_job_id=result.ingestion_job.id,
        extraction_status=result.legal_document.extraction_status,
        attempt_number=result.ingestion_job.attempt_number,
    )


@router.post(
    "/legal-documents/{legal_document_id}/archive",
    response_model=LegalDocumentArchiveResponse,
)
async def archive_legal_document(
    legal_document_id: str,
    organization_id: str = Query(...),
    project_id: str = Query(...),
    redis: Any | None = Depends(get_optional_arq_pool),
) -> LegalDocumentArchiveResponse:
    ensure_legal_documents_feature_enabled(
        organization_id=organization_id,
        project_id=project_id,
    )
    try:
        result = await archive_legal_document_service(
            legal_document_id=legal_document_id,
            organization_id=organization_id,
            project_id=project_id,
        )
    except LegalDocumentValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except LegalDocumentScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LegalDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    reanalysis_queued = False
    if result.title_reanalysis_recommended and redis is not None:
        try:
            await redis.enqueue_job(
                "analyze_project_title",
                {
                    "organization_id": organization_id,
                    "project_id": project_id,
                    "trigger": "document_archived",
                },
            )
            reanalysis_queued = True
        except Exception as exc:
            logger.error(
                "title_reanalysis_enqueue_failed_on_archive",
                legal_document_id=legal_document_id,
                project_id=project_id,
                error=str(exc),
            )

    return LegalDocumentArchiveResponse(
        legal_document_id=result.legal_document.id,
        extraction_status=result.legal_document.extraction_status,
        title_analysis_superseded=result.title_analysis_superseded,
        title_reanalysis_recommended=result.title_reanalysis_recommended,
        reanalysis_queued=reanalysis_queued,
    )


@router.get(
    "/legal-variables/project/{project_id}",
    response_model=VariableInventoryResponse,
)
async def get_project_legal_variables(
    project_id: str,
    organization_id: str = Query(...),
    lot_id: str | None = Query(default=None),
    state: str | None = Query(default=None),
    group: str | None = Query(default=None),
    include_evidence: bool = Query(default=True),
) -> VariableInventoryResponse:
    ensure_legal_documents_feature_enabled(
        organization_id=organization_id,
        project_id=project_id,
    )
    try:
        return await get_project_variable_inventory_service(
            project_id=project_id,
            organization_id=organization_id,
            lot_id=lot_id,
            state=state,
            group=group,
            include_evidence=include_evidence,
        )
    except LegalVariableResolutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except LegalVariableInventoryScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LegalVariableInventoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except LegalVariableAuditError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.patch(
    "/legal-variables/{variable_resolution_id}",
    response_model=VariableReviewResponse,
)
async def update_legal_variable(
    variable_resolution_id: str,
    payload: VariableUpdateRequest,
    organization_id: str = Query(...),
    project_id: str = Query(...),
) -> VariableReviewResponse:
    ensure_legal_documents_feature_enabled(
        organization_id=organization_id,
        project_id=project_id,
    )
    try:
        return await update_legal_variable_service(
            variable_resolution_id=variable_resolution_id,
            organization_id=organization_id,
            project_id=project_id,
            payload=payload,
        )
    except LegalVariableResolutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except LegalVariableInventoryScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LegalVariableInventoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/legal-roles/project/{project_id}/matches",
    response_model=RoleMatchingInventoryResponse,
)
async def get_project_legal_roles(
    project_id: str,
    organization_id: str = Query(...),
    legal_document_id: str | None = Query(default=None),
) -> RoleMatchingInventoryResponse:
    ensure_legal_documents_feature_enabled(
        organization_id=organization_id,
        project_id=project_id,
    )
    try:
        return RoleMatchingInventoryResponse.model_validate(
            await get_project_role_matching_inventory(
                project_id=project_id,
                organization_id=organization_id,
                legal_document_id=legal_document_id,
            )
        )
    except LegalRoleMatchingScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LegalRoleMatchingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except LegalRoleMatchingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.patch(
    "/legal-roles/lots/{lot_id}",
    response_model=LotLegalDataResponse,
)
async def update_lot_legal_role(
    lot_id: str,
    payload: RoleManualOverrideRequest,
    organization_id: str = Query(...),
    project_id: str = Query(...),
) -> LotLegalDataResponse:
    ensure_legal_documents_feature_enabled(
        organization_id=organization_id,
        project_id=project_id,
    )
    try:
        row = await apply_manual_role_override(
            organization_id=organization_id,
            project_id=project_id,
            lot_id=lot_id,
            sii_unit_name=payload.sii_unit_name,
            sii_lot_number_normalized=payload.sii_lot_number_normalized,
            sii_comuna=payload.sii_comuna,
            sii_role_matrix=payload.sii_role_matrix,
            sii_pre_role=payload.sii_pre_role,
            sii_role_in_process_text=payload.sii_role_in_process_text,
            sii_definitive_role=payload.sii_definitive_role,
            sii_role_record=payload.sii_role_record,
            role_status=payload.role_status,
            reason=payload.reason,
            source_legal_document_id=payload.source_legal_document_id,
            reviewed_by=payload.reviewed_by,
        )
        return LotLegalDataResponse.model_validate(
            {
                "id": lot_id,
                **row,
            }
        )
    except LegalRoleMatchingScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LegalRoleMatchingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except (LegalRoleMatchingError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get(
    "/escritura-cases/lots/{lot_id}/readiness",
    response_model=EscrituraReadinessResponse,
)
async def get_escritura_readiness(
    lot_id: str,
    organization_id: str = Query(...),
    project_id: str = Query(...),
) -> EscrituraReadinessResponse:
    ensure_legal_documents_feature_enabled(
        organization_id=organization_id,
        project_id=project_id,
    )
    try:
        readiness = await get_escritura_readiness_service(
            organization_id=organization_id,
            project_id=project_id,
            lot_id=lot_id,
        )
    except EscrituraReadinessScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    return EscrituraReadinessResponse.model_validate(readiness.to_dict())


@router.post(
    "/escritura-cases/lots/{lot_id}",
    response_model=EscrituraCaseSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_escritura_case(
    lot_id: str,
    payload: EscrituraCaseCreateRequest,
) -> EscrituraCaseSnapshotResponse:
    ensure_legal_documents_feature_enabled(
        organization_id=payload.organization_id,
        project_id=payload.project_id,
    )
    try:
        row = await create_escritura_case_snapshot_service(
            organization_id=payload.organization_id,
            project_id=payload.project_id,
            lot_id=lot_id,
            created_by=payload.created_by,
            warning_acknowledged=payload.warning_acknowledged,
        )
    except EscrituraReadinessScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    escritura_case_id = row.get("id") or row.get("escritura_case_id")
    return EscrituraCaseSnapshotResponse.model_validate(
        {
            "escritura_case_id": escritura_case_id,
            "case_status": row["case_status"],
            "readiness_status": row["readiness_status"],
            "variable_snapshot_count": len(row.get("variable_snapshot") or {}),
            "evidence_snapshot_count": len(row.get("evidence_snapshot") or {}),
        }
    )
