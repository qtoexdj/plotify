"""SDD 009 title analysis API endpoints."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.deps import verify_internal_secret
from core.logger import get_logger
from core.config import get_settings
from core.redis import get_arq_pool
from schemas.legal_titles import (
    TitleCaseResponse,
    TitleAnalysisResponseData,
    TitleAnalysisReanalyzeResponse,
    TitleApproveRequest,
    TitleNarrativeUpdateRequest,
    TitleAnalysisNarrative,
    TitleAlertResolveRequest,
    TitleAlert,
)
from services.legal_title_analysis import (
    LegalTitleAnalysisConflictError,
    LegalTitleAnalysisError,
    LegalTitleAnalysisNotFoundError,
    LegalTitleAnalysisScopeError,
    LegalTitleAnalysisValidationError,
    LegalTitleApprovalBlockedError,
    approve_title_case as approve_title_case_service,
    get_project_title_case as get_project_title_case_service,
    request_title_reanalysis as request_title_reanalysis_service,
    resolve_title_alert as resolve_title_alert_service,
    update_title_narrative as update_title_narrative_service,
)

logger = get_logger(__name__)

router = APIRouter(
    tags=["legal-titles"],
    dependencies=[Depends(verify_internal_secret)],
)


async def get_optional_arq_pool() -> Any | None:
    try:
        return await get_arq_pool()
    except Exception:  # pragma: no cover - redis optional in some envs
        logger.warning("legal_titles_arq_pool_unavailable")
        return None


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


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, LegalTitleAnalysisNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        )
    if isinstance(exc, LegalTitleAnalysisScopeError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        )
    if isinstance(exc, LegalTitleAnalysisConflictError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        )
    if isinstance(exc, LegalTitleAnalysisValidationError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
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
    try:
        analysis = await get_project_title_case_service(
            organization_id=str(organization_id),
            project_id=str(project_id),
        )
    except (LegalTitleAnalysisScopeError, LegalTitleAnalysisNotFoundError) as exc:
        raise _http_error(exc) from exc
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project has no title documents.",
        )
    return TitleCaseResponse(analysis=analysis)


@router.post(
    "/legal-titles/project/{project_id}/reanalyze",
    response_model=TitleAnalysisReanalyzeResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def reanalyze_project_title(
    project_id: UUID,
    organization_id: UUID = Query(...),
    redis: Any | None = Depends(get_optional_arq_pool),
) -> TitleAnalysisReanalyzeResponse:
    ensure_legal_titles_feature_enabled(
        organization_id=str(organization_id),
        project_id=str(project_id),
    )
    try:
        analysis_id, analysis_status, queued = await request_title_reanalysis_service(
            organization_id=str(organization_id),
            project_id=str(project_id),
            redis=redis,
        )
    except LegalTitleAnalysisError as exc:
        raise _http_error(exc) from exc
    return TitleAnalysisReanalyzeResponse(
        analysis_id=UUID(analysis_id),
        status=analysis_status,
        queued=queued,
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
    try:
        return await update_title_narrative_service(
            analysis_id=str(analysis_id),
            organization_id=str(organization_id),
            project_id=str(project_id),
            block=payload.block,
            edited_text=payload.edited_text,
            reason=payload.reason,
            edited_by=str(payload.edited_by),
        )
    except LegalTitleAnalysisError as exc:
        raise _http_error(exc) from exc


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
    try:
        return await resolve_title_alert_service(
            analysis_id=str(analysis_id),
            alert_index=alert_index,
            resolution=payload.resolution,
            reason=payload.reason,
            resolved_by=str(payload.resolved_by),
            organization_id=str(organization_id),
            project_id=str(project_id),
        )
    except LegalTitleAnalysisError as exc:
        raise _http_error(exc) from exc


@router.post(
    "/legal-titles/{analysis_id}/approve",
    response_model=TitleAnalysisResponseData,
)
async def approve_title_case(
    analysis_id: UUID,
    payload: TitleApproveRequest,
    organization_id: UUID = Query(...),
    project_id: UUID = Query(...),
) -> TitleAnalysisResponseData:
    ensure_legal_titles_feature_enabled(
        organization_id=str(organization_id),
        project_id=str(project_id),
    )
    try:
        return await approve_title_case_service(
            analysis_id=str(analysis_id),
            organization_id=str(organization_id),
            project_id=str(project_id),
            approved_by=str(payload.approved_by),
        )
    except LegalTitleApprovalBlockedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"blocking": exc.blocking},
        ) from exc
    except LegalTitleAnalysisError as exc:
        raise _http_error(exc) from exc
