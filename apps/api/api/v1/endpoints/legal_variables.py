"""SDD 007 legal document, variable, role matching and readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.deps import verify_internal_secret
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

router = APIRouter(
    tags=["legal-variables"],
    dependencies=[Depends(verify_internal_secret)],
)


@router.post(
    "/legal-documents/register",
    response_model=LegalDocumentRegistrationQueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def register_legal_document(
    payload: LegalDocumentRegisterRequest,
) -> LegalDocumentRegistrationQueuedResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Legal document registration is not implemented yet.",
    )


@router.get(
    "/legal-documents/project/{project_id}",
    response_model=LegalDocumentListResponse,
)
async def list_project_legal_documents(
    project_id: str,
    organization_id: str = Query(...),
) -> LegalDocumentListResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Legal document listing is not implemented yet.",
    )


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
) -> VariableInventoryResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Legal variable inventory is not implemented yet.",
    )


@router.patch(
    "/legal-variables/{variable_resolution_id}",
    response_model=VariableReviewResponse,
)
async def update_legal_variable(
    variable_resolution_id: str,
    payload: VariableUpdateRequest,
    organization_id: str = Query(...),
) -> VariableReviewResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Legal variable review is not implemented yet.",
    )


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
