"""MVP foundation fixtures for reservation document variable and generation contracts."""

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


LOT_ID = "lot-mvp-1"
ORG_ID = "org-mvp-1"
TEMPLATE_ID = "template-reserva-1"


def _build_documents_app() -> TestClient:
    from api.deps import verify_internal_secret
    from api.v1.endpoints.documents import router

    app = FastAPI()

    async def bypass_secret():
        return "test"

    app.dependency_overrides[verify_internal_secret] = bypass_secret
    app.include_router(router, prefix="/api/v1")
    return TestClient(app, headers={"X-Internal-Secret": "test"})


def _mock_documents_supabase(*, template_org: str = ORG_ID) -> MagicMock:
    lot_result = MagicMock(
        data={"id": LOT_ID, "projects": {"organization_id": ORG_ID}}
    )
    template_result = MagicMock(
        data={"id": TEMPLATE_ID, "organization_id": template_org}
    )
    supabase = MagicMock()

    def table_side_effect(table_name):
        table = MagicMock()
        if table_name == "lots":
            table.select.return_value.eq.return_value.single.return_value.execute.return_value = lot_result
        elif table_name == "document_templates":
            table.select.return_value.eq.return_value.single.return_value.execute.return_value = template_result
        return table

    supabase.table.side_effect = table_side_effect
    return supabase


def test_variable_status_classifies_available_missing_and_sources():
    from api.v1.endpoints.documents import _build_variable_status

    status = _build_variable_status(
        {
            "numero_lote": "24",
            "cliente_nombre": "Comprador Demo",
            "cliente_run": "",
            "servidumbre_m2": 120,
            "cbr_numero_petitorio": None,
            "org_banco": "Banco Estado",
        }
    )

    assert status.variables.lote["numero_lote"] == "24"
    assert status.variables.comprador["cliente_nombre"] == "Comprador Demo"
    assert "comprador.cliente_nombre" in status.available
    assert "comprador.cliente_run" in status.missing
    assert "matriz.cbr_numero_petitorio" in status.missing
    assert status.sources["servidumbre.servidumbre_m2"] == "geometry"
    assert status.sources["matriz.cbr_numero_petitorio"] == "project_legal_data"


