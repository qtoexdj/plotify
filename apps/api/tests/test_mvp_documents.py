"""MVP foundation fixtures for reservation document variable and generation contracts."""

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


LOT_ID = "lot-mvp-1"
ORG_ID = "org-mvp-1"
TEMPLATE_ID = "template-reserva-1"


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
    from api.deps import verify_internal_secret
    from api.v1.endpoints.documents import router

    app = FastAPI()

    async def bypass_secret():
        return "test"

    app.dependency_overrides[verify_internal_secret] = bypass_secret
    app.include_router(router, prefix="/api/v1")
    client = TestClient(app, headers={"X-Internal-Secret": "test"})

    lot_result = MagicMock(
        data={"id": LOT_ID, "projects": {"organization_id": ORG_ID}}
    )
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = lot_result

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
    }

    with (
        patch("api.v1.endpoints.documents.get_supabase_client", return_value=supabase),
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
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["document_id"] == "generated-doc-1"
    assert body["version_number"] == 2
    assert body["missing_variables_accepted"] is True
