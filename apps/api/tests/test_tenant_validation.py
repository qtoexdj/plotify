"""Regression tests for service-role tenant validation."""

from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace


def _build_approvals_app():
    from fastapi import FastAPI

    from api.deps import verify_internal_secret
    from api.v1.endpoints.approvals import router as approvals_router
    from core.redis import get_arq_pool

    app = FastAPI()

    async def _bypass_auth():
        return "test-secret"

    async def _fake_arq_pool():
        redis = AsyncMock()
        redis.enqueue_job = AsyncMock()
        return redis

    app.dependency_overrides[verify_internal_secret] = _bypass_auth
    app.dependency_overrides[get_arq_pool] = _fake_arq_pool
    app.include_router(approvals_router, prefix="/api/v1/approvals")
    return app


def _build_legal_variables_app():
    from fastapi import FastAPI

    from api.deps import verify_internal_secret
    from api.v1.endpoints.legal_variables import (
        get_optional_arq_pool,
        router as legal_variables_router,
    )

    app = FastAPI()

    async def _bypass_auth():
        return "test-secret"

    async def _fake_arq_pool():
        redis = AsyncMock()
        redis.enqueue_job = AsyncMock()
        return redis

    app.dependency_overrides[verify_internal_secret] = _bypass_auth
    app.dependency_overrides[get_optional_arq_pool] = _fake_arq_pool
    app.include_router(legal_variables_router, prefix="/api/v1")
    return app


def _make_approval_supabase(lot_org_id: str):
    lot_result = MagicMock()
    lot_result.data = [
        {
            "id": "lot-1",
            "estado": "disponible",
            "numero_lote": "42",
            "project_id": "project-1",
            "precio": 10_000_000,
            "valor_reserva": 500_000,
            "projects": {"organization_id": lot_org_id},
        }
    ]

    lots_query = MagicMock()
    lots_query.select.return_value.eq.return_value.limit.return_value.execute.return_value = lot_result
    lots_query.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data=lot_result.data[0]
    )

    supabase = MagicMock()
    supabase.table.return_value = lots_query
    return supabase


def test_request_reservation_rejects_cross_tenant_organization_id():
    from fastapi.testclient import TestClient

    supabase = _make_approval_supabase(lot_org_id="org-real")
    client = TestClient(
        _build_approvals_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with (
        patch("api.v1.endpoints.approvals.get_supabase_client", return_value=supabase),
        patch(
            "asyncio.to_thread",
            new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
        ),
    ):
        response = client.post(
            "/api/v1/approvals/request-reservation",
            json={
                "lot_id": "lot-1",
                "organization_id": "org-attacker",
                "vendor_id": "vendor-1",
                "vendor_name": "Vendedor",
                "vendor_phone": "+56912345678",
                "vendor_platform": "telegram",
                "payload": {
                    "cliente_nombre": "Cliente Demo",
                    "cliente_run": "12.345.678-9",
                    "valor_reserva": 500000,
                },
            },
        )

    assert response.status_code == 403


async def test_process_admin_decision_rejects_tenant_mismatch():
    """The admin decision worker must reject or fail safely if the database indicates a tenant mismatch."""
    from unittest.mock import AsyncMock, MagicMock, patch
    from workers.tasks.approval_processor import process_admin_decision

    rpc_result = MagicMock(data={"success": False, "error": "tenant_mismatch"})

    supabase = MagicMock()
    supabase.rpc.return_value.execute.return_value = rpc_result

    # Simular que el approval pertenece a otra org (TENANT_MISMATCH)
    supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"organization_id": "org-other-uuid"}]
    )

    telegram_client = MagicMock()
    telegram_client.send_text = AsyncMock()

    with (
        patch("workers.tasks.approval_processor.get_supabase_client", return_value=supabase),
        patch(
            "workers.tasks.approval_processor.get_telegram_client_for_org",
            new=AsyncMock(return_value=telegram_client),
        ),
    ):
        result = await process_admin_decision(
            {}, "org-b-uuid", "approval-a-uuid", "approve", "telegram-admin"
        )

    assert result == "TENANT_MISMATCH"
    assert supabase.rpc.call_count == 0


