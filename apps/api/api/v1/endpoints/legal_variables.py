"""SDD 007 legal document, variable, role matching and readiness endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.deps import verify_internal_secret
from core.logger import get_logger
from core.redis import get_arq_pool
from schemas.legal_variables import (
    EscrituraCaseCreateRequest,
    EscrituraCaseResponse,
    EscrituraCaseSnapshotResponse,
    EscrituraReadinessResponse,
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
    list_project_legal_documents as list_project_legal_documents_service,
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


@router.post(
    "/legal-documents/register",
    response_model=LegalDocumentRegistrationQueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def register_legal_document(
    payload: LegalDocumentRegisterRequest,
    redis: Any | None = Depends(get_optional_arq_pool),
) -> LegalDocumentRegistrationQueuedResponse:
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
) -> LegalDocumentRetryResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Legal document retry is not implemented yet.",
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
) -> RoleMatchingInventoryResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Legal role matching inventory is not implemented yet.",
    )


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
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Legal role manual override is not implemented yet.",
    )


@router.get(
    "/escritura-cases/lots/{lot_id}/readiness",
    response_model=EscrituraReadinessResponse,
)
async def get_escritura_readiness(
    lot_id: str,
    organization_id: str = Query(...),
    project_id: str = Query(...),
) -> EscrituraReadinessResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Escritura readiness is not implemented yet.",
    )


@router.post(
    "/escritura-cases/lots/{lot_id}",
    response_model=EscrituraCaseSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_escritura_case(
    lot_id: str,
    payload: EscrituraCaseCreateRequest,
) -> EscrituraCaseSnapshotResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Escritura case creation is not implemented yet.",
    )
