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
        redis=ctx.get("redis"),
    )
    return result.status


async def reconcile_legal_document_ingestions(ctx: dict) -> int:
    """Re-dispatch pending durable ingestion jobs missed by the upload path."""

    from services.legal_document_ingestion import (
        recover_pending_legal_document_ingestions,
    )

    recovered = await recover_pending_legal_document_ingestions()
    redis = ctx.get("redis")
    if redis is None:
        logger.warning("legal_ingestion_reconciler_without_redis")
        return 0

    dispatched = 0
    for result in recovered:
        payload = {
            "legal_document_id": result.legal_document.id,
            "organization_id": result.legal_document.organization_id,
            "project_id": result.legal_document.project_id,
            "ingestion_job_id": result.ingestion_job.id,
        }
        try:
            await redis.enqueue_job(
                "process_legal_document_ingestion",
                payload,
                _job_id=f"legal-ingestion:{result.ingestion_job.id}",
            )
            dispatched += 1
        except Exception as exc:
            logger.error(
                "legal_ingestion_reconciler_dispatch_failed",
                legal_document_id=result.legal_document.id,
                ingestion_job_id=result.ingestion_job.id,
                error=str(exc),
            )
    return dispatched
