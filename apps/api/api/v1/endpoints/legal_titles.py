"""SDD 009 title analysis API endpoints skeleton."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.deps import verify_internal_secret
from core.logger import get_logger
from core.config import get_settings
from schemas.legal_titles import (
    TitleCaseResponse,
    TitleAnalysisResponseData,
    TitleAnalysisReanalyzeResponse,
    TitleNarrativeUpdateRequest,
    TitleAnalysisNarrative,
    TitleAlertResolveRequest,
    TitleAlert,
)

logger = get_logger(__name__)

router = APIRouter(
    tags=["legal-titles"],
    dependencies=[Depends(verify_internal_secret)],
)


def _csv_contains(value: str, candidate: str) -> bool:
    return candidate in {item.strip() for item in value.split(",") if item.strip()}


def ensure_legal_titles_feature_enabled(
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


@router.get(
    "/legal-titles/project/{project_id}",
    response_model=TitleCaseResponse,
)
async def get_project_title_case(
    project_id: UUID,
    organization_id: UUID = Query(...),
) -> TitleCaseResponse:
    ensure_legal_titles_feature_enabled(
        organization_id=str(organization_id),
        project_id=str(project_id),
    )
    logger.info(
        "get_project_title_case_skeleton",
        project_id=project_id,
        organization_id=organization_id,
    )
    return TitleCaseResponse(analysis=None)


@router.post(
    "/legal-titles/project/{project_id}/reanalyze",
    response_model=TitleAnalysisReanalyzeResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def reanalyze_project_title(
    project_id: UUID,
    organization_id: UUID = Query(...),
) -> TitleAnalysisReanalyzeResponse:
    ensure_legal_titles_feature_enabled(
        organization_id=str(organization_id),
        project_id=str(project_id),
    )
    logger.info(
        "reanalyze_project_title_skeleton",
        project_id=project_id,
        organization_id=organization_id,
    )
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Title reanalysis is implemented in SDD 009 T030.",
    )


@router.patch(
    "/legal-titles/{analysis_id}/narrative",
    response_model=TitleAnalysisNarrative,
)
async def update_title_narrative(
    analysis_id: UUID,
    payload: TitleNarrativeUpdateRequest,
    organization_id: UUID = Query(...),
    project_id: UUID = Query(...),
) -> TitleAnalysisNarrative:
    ensure_legal_titles_feature_enabled(
        organization_id=str(organization_id),
        project_id=str(project_id),
    )
    logger.info(
        "update_title_narrative_skeleton",
        analysis_id=analysis_id,
        block=payload.block,
    )
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Narrative edits are implemented in SDD 009 T031.",
    )


@router.post(
    "/legal-titles/{analysis_id}/alerts/{alert_index}/resolve",
    response_model=TitleAlert,
)
async def resolve_title_alert(
    analysis_id: UUID,
    alert_index: int,
    payload: TitleAlertResolveRequest,
    organization_id: UUID = Query(...),
    project_id: UUID = Query(...),
) -> TitleAlert:
    ensure_legal_titles_feature_enabled(
        organization_id=str(organization_id),
        project_id=str(project_id),
    )
    logger.info(
        "resolve_title_alert_skeleton",
        analysis_id=analysis_id,
        alert_index=alert_index,
    )
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Alert resolution is implemented in SDD 009 T038.",
    )


@router.post(
    "/legal-titles/{analysis_id}/approve",
    response_model=TitleAnalysisResponseData,
)
async def approve_title_case(
    analysis_id: UUID,
    organization_id: UUID = Query(...),
    project_id: UUID = Query(...),
) -> TitleAnalysisResponseData:
    ensure_legal_titles_feature_enabled(
        organization_id=str(organization_id),
        project_id=str(project_id),
    )
    logger.info("approve_title_case_skeleton", analysis_id=analysis_id)
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Title approval is implemented in SDD 009 T031.",
    )
