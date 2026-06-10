"""API contract tests for SDD 007 US1 legal document ingestion."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
USER_ID = "00000000-0000-4000-8000-000000000003"
LEGAL_DOCUMENT_ID = "00000000-0000-4000-8000-000000000004"
INGESTION_JOB_ID = "00000000-0000-4000-8000-000000000005"


@pytest.fixture
def client() -> TestClient:
    from api.deps import verify_internal_secret
    from api.v1.endpoints.legal_variables import get_optional_arq_pool
    from api.v1.router import api_router

    app = FastAPI()
    app.state.redis = SimpleNamespace(enqueue_job=AsyncMock())

    async def bypass_secret() -> str:
        return "test"

    async def fake_arq_pool() -> SimpleNamespace:
        return app.state.redis

    app.dependency_overrides[verify_internal_secret] = bypass_secret
    app.dependency_overrides[get_optional_arq_pool] = fake_arq_pool
    app.include_router(api_router, prefix="/api/v1")
    return TestClient(app, headers={"X-Internal-Secret": "test"})


@pytest.fixture
def register_payload() -> dict[str, object]:
    return {
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "lot_id": None,
        "document_type": "dominio_vigente",
        "source_field": "doc_dominio_vigente",
        "storage_bucket": "project-files",
        "storage_path": f"{PROJECT_ID}/legal/dominio-vigente.pdf",
        "original_filename": "Dominio vigente.pdf",
        "mime_type": "application/pdf",
        "file_size_bytes": 123456,
        "sha256_hash": "a" * 64,
        "upload_source": "onboarding",
        "uploaded_by": USER_ID,
    }


def _registration_result(
    *,
    legal_document_id: str = LEGAL_DOCUMENT_ID,
    ingestion_job_id: str = INGESTION_JOB_ID,
    document_type: str = "dominio_vigente",
    original_filename: str = "Dominio vigente.pdf",
    version_number: int = 1,
    extraction_status: str = "queued",
) -> SimpleNamespace:
    from schemas.legal_variables import (
        DocumentIngestionJobResponse,
        LegalDocumentResponse,
    )

    now = datetime(2026, 6, 4, 12, 0, tzinfo=UTC)
    legal_document = LegalDocumentResponse.model_validate(
        {
            "id": legal_document_id,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "lot_id": None,
            "document_type": document_type,
            "source_field": "doc_dominio_vigente",
            "storage_bucket": "project-files",
            "storage_path": f"{PROJECT_ID}/legal/{legal_document_id}.pdf",
            "original_filename": original_filename,
            "mime_type": "application/pdf",
            "file_size_bytes": 123456,
            "sha256_hash": "a" * 64,
            "version_number": version_number,
            "upload_source": "onboarding",
            "uploaded_by": USER_ID,
            "extraction_status": extraction_status,
            "superseded_by": None,
            "created_at": now,
            "updated_at": now,
        }
    )
    ingestion_job = DocumentIngestionJobResponse.model_validate(
        {
            "id": ingestion_job_id,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "legal_document_id": legal_document_id,
            "status": "queued",
            "pipeline_version": "sdd_007_v1",
            "attempt_number": 1,
            "stats": {},
            "created_at": now,
            "updated_at": now,
        }
    )
    return SimpleNamespace(legal_document=legal_document, ingestion_job=ingestion_job)


def test_register_uploaded_legal_document_returns_queued_job(
    client: TestClient,
    register_payload: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
):
    import api.v1.endpoints.legal_variables as legal_variables_endpoint

    register_document = AsyncMock(return_value=_registration_result())
    monkeypatch.setattr(
        legal_variables_endpoint,
        "register_legal_document_service",
        register_document,
    )

    response = client.post(
        "/api/v1/legal-documents/register",
        json=register_payload,
    )

    assert response.status_code == 202
    assert response.json() == {
        "legal_document_id": LEGAL_DOCUMENT_ID,
        "ingestion_job_id": INGESTION_JOB_ID,
        "extraction_status": "queued",
        "version_number": 1,
    }
    register_document.assert_awaited_once()
    client.app.state.redis.enqueue_job.assert_awaited_once_with(
        "process_legal_document_ingestion",
        {
            "legal_document_id": LEGAL_DOCUMENT_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "ingestion_job_id": INGESTION_JOB_ID,
        },
    )
    persisted_payload = register_document.await_args.args[0]
    assert persisted_payload.organization_id == ORG_ID
    assert persisted_payload.project_id == PROJECT_ID
    assert persisted_payload.document_type == "dominio_vigente"
    assert persisted_payload.upload_source == "onboarding"


def test_list_project_legal_documents_exposes_extraction_status(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    import api.v1.endpoints.legal_variables as legal_variables_endpoint

    document = _registration_result().legal_document
    list_documents = AsyncMock(return_value=[document])
    monkeypatch.setattr(
        legal_variables_endpoint,
        "list_project_legal_documents_service",
        list_documents,
    )

    response = client.get(
        f"/api/v1/legal-documents/project/{PROJECT_ID}",
        params={"organization_id": ORG_ID},
    )

    assert response.status_code == 200
    assert response.json()["project_id"] == PROJECT_ID
    assert response.json()["documents"] == [
        {
            "id": LEGAL_DOCUMENT_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "lot_id": None,
            "document_type": "dominio_vigente",
            "source_field": "doc_dominio_vigente",
            "storage_bucket": "project-files",
            "storage_path": f"{PROJECT_ID}/legal/{LEGAL_DOCUMENT_ID}.pdf",
            "original_filename": "Dominio vigente.pdf",
            "mime_type": "application/pdf",
            "file_size_bytes": 123456,
            "sha256_hash": "a" * 64,
            "version_number": 1,
            "upload_source": "onboarding",
            "uploaded_by": USER_ID,
            "extraction_status": "queued",
            "superseded_by": None,
            "created_at": "2026-06-04T12:00:00Z",
            "updated_at": "2026-06-04T12:00:00Z",
        }
    ]
    list_documents.assert_awaited_once_with(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
    )


def test_register_rejects_unsupported_file_before_queueing_job(
    client: TestClient,
    register_payload: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
):
    from services import legal_document_ingestion
    import api.v1.endpoints.legal_variables as legal_variables_endpoint

    register_document = AsyncMock(
        side_effect=legal_document_ingestion.LegalDocumentValidationError(
            "Unsupported legal document MIME: application/x-msdownload"
        )
    )
    monkeypatch.setattr(
        legal_variables_endpoint,
        "register_legal_document_service",
        register_document,
    )
    payload = {
        **register_payload,
        "original_filename": "payload.exe",
        "mime_type": "application/x-msdownload",
        "storage_path": f"{PROJECT_ID}/legal/payload.exe",
    }

    response = client.post(
        "/api/v1/legal-documents/register",
        json=payload,
    )

    assert response.status_code == 422
    assert "Unsupported legal document MIME" in response.json()["detail"]
    register_document.assert_awaited_once()
    client.app.state.redis.enqueue_job.assert_not_awaited()


def test_register_rejects_storage_path_outside_project_namespace(
    client: TestClient,
    register_payload: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
):
    from services import legal_document_ingestion
    import api.v1.endpoints.legal_variables as legal_variables_endpoint

    register_document = AsyncMock(
        side_effect=legal_document_ingestion.LegalDocumentValidationError(
            "storage_path must start with the project_id namespace."
        )
    )
    monkeypatch.setattr(
        legal_variables_endpoint,
        "register_legal_document_service",
        register_document,
    )

    response = client.post(
        "/api/v1/legal-documents/register",
        json={
            **register_payload,
            "storage_path": f"other-project/{PROJECT_ID}/dominio-vigente.pdf",
        },
    )

    assert response.status_code == 422
    assert "project_id namespace" in response.json()["detail"]
    client.app.state.redis.enqueue_job.assert_not_awaited()


def test_register_persists_document_when_redis_is_unavailable(
    client: TestClient,
    register_payload: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
):
    from api.v1.endpoints.legal_variables import get_optional_arq_pool
    import api.v1.endpoints.legal_variables as legal_variables_endpoint

    async def redis_unavailable() -> None:
        return None

    client.app.dependency_overrides[get_optional_arq_pool] = redis_unavailable
    register_document = AsyncMock(return_value=_registration_result())
    monkeypatch.setattr(
        legal_variables_endpoint,
        "register_legal_document_service",
        register_document,
    )

    response = client.post(
        "/api/v1/legal-documents/register",
        json=register_payload,
    )

    assert response.status_code == 202
    assert response.json()["extraction_status"] == "queued"
    register_document.assert_awaited_once()
    client.app.state.redis.enqueue_job.assert_not_awaited()


def test_replacing_project_document_registers_new_version_and_job(
    client: TestClient,
    register_payload: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
):
    import api.v1.endpoints.legal_variables as legal_variables_endpoint

    register_document = AsyncMock(
        side_effect=[
            _registration_result(version_number=1),
            _registration_result(
                legal_document_id="00000000-0000-4000-8000-000000000006",
                ingestion_job_id="00000000-0000-4000-8000-000000000007",
                original_filename="Dominio vigente actualizado.pdf",
                version_number=2,
            ),
        ]
    )
    monkeypatch.setattr(
        legal_variables_endpoint,
        "register_legal_document_service",
        register_document,
    )

    first_response = client.post(
        "/api/v1/legal-documents/register",
        json=register_payload,
    )
    replacement_response = client.post(
        "/api/v1/legal-documents/register",
        json={
            **register_payload,
            "storage_path": f"{PROJECT_ID}/legal/dominio-vigente-v2.pdf",
            "original_filename": "Dominio vigente actualizado.pdf",
            "sha256_hash": "b" * 64,
            "upload_source": "project_documents",
        },
    )

    assert first_response.status_code == 202
    assert replacement_response.status_code == 202
    assert replacement_response.json() == {
        "legal_document_id": "00000000-0000-4000-8000-000000000006",
        "ingestion_job_id": "00000000-0000-4000-8000-000000000007",
        "extraction_status": "queued",
        "version_number": 2,
    }
    assert register_document.await_count == 2
    assert client.app.state.redis.enqueue_job.await_count == 2
    replacement_payload = register_document.await_args_list[1].args[0]
    assert replacement_payload.upload_source == "project_documents"
    assert replacement_payload.sha256_hash == "b" * 64


class FakeIngestionTable:
    def __init__(self, supabase: "FakeIngestionSupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.filters: dict[str, object] = {}
        self.insert_payload: dict[str, object] | None = None
        self.update_payload: dict[str, object] | None = None
        self.order_column: str | None = None
        self.desc = False
        self.limit_count: int | None = None
        self.negated_filters: dict[str, object] = {}
        self.in_filters: dict[str, tuple[object, ...]] = {}

    def select(self, *_args):
        return self

    def eq(self, column: str, value: object):
        self.filters[column] = value
        return self

    def neq(self, column: str, value: object):
        self.negated_filters[column] = value
        return self

    def in_(self, column: str, values: tuple[object, ...]):
        self.in_filters[column] = tuple(values)
        return self

    def order(self, column: str, desc: bool = False):
        self.order_column = column
        self.desc = desc
        return self

    def limit(self, count: int):
        self.limit_count = count
        return self

    def single(self):
        return self

    def insert(self, payload: dict[str, object]):
        self.insert_payload = payload
        return self

    def update(self, payload: dict[str, object]):
        self.update_payload = payload
        return self

    def execute(self):
        return self.supabase.execute(self)


class FakeIngestionSupabase:
    def __init__(self) -> None:
        self.now = datetime(2026, 6, 4, 12, 0, tzinfo=UTC)
        self.documents: list[dict[str, object]] = [
            self.document_row(
                legal_document_id="00000000-0000-4000-8000-000000000006",
                version_number=1,
                extraction_status="failed",
                sha256_hash="b" * 64,
            )
        ]
        self.jobs: list[dict[str, object]] = [
            self.job_row(
                job_id="00000000-0000-4000-8000-000000000007",
                legal_document_id="00000000-0000-4000-8000-000000000006",
                attempt_number=1,
                status="failed",
            )
        ]
        self.supersede_updates: list[dict[str, object]] = []

    def table(self, name: str) -> FakeIngestionTable:
        return FakeIngestionTable(self, name)

    def document_row(
        self,
        *,
        legal_document_id: str,
        version_number: int,
        extraction_status: str,
        sha256_hash: str,
        document_type: str = "dominio_vigente",
        source_field: str = "doc_dominio_vigente",
        original_filename: str = "Dominio vigente.pdf",
        superseded_by: str | None = None,
    ) -> dict[str, object]:
        return {
            "id": legal_document_id,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "lot_id": None,
            "document_type": document_type,
            "source_field": source_field,
            "storage_bucket": "project-files",
            "storage_path": f"{PROJECT_ID}/legal/{legal_document_id}.pdf",
            "original_filename": original_filename,
            "mime_type": "application/pdf",
            "file_size_bytes": 123456,
            "sha256_hash": sha256_hash,
            "version_number": version_number,
            "upload_source": "project_documents",
            "uploaded_by": USER_ID,
            "extraction_status": extraction_status,
            "superseded_by": superseded_by,
            "created_at": self.now,
            "updated_at": self.now,
        }

    def job_row(
        self,
        *,
        job_id: str,
        legal_document_id: str,
        attempt_number: int,
        status: str,
    ) -> dict[str, object]:
        return {
            "id": job_id,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "legal_document_id": legal_document_id,
            "status": status,
            "pipeline_version": "sdd_007_v1",
            "attempt_number": attempt_number,
            "stats": {},
            "created_at": self.now,
            "updated_at": self.now,
        }

    def execute(self, table: FakeIngestionTable):
        if table.name == "projects":
            return SimpleNamespace(data={"id": PROJECT_ID, "organization_id": ORG_ID})
        if table.name == "legal_documents":
            if table.insert_payload is not None:
                new_document = {
                    **table.insert_payload,
                    "id": LEGAL_DOCUMENT_ID,
                    "superseded_by": None,
                    "created_at": self.now,
                    "updated_at": self.now,
                }
                self.documents.append(new_document)
                return SimpleNamespace(data=new_document)
            if table.update_payload is not None:
                self.supersede_updates.append(table.update_payload)
                for document in self.documents:
                    if (
                        all(document.get(key) == value for key, value in table.filters.items())
                        and all(
                            document.get(key) != value
                            for key, value in table.negated_filters.items()
                        )
                        and all(
                            document.get(key) in values
                            for key, values in table.in_filters.items()
                        )
                    ):
                        document.update(table.update_payload)
                return SimpleNamespace(data=[])
            rows = [
                document
                for document in self.documents
                if all(document.get(key) == value for key, value in table.filters.items())
            ]
            if table.order_column:
                rows.sort(
                    key=lambda row: row.get(table.order_column) or 0,
                    reverse=table.desc,
                )
            if table.limit_count is not None:
                rows = rows[: table.limit_count]
            return SimpleNamespace(data=rows)
        if table.name == "document_ingestion_jobs":
            if table.insert_payload is not None:
                job_id = f"00000000-0000-4000-8000-0000000000{len(self.jobs) + 8:02d}"
                job = {
                    **table.insert_payload,
                    "id": job_id,
                    "created_at": self.now,
                    "updated_at": self.now,
                }
                self.jobs.append(job)
                return SimpleNamespace(data=job)
            rows = [
                job
                for job in self.jobs
                if all(job.get(key) == value for key, value in table.filters.items())
            ]
            if table.order_column:
                rows.sort(
                    key=lambda row: row.get(table.order_column) or 0,
                    reverse=table.desc,
                )
            if table.limit_count is not None:
                rows = rows[: table.limit_count]
            return SimpleNamespace(data=rows)
        return SimpleNamespace(data=[])


async def test_retry_queues_next_attempt_and_blocks_duplicate_dispatch():
    from services.legal_document_ingestion import (
        LegalDocumentValidationError,
        queue_retry_for_legal_document,
    )

    supabase = FakeIngestionSupabase()
    result = await queue_retry_for_legal_document(
        legal_document_id="00000000-0000-4000-8000-000000000006",
        organization_id=ORG_ID,
        supabase=supabase,
    )

    assert result.legal_document.extraction_status == "queued"
    assert result.ingestion_job.attempt_number == 2
    assert supabase.documents[0]["extraction_status"] == "queued"
    assert supabase.jobs[-1]["attempt_number"] == 2

    with pytest.raises(LegalDocumentValidationError):
        await queue_retry_for_legal_document(
            legal_document_id="00000000-0000-4000-8000-000000000006",
            organization_id=ORG_ID,
            supabase=supabase,
        )

    assert [job["attempt_number"] for job in supabase.jobs] == [1, 2]


async def test_retry_can_reprocess_completed_documents_after_extractor_updates():
    from services.legal_document_ingestion import queue_retry_for_legal_document

    supabase = FakeIngestionSupabase()
    supabase.documents[0]["extraction_status"] = "variables_proposed"
    supabase.jobs[0]["status"] = "variables_proposed"

    result = await queue_retry_for_legal_document(
        legal_document_id="00000000-0000-4000-8000-000000000006",
        organization_id=ORG_ID,
        supabase=supabase,
    )

    assert result.legal_document.extraction_status == "queued"
    assert result.ingestion_job.attempt_number == 2
    assert supabase.documents[0]["extraction_status"] == "queued"


async def test_registering_replacement_supersedes_previous_active_versions():
    from schemas.legal_variables import LegalDocumentRegisterRequest
    from services.legal_document_ingestion import register_legal_document

    supabase = FakeIngestionSupabase()
    supabase.documents[0]["extraction_status"] = "variables_proposed"

    result = await register_legal_document(
        LegalDocumentRegisterRequest.model_validate(
            {
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "lot_id": None,
                "document_type": "dominio_vigente",
                "source_field": "doc_dominio_vigente",
                "storage_bucket": "project-files",
                "storage_path": f"{PROJECT_ID}/legal/dominio-vigente-v2.pdf",
                "original_filename": "Dominio vigente actualizado.pdf",
                "mime_type": "application/pdf",
                "file_size_bytes": 223456,
                "sha256_hash": "c" * 64,
                "upload_source": "project_documents",
                "uploaded_by": USER_ID,
            }
        ),
        supabase=supabase,
    )

    assert result.legal_document.version_number == 2
    assert result.ingestion_job.attempt_number == 1
    assert supabase.documents[0]["extraction_status"] == "superseded"
    assert supabase.documents[0]["superseded_by"] == LEGAL_DOCUMENT_ID
    assert supabase.documents[-1]["extraction_status"] == "queued"
    assert supabase.supersede_updates == [
        {
            "extraction_status": "superseded",
            "superseded_by": LEGAL_DOCUMENT_ID,
        }
    ]


async def test_select_active_latest_sii_certificate_excludes_superseded_versions():
    from services.legal_document_ingestion import get_active_legal_document_for_type

    active_document_id = "00000000-0000-4000-8000-000000000026"
    superseded_document_id = "00000000-0000-4000-8000-000000000025"
    supabase = FakeIngestionSupabase()
    supabase.documents = [
        supabase.document_row(
            legal_document_id=superseded_document_id,
            version_number=1,
            extraction_status="superseded",
            sha256_hash="d" * 64,
            document_type="certificado_roles_sii",
            source_field="doc_roles",
            original_filename="Roles SII antiguo.pdf",
            superseded_by=active_document_id,
        ),
        supabase.document_row(
            legal_document_id=active_document_id,
            version_number=2,
            extraction_status="variables_proposed",
            sha256_hash="e" * 64,
            document_type="certificado_roles_sii",
            source_field="doc_roles",
            original_filename="Roles SII vigente.pdf",
        ),
    ]

    active_document = await get_active_legal_document_for_type(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        document_type="certificado_roles_sii",
        supabase=supabase,
    )

    assert active_document.id == active_document_id
    assert active_document.document_type == "certificado_roles_sii"
    assert active_document.version_number == 2
    assert active_document.extraction_status == "variables_proposed"
