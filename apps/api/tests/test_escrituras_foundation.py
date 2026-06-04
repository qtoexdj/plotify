"""Regression coverage for SDD 007 foundational service skeletons."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_legal_document_response_ignores_db_only_columns():
    from schemas.legal_variables import LegalDocumentResponse

    document = LegalDocumentResponse.model_validate(
        {
            "id": "doc-1",
            "organization_id": "org-1",
            "project_id": "project-1",
            "document_type": "dominio_vigente",
            "storage_bucket": "project-files",
            "storage_path": "project-1/doc.pdf",
            "original_filename": "doc.pdf",
            "mime_type": "application/pdf",
            "file_size_bytes": 123,
            "sha256_hash": "a" * 64,
            "version_number": 1,
            "upload_source": "api",
            "extraction_status": "queued",
            "db_projection_only": "ignored",
        }
    )

    assert document.id == "doc-1"


def test_legal_document_request_rejects_unknown_fields():
    from pydantic import ValidationError
    from schemas.legal_variables import LegalDocumentRegisterRequest

    try:
        LegalDocumentRegisterRequest.model_validate(
            {
                "organization_id": "org-1",
                "project_id": "project-1",
                "document_type": "dominio_vigente",
                "storage_path": "project-1/doc.pdf",
                "original_filename": "doc.pdf",
                "mime_type": "application/pdf",
                "file_size_bytes": 123,
                "upload_source": "api",
                "db_projection_only": "rejected",
            }
        )
    except ValidationError as exc:
        assert "db_projection_only" in str(exc)
    else:
        raise AssertionError("unknown request field should be rejected")


def test_legal_variables_router_exposes_contract_paths():
    from api.deps import verify_internal_secret
    import api.v1.endpoints.legal_variables as legal_variables_endpoint
    from api.v1.router import api_router

    app = FastAPI()

    async def bypass_secret():
        return "test"

    app.dependency_overrides[verify_internal_secret] = bypass_secret
    app.include_router(api_router, prefix="/api/v1")
    client = TestClient(app, headers={"X-Internal-Secret": "test"})

    assert client.post("/api/v1/legal-documents/register", json={}).status_code == 422
    assert (
        client.post("/api/v1/legal/legal-documents/register", json={}).status_code
        == 404
    )
    with patch.object(
        legal_variables_endpoint,
        "list_project_legal_documents_service",
        new=AsyncMock(return_value=[]),
    ):
        assert (
            client.get(
                "/api/v1/legal-documents/project/project-1",
                params={"organization_id": "org-1"},
            ).status_code
            == 200
        )
    assert (
        client.get(
            "/api/v1/legal-roles/project/project-1/matches",
            params={"organization_id": "org-1"},
        ).status_code
        == 501
    )
    assert client.post("/api/v1/legal-roles/match", json={}).status_code == 404
    assert (
        client.get(
            "/api/v1/escritura-cases/lots/lot-1/readiness",
            params={"organization_id": "org-1", "project_id": "project-1"},
        ).status_code
        == 501
    )


async def test_worker_process_legal_document_ingestion_calls_service_boundary():
    from workers.tasks.legal_document_ingestion import process_legal_document_ingestion

    with patch(
        "services.legal_document_ingestion.run_document_ingestion_job",
        new=AsyncMock(return_value=SimpleNamespace(status="processing")),
    ) as run_job:
        result = await process_legal_document_ingestion(
            {},
            {
                "legal_document_id": "doc-1",
                "organization_id": "org-1",
                "project_id": "project-1",
                "ingestion_job_id": "job-1",
            },
        )

    assert result == "processing"
    run_job.assert_awaited_once_with(
        legal_document_id="doc-1",
        organization_id="org-1",
        project_id="project-1",
        ingestion_job_id="job-1",
    )


def test_fetch_project_lots_uses_project_organization_scope():
    from services.legal_role_matching import fetch_project_lots

    table = MagicMock()
    table.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(
            data=[
                {
                    "id": "lot-1",
                    "project_id": "project-1",
                    "numero_lote": "24",
                    "projects": {"organization_id": "org-1"},
                }
            ]
        )
    )
    supabase = MagicMock()
    supabase.table.return_value = table

    async def run():
        return await fetch_project_lots(
            "project-1",
            "org-1",
            supabase=supabase,
        )

    import asyncio

    lots = asyncio.run(run())

    table.select.assert_called_once_with(
        "id, project_id, numero_lote, projects!inner(organization_id)"
    )
    assert lots[0].organization_id == "org-1"
    assert lots[0].lot_number == "24"


async def test_text_extraction_service_passes_tenant_scope_to_repository():
    from services.legal_text_extraction import (
        LegalDocumentExtractionSource,
        LegalTextExtractionService,
    )

    repository = MagicMock()
    repository.update_job_status = AsyncMock()
    repository.update_document_status = AsyncMock()
    service = LegalTextExtractionService(repository=repository)
    source = LegalDocumentExtractionSource(
        organization_id="org-1",
        project_id="project-1",
        legal_document_id="doc-1",
        ingestion_job_id="job-1",
        content=b"text",
        mime_type="text/plain",
    )

    await service.mark_processing(source)

    repository.update_job_status.assert_awaited_once_with(
        "job-1",
        organization_id="org-1",
        project_id="project-1",
        legal_document_id="doc-1",
        status="processing",
        converter=None,
        stats=None,
        error_code=None,
        error_message=None,
        completed=False,
    )
    repository.update_document_status.assert_awaited_once_with(
        "doc-1",
        organization_id="org-1",
        project_id="project-1",
        extraction_status="processing",
    )