async def test_reservation_template_fixture_supports_required_and_optional_variables():
    from services.document_engine import render_template

    lot_result = MagicMock(
        data={
            "id": LOT_ID,
            "numero_lote": "24",
            "precio": 10_000_000,
            "m2": 5000,
            "servidumbre_m2": 0,
            "valor_reserva": 500_000,
            "estado": "reservado",
            "lot_records": {
                "cliente_nombre": "Comprador Demo",
                "cliente_run": "12.345.678-9",
            },
            "projects": {
                "name": "Proyecto Piloto",
                "comuna": "Curico",
                "region": "Maule",
                "organizations": {"id": ORG_ID, "name": "Org Piloto"},
            },
        }
    )
    payment_result = MagicMock(data={})
    blocks_result = MagicMock(
        data=[
            {
                "position": 1,
                "condition_field": None,
                "overrides": None,
                "document_blocks": {
                    "content": "Reserva lote {{ numero_lote }} para {{ cliente_nombre }}",
                },
            },
            {
                "position": 2,
                "condition_field": "servidumbre_m2",
                "overrides": None,
                "document_blocks": {"content": "Servidumbre {{ servidumbre_m2 }}"},
            },
        ]
    )

    supabase = MagicMock()

    def table_side_effect(table_name):
        table = MagicMock()
        if table_name == "lots":
            table.select.return_value.eq.return_value.single.return_value.execute.return_value = lot_result
        elif table_name == "organization_payment_info":
            table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = payment_result
        elif table_name == "template_block_items":
            table.select.return_value.eq.return_value.order.return_value.execute.return_value = blocks_result
        return table

    supabase.table.side_effect = table_side_effect

    with (
        patch("services.document_engine.get_supabase_client", return_value=supabase),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        html = await render_template(TEMPLATE_ID, LOT_ID, ORG_ID)

    assert "Reserva lote 24" in html
    assert "Comprador Demo" in html
    assert "Servidumbre" not in html


def test_generate_endpoint_returns_persisted_document_metadata():
    client = _build_documents_app()
    supabase = _mock_documents_supabase()

    persisted = {
        "id": "generated-doc-1",
        "file_url": "https://storage.example.com/reserva.pdf",
        "file_format": "pdf",
        "document_type": "reserva",
        "version_number": 2,
        "lot_id": LOT_ID,
        "template_id": TEMPLATE_ID,
        "missing_variables_accepted": True,
        "missing_variables": ["matriz.cbr_numero_petitorio"],
        "selected_recipients": ["vendedor", "comprador"],
    }

    with (
        patch("api.v1.endpoints.documents.get_supabase_client", return_value=supabase),
        patch("api.v1.endpoints.documents.resolve_variable_status", new=AsyncMock(return_value={
            "variables": {},
            "available": [],
            "missing": ["matriz.cbr_numero_petitorio"],
            "sources": {},
        })),
        patch("api.v1.endpoints.documents.generate_pdf", new=AsyncMock(return_value=b"%PDF")),
        patch("api.v1.endpoints.documents.persist_document", new=AsyncMock(return_value=persisted)),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        response = client.post(
            "/api/v1/documents/generate",
            json={
                "template_id": TEMPLATE_ID,
                "lot_id": LOT_ID,
                "organization_id": ORG_ID,
                "format": "pdf",
                "missing_variables_accepted": True,
                "selected_recipients": ["vendedor", "comprador"],
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["document_id"] == "generated-doc-1"
    assert body["version_number"] == 2
    assert body["missing_variables_accepted"] is True
    assert body["selected_recipients"] == ["vendedor", "comprador"]


def test_get_variables_endpoint_returns_nested_status():
    client = _build_documents_app()
    supabase = _mock_documents_supabase()

    with (
        patch("api.v1.endpoints.documents.get_supabase_client", return_value=supabase),
        patch("api.v1.endpoints.documents.resolve_variable_status", new=AsyncMock(return_value={
            "variables": {
                "comprador": {"cliente_nombre": "Comprador Demo", "cliente_run": ""},
                "vendedor": {},
                "matriz": {"cbr_numero_petitorio": None},
                "sag": {},
                "lote": {"numero_lote": "24"},
                "servidumbre": {"servidumbre_m2": 120},
                "transaccion": {},
                "mandato": {},
                "personeria": {},
            },
            "available": ["comprador.cliente_nombre"],
            "missing": ["comprador.cliente_run", "matriz.cbr_numero_petitorio"],
            "sources": {
                "servidumbre.servidumbre_m2": "geometry",
                "matriz.cbr_numero_petitorio": "project_legal_data",
            }
        }))
    ):
        response = client.get(
            f"/api/v1/documents/variables/{LOT_ID}?organization_id={ORG_ID}&template_id={TEMPLATE_ID}"
        )

    assert response.status_code == 200
    body = response.json()
    assert "variables" in body
    assert body["variables"]["lote"]["numero_lote"] == "24"
    assert body["variables"]["comprador"]["cliente_nombre"] == "Comprador Demo"
    assert "comprador.cliente_nombre" in body["available"]
    assert "comprador.cliente_run" in body["missing"]
    assert "matriz.cbr_numero_petitorio" in body["missing"]
    assert body["sources"]["servidumbre.servidumbre_m2"] == "geometry"
    assert body["sources"]["matriz.cbr_numero_petitorio"] == "project_legal_data"


def test_generate_endpoint_metadata_verification():
    client = _build_documents_app()
    supabase = _mock_documents_supabase()

    persisted = {
        "id": "generated-doc-2",
        "file_url": "https://storage.example.com/reserva_2.pdf",
        "file_format": "pdf",
        "document_type": "reserva",
        "version_number": 3,
        "lot_id": LOT_ID,
        "template_id": TEMPLATE_ID,
        "missing_variables_accepted": False,
        "missing_variables": [],
        "selected_recipients": ["comprador"],
    }

    with (
        patch("api.v1.endpoints.documents.get_supabase_client", return_value=supabase),
        patch("api.v1.endpoints.documents.resolve_variable_status", new=AsyncMock(return_value={
            "variables": {},
            "available": ["comprador.cliente_nombre"],
            "missing": [],
            "sources": {},
        })),
        patch("api.v1.endpoints.documents.generate_pdf", new=AsyncMock(return_value=b"%PDF")),
        patch("api.v1.endpoints.documents.persist_document", new=AsyncMock(return_value=persisted)),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        response = client.post(
            "/api/v1/documents/generate",
            json={
                "template_id": TEMPLATE_ID,
                "lot_id": LOT_ID,
                "organization_id": ORG_ID,
                "format": "pdf",
                "missing_variables_accepted": False,
                "selected_recipients": ["comprador"],
            },
        )

    assert response.status_code == 200
    body = response.json()

    required_keys = [
        "document_id",
        "version_number",
        "template_id",
        "lot_id",
        "format",
        "file_url",
        "missing_variables_accepted",
        "selected_recipients",
    ]
    for key in required_keys:
        assert key in body, f"Falta la clave requerida: {key}"

    assert body["document_id"] == "generated-doc-2"
    assert body["version_number"] == 3
    assert body["template_id"] == TEMPLATE_ID
    assert body["lot_id"] == LOT_ID
    assert body["format"] == "pdf"
    assert body["file_url"] == "https://storage.example.com/reserva_2.pdf"
    assert body["missing_variables_accepted"] is False
    assert body["selected_recipients"] == ["comprador"]


def test_generate_endpoint_fails_if_metadata_is_missing():
    from api.deps import verify_internal_secret
    from api.v1.endpoints.documents import router

    app = FastAPI()

    async def bypass_secret():
        return "test"

    app.dependency_overrides[verify_internal_secret] = bypass_secret
    app.include_router(router, prefix="/api/v1")
    client = TestClient(
        app, headers={"X-Internal-Secret": "test"}, raise_server_exceptions=False
    )

    supabase = _mock_documents_supabase()

    # Retorno incompleto de persist_document (falta 'version_number')
    incomplete_persisted = {
        "id": "generated-doc-2",
        "file_url": "https://storage.example.com/reserva_2.pdf",
        "file_format": "pdf",
        "document_type": "reserva",
        # "version_number" omitido intencionalmente
        "lot_id": LOT_ID,
        "template_id": TEMPLATE_ID,
        "missing_variables_accepted": False,
    }

    with (
        patch("api.v1.endpoints.documents.get_supabase_client", return_value=supabase),
        patch("api.v1.endpoints.documents.resolve_variable_status", new=AsyncMock(return_value={
            "variables": {},
            "available": [],
            "missing": [],
            "sources": {},
        })),
        patch("api.v1.endpoints.documents.generate_pdf", new=AsyncMock(return_value=b"%PDF")),
        patch("api.v1.endpoints.documents.persist_document", new=AsyncMock(return_value=incomplete_persisted)),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        response = client.post(
            "/api/v1/documents/generate",
            json={
                "template_id": TEMPLATE_ID,
                "lot_id": LOT_ID,
                "organization_id": ORG_ID,
                "format": "pdf",
                "missing_variables_accepted": False,
            },
        )

    # El validador de FastAPI / Pydantic arrojará un error 500 (Internal Server Error)
    # porque la respuesta de persist_document no contiene el campo obligatorio 'version_number'
    # requerido por GenerateResponse
    assert response.status_code == 500


def test_generate_endpoint_rejects_foreign_template():
    client = _build_documents_app()
    supabase = _mock_documents_supabase(template_org="org-foreign")

    with (
        patch("api.v1.endpoints.documents.get_supabase_client", return_value=supabase),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        response = client.post(
            "/api/v1/documents/generate",
            json={
                "template_id": TEMPLATE_ID,
                "lot_id": LOT_ID,
                "organization_id": ORG_ID,
                "format": "pdf",
            },
        )

    assert response.status_code == 403


def test_generate_endpoint_blocks_missing_variables_without_explicit_acceptance():
    client = _build_documents_app()
    supabase = _mock_documents_supabase()

    with (
        patch("api.v1.endpoints.documents.get_supabase_client", return_value=supabase),
        patch("api.v1.endpoints.documents.resolve_variable_status", new=AsyncMock(return_value={
            "variables": {},
            "available": [],
            "missing": ["comprador.cliente_run"],
            "sources": {},
        })),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        response = client.post(
            "/api/v1/documents/generate",
            json={
                "template_id": TEMPLATE_ID,
                "lot_id": LOT_ID,
                "organization_id": ORG_ID,
                "format": "pdf",
                "missing_variables_accepted": False,
            },
        )

    assert response.status_code == 422
    assert "comprador.cliente_run" in str(response.json()["detail"])


async def test_resolve_variables_returns_flat_nested_and_geometry_legal_fields():
    from services.document_engine import resolve_variables

    lot_result = MagicMock(
        data={
            "id": LOT_ID,
            "numero_lote": "24",
            "precio": 10_000_000,
            "m2": 5000,
            "area_official_m2": 5100,
            "perimeter_m": 302,
            "area_ha": 0.51,
            "servidumbre_m2": 120,
            "valor_reserva": 500_000,
            "estado": "reservado",
            "boundaries_official": [{"direction": "north", "text": "Camino"}],
            "legal_deslinde_text": "Norte: Camino.",
            "lot_records": {
                "cliente_nombre": "Comprador Demo",
                "cliente_run": "12.345.678-9",
            },
            "projects": {
                "name": "Proyecto Piloto",
                "organizations": {"id": ORG_ID, "name": "Org Piloto"},
            },
        }
    )
    payment_result = MagicMock(data={})
    lot_legal_result = MagicMock(
        data={
            "sii_unit_name": "Lote 24",
            "sii_role_matrix": "08179-00000",
            "sii_pre_role": "08179-00024",
            "sii_role_in_process_text": "Rol de avaluo en tramite 08179-00024",
            "sii_definitive_role": None,
            "role_status": "rol_en_tramite",
            "matching_status": "matched",
            "matching_score": 1.0,
        }
    )
    supabase = MagicMock()

    def table_side_effect(table_name):
        table = MagicMock()
        if table_name == "lots":
            table.select.return_value.eq.return_value.single.return_value.execute.return_value = lot_result
        elif table_name == "lot_legal_data":
            table.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = lot_legal_result
        elif table_name == "organization_payment_info":
            table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = payment_result
        return table

    supabase.table.side_effect = table_side_effect

    with (
        patch("services.document_engine.get_supabase_client", return_value=supabase),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        variables = await resolve_variables(LOT_ID, ORG_ID)

    assert variables["cliente_nombre"] == "Comprador Demo"
    assert variables["comprador"]["cliente_nombre"] == "Comprador Demo"
    assert variables["lote"]["superficie_total"] == 5100
    assert variables["lote"]["lote_deslindes"] == "Norte: Camino."
    assert variables["lote"]["perimetro_m"] == 302
    assert variables["lote"]["superficie_hectareas"] == 0.51
    assert variables["sii"]["pre_rol_lote"] == "08179-00024"
    assert variables["lote"]["rol_tramite"] == "08179-00024"


async def test_resolve_variables_does_not_feed_ambiguous_sii_roles_to_templates():
    from services.document_engine import resolve_variables

    lot_result = MagicMock(
        data={
            "id": LOT_ID,
            "numero_lote": "24",
            "projects": {
                "id": "project-1",
                "name": "Proyecto Piloto",
                "organizations": {"id": ORG_ID, "name": "Org Piloto"},
            },
        }
    )
    project_legal_result = MagicMock(data={})
    lot_legal_result = MagicMock(
        data={
            "sii_unit_name": "Unidad 24 / Lote 42",
            "sii_pre_role": "08179-00024",
            "role_status": "rol_en_tramite",
            "matching_status": "ambiguous",
        }
    )
    payment_result = MagicMock(data={})
    supabase = MagicMock()

    def table_side_effect(table_name):
        table = MagicMock()
        if table_name == "lots":
            table.select.return_value.eq.return_value.single.return_value.execute.return_value = lot_result
        elif table_name == "project_legal_data":
            table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = project_legal_result
        elif table_name == "lot_legal_data":
            table.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = lot_legal_result
        elif table_name == "organization_payment_info":
            table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = payment_result
        return table

    supabase.table.side_effect = table_side_effect

    with (
        patch("services.document_engine.get_supabase_client", return_value=supabase),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        variables = await resolve_variables(LOT_ID, ORG_ID)

    assert variables["sii_pre_rol_lote"] == ""
    assert variables["sii"]["pre_rol_lote"] == ""
    assert variables["lote"]["rol_tramite"] == ""


async def test_document_delivery_failure_records_status_without_regeneration():
    from workers.tasks.notification_worker import send_generated_document

    update_payload = {}
    document_result = MagicMock(
        data=[
            {
                "id": "generated-doc-1",
                "organization_id": ORG_ID,
                "lot_id": LOT_ID,
                "template_id": TEMPLATE_ID,
                "file_url": "https://storage.example.com/reserva.pdf",
                "file_format": "pdf",
                "selected_recipients": ["comprador"],
                "delivery_failed_attempts": 0,
            }
        ]
    )
    supabase = MagicMock()
    doc_table = MagicMock()
    doc_table.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = document_result

    def capture_update(payload):
        update_payload.update(payload)
        update_query = MagicMock()
        update_query.eq.return_value.execute.return_value = MagicMock(data=[])
        return update_query

    doc_table.update.side_effect = capture_update
    supabase.table.return_value = doc_table

    with (
        patch("workers.tasks.notification_worker.get_supabase_client", return_value=supabase),
        patch("workers.tasks.notification_worker.log_agent_action", new=AsyncMock()),
    ):
        result = await send_generated_document(
            {},
            {
                "document_id": "generated-doc-1",
                "organization_id": ORG_ID,
                "force_error": "SMTP timeout",
            },
        )

    assert result == "FAILED"
    assert update_payload["delivery_status"] == "failed"
    assert update_payload["delivery_failed_attempts"] == 1
    assert update_payload["delivery_error_message"] == "SMTP timeout"


async def test_document_delivery_retry_marks_existing_document_sent():
    from workers.tasks.notification_worker import retry_generated_document_delivery

    update_payload = {}
    document_result = MagicMock(
        data=[
            {
                "id": "generated-doc-1",
                "organization_id": ORG_ID,
                "lot_id": LOT_ID,
                "template_id": TEMPLATE_ID,
                "file_url": "https://storage.example.com/reserva.pdf",
                "file_format": "pdf",
                "selected_recipients": ["vendedor", "comprador"],
                "delivery_failed_attempts": 1,
            }
        ]
    )
    supabase = MagicMock()
    doc_table = MagicMock()
    doc_table.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = document_result

    def capture_update(payload):
        update_payload.update(payload)
        update_query = MagicMock()
        update_query.eq.return_value.execute.return_value = MagicMock(data=[])
        return update_query

    doc_table.update.side_effect = capture_update
    supabase.table.return_value = doc_table

    with (
        patch("workers.tasks.notification_worker.get_supabase_client", return_value=supabase),
        patch("workers.tasks.notification_worker.log_agent_action", new=AsyncMock()),
    ):
        result = await retry_generated_document_delivery(
            {}, {"document_id": "generated-doc-1", "organization_id": ORG_ID}
        )

    assert result == "SENT"
    assert update_payload["delivery_status"] == "sent"
    assert update_payload["delivery_error_message"] is None


# ==============================================================================
# Phase 12 Regression Tests: Matriz/Lote Source Of Truth Alignment
# ==============================================================================

import pytest


@pytest.mark.asyncio
async def test_resolve_variables_consumes_project_legal_data_for_matriz_and_lot_legal_data_for_lot():
    """T098: Verify that resolve_variables consumes project_legal_data for matriz values and lot_legal_data for lot values."""
    from services.document_engine import resolve_variables

    lot_result = MagicMock(
        data={
            "id": LOT_ID,
            "numero_lote": "24",
            "projects": {
                "id": "project-1",
                "name": "Proyecto Piloto",
                "organizations": {"id": ORG_ID, "name": "Org Piloto"},
            },
        }
    )
    # Matriz/common values live in project_legal_data under Phase 12 design
    project_legal_result = MagicMock(
        data={
            "sii_comuna": "Teno",
            "sii_role_matrix": "08179-00000",
            "sii_roles_status": "variables_proposed",
        }
    )
    # Lot-specific role values live in lot_legal_data
    lot_legal_result = MagicMock(
        data={
            "lot_id": LOT_ID,
            "sii_pre_role": "08179-00024",
            "sii_definitive_role": None,
            "role_status": "rol_en_tramite",
            "matching_status": "matched",
        }
    )
    payment_result = MagicMock(data={})
    supabase = MagicMock()

    def table_side_effect(table_name):
        table = MagicMock()
        if table_name == "lots":
            table.select.return_value.eq.return_value.single.return_value.execute.return_value = lot_result
        elif table_name == "project_legal_data":
            table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = project_legal_result
        elif table_name == "lot_legal_data":
            table.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = lot_legal_result
        elif table_name == "organization_payment_info":
            table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = payment_result
        return table

    supabase.table.side_effect = table_side_effect

    with (
        patch("services.document_engine.get_supabase_client", return_value=supabase),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        variables = await resolve_variables(LOT_ID, ORG_ID)

    # Common matriz values are resolved from project_legal_data
    assert variables["sii"]["comuna"] == "Teno"
    assert variables["sii"]["rol_matriz"] == "08179-00000"

    # Lot-specific values are resolved from lot_legal_data
    assert variables["sii"]["pre_rol_lote"] == "08179-00024"
    assert variables["lote"]["rol_tramite"] == "08179-00024"

