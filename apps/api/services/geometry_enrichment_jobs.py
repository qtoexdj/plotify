"""Durable repository for canonical geometry enrichment obligations."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class EnrichmentJob:
    id: str
    organization_id: str
    project_id: str
    job_kind: str
    attempt_count: int
    lot_id: str | None = None
    geometry_id: str | None = None
    derivation_id: str | None = None


class GeometryEnrichmentRepository:
    def __init__(self, client: Any | None = None) -> None:
        if client is None:
            from core.database import get_supabase_client

            client = get_supabase_client()
        self.client = client

    async def claim(self, worker_id: str) -> EnrichmentJob | None:
        result = await asyncio.to_thread(
            lambda: self.client.rpc(
                "claim_geometry_enrichment_job", {"p_worker_id": worker_id}
            ).execute()
        )
        row = result.data
        if not row:
            return None
        if isinstance(row, list):
            row = row[0] if row else None
        return EnrichmentJob(**{key: row.get(key) for key in EnrichmentJob.__dataclass_fields__}) if row else None

    async def complete(self, job: EnrichmentJob, result: dict[str, Any]) -> None:
        await asyncio.to_thread(
            lambda: self.client.table("geometry_enrichment_jobs")
            .update({"status": "ready", "lease_owner": None, "lease_expires_at": None,
                     "last_error_code": None, "completed_at": datetime.now(UTC).isoformat()})
            .eq("id", job.id).eq("status", "leased").execute()
        )
        if job.derivation_id:
            await asyncio.to_thread(
                lambda: self.client.table("geometry_derivations")
                .update({"status": "ready", "result": result})
                .eq("id", job.derivation_id).execute()
            )

    async def retry(self, job: EnrichmentJob, error_code: str) -> str:
        terminal = job.attempt_count >= 8
        status = "dead_letter" if terminal else "retry_scheduled"
        update = {"status": status, "lease_owner": None, "lease_expires_at": None,
                  "last_error_code": error_code[:120]}
        await asyncio.to_thread(
            lambda: self.client.table("geometry_enrichment_jobs")
            .update(update).eq("id", job.id).eq("status", "leased").execute()
        )
        return status


__all__ = ["EnrichmentJob", "GeometryEnrichmentRepository"]