def _make_approval_detail_supabase(org_id: str):
    from unittest.mock import MagicMock
    approval_data = {
        "id": "approval-1",
        "organization_id": org_id,
        "status": "pending",
    }

    query_mock = MagicMock()
    query_mock.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data=approval_data
    )

    supabase = MagicMock()
    supabase.table.return_value = query_mock
    return supabase


def test_get_approval_rejects_cross_tenant():
    """Un administrador extranjero no puede ver detalles de aprobación de otra organización."""
    from fastapi.testclient import TestClient

    supabase = _make_approval_detail_supabase(org_id="org-real")
    client = TestClient(
        _build_approvals_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with (
        patch("api.v1.endpoints.approvals.get_supabase_client", return_value=supabase),
        patch(
            "asyncio.to_thread",
            new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
        ),
    ):
        response = client.get(
            "/api/v1/approvals/approval-1?organization_id=org-attacker",
        )

    assert response.status_code == 403
    assert "organization_id no corresponde" in response.json()["detail"]


def test_decide_approval_rejects_cross_tenant():
    """Un administrador extranjero no puede decidir/mutar sobre una aprobación de otra organización."""
    from fastapi.testclient import TestClient

    supabase = _make_approval_detail_supabase(org_id="org-real")
    client = TestClient(
        _build_approvals_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with (
        patch("api.v1.endpoints.approvals.get_supabase_client", return_value=supabase),
        patch(
            "asyncio.to_thread",
            new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
        ),
    ):
        response = client.post(
            "/api/v1/approvals/approval-1/decide",
            json={
                "action": "approve",
                "organization_id": "org-attacker",
                "admin_id": "admin-1",
            },
        )

    assert response.status_code == 403
    assert "organization_id no corresponde" in response.json()["detail"]


def test_decide_reject_approval_rejects_cross_tenant():
    """Un administrador extranjero no puede decidir/rechazar/mutar sobre una aprobación de otra organización."""
    from fastapi.testclient import TestClient

    supabase = _make_approval_detail_supabase(org_id="org-real")
    client = TestClient(
        _build_approvals_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with (
        patch("api.v1.endpoints.approvals.get_supabase_client", return_value=supabase),
        patch(
            "asyncio.to_thread",
            new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
        ),
    ):
        response = client.post(
            "/api/v1/approvals/approval-1/decide",
            json={
                "action": "reject",
                "organization_id": "org-attacker",
                "admin_id": "admin-1",
            },
        )

    assert response.status_code == 403
    assert "organization_id no corresponde" in response.json()["detail"]


def test_list_legal_documents_rejects_cross_tenant_project_scope():
    """Un tenant no puede listar documentos legales de un proyecto ajeno."""
    from fastapi.testclient import TestClient

    import api.v1.endpoints.legal_variables as legal_variables_endpoint
    from services.legal_document_ingestion import LegalDocumentScopeError

    client = TestClient(
        _build_legal_variables_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with patch.object(
        legal_variables_endpoint,
        "list_project_legal_documents_service",
        new=AsyncMock(
            side_effect=LegalDocumentScopeError(
                "project_id does not belong to organization_id."
            )
        ),
    ) as list_documents:
        response = client.get(
            "/api/v1/legal-documents/project/project-real",
            params={"organization_id": "org-attacker"},
        )

    assert response.status_code == 403
    assert "project_id does not belong" in response.json()["detail"]
    list_documents.assert_awaited_once_with(
        project_id="project-real",
        organization_id="org-attacker",
    )


def test_get_legal_variables_rejects_cross_tenant_project_scope():
    """Un tenant no puede consultar inventario de variables legales de otro tenant."""
    from fastapi.testclient import TestClient

    import api.v1.endpoints.legal_variables as legal_variables_endpoint
    from services.legal_variable_resolution import LegalVariableInventoryScopeError

    client = TestClient(
        _build_legal_variables_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with patch.object(
        legal_variables_endpoint,
        "get_project_variable_inventory_service",
        new=AsyncMock(
            side_effect=LegalVariableInventoryScopeError(
                "project_id does not belong to organization_id."
            )
        ),
    ) as get_inventory:
        response = client.get(
            "/api/v1/legal-variables/project/project-real",
            params={"organization_id": "org-attacker"},
        )

    assert response.status_code == 403
    assert "project_id does not belong" in response.json()["detail"]
    get_inventory.assert_awaited_once_with(
        project_id="project-real",
        organization_id="org-attacker",
        lot_id=None,
        state=None,
        group=None,
        include_evidence=True,
    )


def test_patch_legal_variable_rejects_cross_tenant_mutation():
    """Un tenant no puede corregir o aprobar variables legales de otro proyecto."""
    from fastapi.testclient import TestClient

    import api.v1.endpoints.legal_variables as legal_variables_endpoint
    from services.legal_variable_resolution import LegalVariableInventoryScopeError

    client = TestClient(
        _build_legal_variables_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with patch.object(
        legal_variables_endpoint,
        "update_legal_variable_service",
        new=AsyncMock(
            side_effect=LegalVariableInventoryScopeError(
                "variable_resolution_id does not belong to project_id."
            )
        ),
    ) as update_variable:
        response = client.patch(
            "/api/v1/legal-variables/variable-real",
            params={
                "organization_id": "org-attacker",
                "project_id": "project-attacker",
            },
            json={
                "action": "approve",
                "state": "approved",
                "reviewed_by": "admin-attacker",
                "correction_reason": "Intento cruzado",
            },
        )

    assert response.status_code == 403
    assert "variable_resolution_id does not belong" in response.json()["detail"]
    update_variable.assert_awaited_once()
    assert update_variable.await_args.kwargs["variable_resolution_id"] == "variable-real"
    assert update_variable.await_args.kwargs["organization_id"] == "org-attacker"
    assert update_variable.await_args.kwargs["project_id"] == "project-attacker"


def test_legal_variable_endpoint_respects_rollout_feature_flag():
    """La API puede apagar el flujo legal completo sin llamar servicios internos."""
    from fastapi.testclient import TestClient

    import api.v1.endpoints.legal_variables as legal_variables_endpoint

    client = TestClient(
        _build_legal_variables_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with (
        patch.object(
            legal_variables_endpoint,
            "get_settings",
            return_value=SimpleNamespace(
                ENABLE_LEGAL_DOCUMENTS=False,
                LEGAL_DOCUMENTS_ORG_ALLOWLIST="",
                LEGAL_DOCUMENTS_PROJECT_ALLOWLIST="",
            ),
        ),
        patch.object(
            legal_variables_endpoint,
            "get_project_variable_inventory_service",
            new=AsyncMock(),
        ) as get_inventory,
    ):
        response = client.get(
            "/api/v1/legal-variables/project/project-real",
            params={"organization_id": "org-real"},
        )

    assert response.status_code == 403
    assert "disabled" in response.json()["detail"]
    get_inventory.assert_not_awaited()


def test_legal_variable_endpoint_respects_project_allowlist():
    """Un proyecto fuera del allowlist no entra al flujo de readiness/extraccion."""
    from fastapi.testclient import TestClient

    import api.v1.endpoints.legal_variables as legal_variables_endpoint

    client = TestClient(
        _build_legal_variables_app(),
        headers={"X-Internal-Secret": "test-secret"},
    )

    with (
        patch.object(
            legal_variables_endpoint,
            "get_settings",
            return_value=SimpleNamespace(
                ENABLE_LEGAL_DOCUMENTS=True,
                LEGAL_DOCUMENTS_ORG_ALLOWLIST="org-real",
                LEGAL_DOCUMENTS_PROJECT_ALLOWLIST="project-enabled",
            ),
        ),
        patch.object(
            legal_variables_endpoint,
            "list_project_legal_documents_service",
            new=AsyncMock(),
        ) as list_documents,
    ):
        response = client.get(
            "/api/v1/legal-documents/project/project-disabled",
            params={"organization_id": "org-real"},
        )

    assert response.status_code == 403
    assert "project" in response.json()["detail"]
    list_documents.assert_not_awaited()

