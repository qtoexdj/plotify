"""ARQ tasks for SDD 007 legal document ingestion."""

from __future__ import annotations

from typing import Any

from core.logger import get_logger

logger = get_logger(__name__)


async def process_legal_document_ingestion(ctx: dict, payload: dict[str, Any]) -> str:
    """
    Process one legal document extraction job.

    The service implementation is imported lazily so worker boot remains cheap and
    tests can import WorkerSettings before optional extraction dependencies exist.
    """
    legal_document_id = payload.get("legal_document_id")
    organization_id = payload.get("organization_id")
    project_id = payload.get("project_id")

    if not legal_document_id or not organization_id or not project_id:
        logger.error("legal_ingestion_missing_payload_fields", payload=payload)
        return "MISSING_REQUIRED_FIELDS"

    from services.legal_document_ingestion import run_document_ingestion_job

    result = await run_document_ingestion_job(
        legal_document_id=str(legal_document_id),
        organization_id=str(organization_id),
        project_id=str(project_id),
        ingestion_job_id=payload.get("ingestion_job_id"),
    )
    return result.status
