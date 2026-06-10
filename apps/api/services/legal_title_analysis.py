"""Orchestrator service for SDD 009 title analysis."""

from __future__ import annotations

import hashlib
import asyncio
from uuid import uuid4
from datetime import datetime, timezone
from typing import Any, Sequence
from dataclasses import dataclass

from core.config import get_settings
from core.logger import get_logger
from schemas.legal_titles import (
    TitleAnalysis,
    TitleAnalysisResponseData,
    TitleAlert,
    TitleAnalysisRunDetails,
    TitleAnalysisNarrative,
)

logger = get_logger(__name__)

EXTRACTOR_NAME = "titulo_agent_v1"
PROMPT_VERSION = "v1"


class LegalTitleAnalysisError(Exception):
    """Base exception for legal title analysis service."""
    pass


class LegalTitleAnalysisNotFoundError(LegalTitleAnalysisError, LookupError):
    """Raised when a project title analysis is not found."""
    pass


class LegalTitleAnalysisScopeError(LegalTitleAnalysisError, PermissionError):
    """Raised when tenant scoping fails validation."""
    pass


class LegalTitleAnalysisValidationError(LegalTitleAnalysisError, ValueError):
    """Raised when validation preconditions fail."""
    pass


@dataclass(frozen=True, slots=True)
class TitleAnalysisInput:
    organization_id: str
    project_id: str


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


async def gather_title_source_documents(
    organization_id: str,
    project_id: str,
    supabase: Any
) -> list[dict[str, Any]]:
    """Gather active title-type documents (dominio_vigente, hipoteca_gravamen, etc.) for the project."""
    logger.info("gather_title_source_documents_skeleton", project_id=project_id)
    # Placeholder: in US1, this will query legal_documents
    return []


def compute_source_content_hash(documents: Sequence[dict[str, Any]]) -> str:
    """Compute SHA-256 hash of sorted active document IDs and contents to determine idempotency."""
    # Placeholder hash computation
    logger.info("compute_source_content_hash_skeleton")
    sha256 = hashlib.sha256()
    for doc in sorted(documents, key=lambda d: d.get("id", "")):
        doc_id = str(doc.get("id", ""))
        sha256.update(doc_id.encode("utf-8"))
    return sha256.hexdigest()


async def check_idempotency(
    project_id: str,
    source_content_hash: str,
    extractor_name: str,
    prompt_version: str,
    supabase: Any
) -> dict[str, Any] | None:
    """Check if an analysis run with the same hash exists and is not failed."""
    logger.info("check_idempotency_skeleton", hash=source_content_hash)
    # Placeholder
    return None


async def run_title_analysis(
    organization_id: str,
    project_id: str,
    supabase: Any | None = None
) -> TitleAnalysisResponseData:
    """Orchestrates the entire title analysis pipeline (gathering, LLM run, verification, persisting)."""
    client = supabase or _get_supabase_client()
    settings = get_settings()
    logger.info(
        "run_title_analysis_skeleton",
        project_id=project_id,
        organization_id=organization_id,
    )
    source_documents = await gather_title_source_documents(
        organization_id=organization_id,
        project_id=project_id,
        supabase=client,
    )
    source_content_hash = compute_source_content_hash(source_documents)
    existing = await check_idempotency(
        project_id=project_id,
        source_content_hash=source_content_hash,
        extractor_name=EXTRACTOR_NAME,
        prompt_version=PROMPT_VERSION,
        supabase=client,
    )
    if existing is not None:
        raise NotImplementedError("Title analysis row hydration is implemented in SDD 009 T018.")

    if settings.LEGAL_TITLE_AGENT_ENABLED:
        raise NotImplementedError("Title LLM extraction pipeline is implemented in SDD 009 T017.")

    # Phase 2 skeleton: represent the disabled run state without inventing an
    # analyzed chain, narrative, verification result or approval-ready data.
    return TitleAnalysisResponseData(
        id=uuid4(),
        status="llm_disabled",
        structure_type=None,
        analysis=TitleAnalysis(
            structure_type=None,
            property_identity=None,
            inscripciones=[],
            propietarios_actuales=[],
            alertas=[],
        ),
        narrative=None,
        alerts=[],
        verification=None,
        pending_review=[],
        source_documents=[],
        run=TitleAnalysisRunDetails(
            extractor_name=EXTRACTOR_NAME,
            model_name=settings.LEGAL_TITLE_AGENT_MODEL,
            prompt_version=PROMPT_VERSION,
            duration_ms=None,
            created_at=datetime.now(timezone.utc),
        ),
        approved_by=None,
        approved_at=None,
    )


async def update_title_narrative(
    analysis_id: str,
    organization_id: str,
    project_id: str,
    block: str,
    edited_text: str,
    reason: str,
    supabase: Any | None = None
) -> TitleAnalysisNarrative:
    """Update Comparecencia or Primero narrative block with audit logging."""
    logger.info("update_title_narrative_skeleton", analysis_id=analysis_id, block=block)
    raise NotImplementedError("Narrative edits are implemented in SDD 009 T031.")


async def resolve_title_alert(
    analysis_id: str,
    alert_index: int,
    resolution: str,
    reason: str,
    organization_id: str,
    project_id: str,
    supabase: Any | None = None
) -> TitleAlert:
    """Resolve an extracted title alert (acknowledged, clause_added, dismissed) with auditing."""
    logger.info("resolve_title_alert_skeleton", analysis_id=analysis_id, alert_index=alert_index)
    raise NotImplementedError("Alert resolution is implemented in SDD 009 T038.")


async def approve_title_case(
    analysis_id: str,
    organization_id: str,
    project_id: str,
    supabase: Any | None = None
) -> TitleAnalysisResponseData:
    """Run approval checks and transition analysis status to approved."""
    logger.info("approve_title_case_skeleton", analysis_id=analysis_id)
    raise NotImplementedError("Title approval is implemented in SDD 009 T031.")
