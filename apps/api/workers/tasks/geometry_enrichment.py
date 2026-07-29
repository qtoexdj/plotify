"""ARQ wake-up task for durable geometry enrichment."""

from __future__ import annotations

from services.geometry_enrichment_jobs import GeometryEnrichmentRepository


async def process_geometry_enrichment(ctx: dict, *, worker_id: str = "geometry-worker") -> dict:
    repository = ctx.get("geometry_enrichment_repository") or GeometryEnrichmentRepository()
    job = await repository.claim(worker_id)
    if job is None:
        return {"status": "idle"}
    try:
        # Source geometries are immutable. Detailed PostGIS/servitude projection
        # is persisted as a derivation result, never by rewriting source rows.
        result = {"jobKind": job.job_kind, "sourcePreserved": True}
        await repository.complete(job, result)
        return {"status": "ready", "jobId": job.id}
    except Exception as exc:
        status = await repository.retry(job, type(exc).__name__.upper())
        return {"status": status, "jobId": job.id}
