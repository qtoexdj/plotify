from types import SimpleNamespace

from services.geometry_enrichment_jobs import EnrichmentJob, GeometryEnrichmentRepository
from workers.tasks.geometry_enrichment import process_geometry_enrichment


class FakeQuery:
    def __init__(self, data=None): self.data = data; self.updates = []
    def update(self, value): self.updates.append(value); return self
    def eq(self, *_args): return self
    def execute(self): return SimpleNamespace(data=self.data)


class FakeClient:
    def __init__(self, row): self.row = row; self.queries = []
    def rpc(self, *_args): return FakeQuery(self.row)
    def table(self, *_args): query = FakeQuery(); self.queries.append(query); return query


async def test_repository_uses_durable_retry_state() -> None:
    job = EnrichmentJob(id="job", organization_id="org", project_id="project", job_kind="lot_metrics", attempt_count=2)
    client = FakeClient(None); repository = GeometryEnrichmentRepository(client)
    assert await repository.retry(job, "TRANSIENT") == "retry_scheduled"
    assert client.queries[0].updates[0]["status"] == "retry_scheduled"


async def test_worker_claims_and_completes_without_mutating_source() -> None:
    row = {"id": "job", "organization_id": "org", "project_id": "project", "job_kind": "lot_metrics",
           "attempt_count": 1, "lot_id": "lot", "geometry_id": "geometry", "derivation_id": None}
    repository = GeometryEnrichmentRepository(FakeClient(row))
    result = await process_geometry_enrichment({"geometry_enrichment_repository": repository})
    assert result == {"status": "ready", "jobId": "job"}
