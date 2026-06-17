"""ARQ tasks for SDD 009 legal title analysis."""

from __future__ import annotations

from typing import Any

from core.logger import get_logger

logger = get_logger(__name__)


async def analyze_project_title(ctx: dict, payload: dict[str, Any]) -> str:
    """
    Process title analysis for a project.

    The orchestrator service is imported lazily so worker boot remains cheap and
    tests can import WorkerSettings without extra dependency overhead.
    """
    organization_id = payload.get("organization_id")
    project_id = payload.get("project_id")

    if not organization_id or not project_id:
        logger.error("analyze_project_title_missing_payload_fields", payload=payload)
        return "MISSING_REQUIRED_FIELDS"

    from services.legal_title_analysis import run_title_analysis

    result = await run_title_analysis(
        organization_id=str(organization_id),
        project_id=str(project_id),
    )
    return result.status
