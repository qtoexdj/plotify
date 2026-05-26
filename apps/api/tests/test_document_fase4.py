"""
Tests unitarios para FASE 4 — Orquestador de Documentos.

Valida:
  - resolve_variables: mapeo correcto de campos lot/lot_record/project/org/payment
  - render_template: condiciones Jinja2 (servidumbre), orden de bloques, overrides
  - generate_pdf: retorna bytes de PDF válidos
  - generate_docx: retorna bytes de DOCX válidos
  - persist_document: llama a Storage.upload + generated_documents.insert
  - Endpoint POST /documents/preview: retorna HTML
  - Endpoint POST /documents/generate: retorna file_url

Todos los tests usan mocks — no requieren Supabase ni Redis activo.
asyncio_mode = auto (pytest.ini) — no se necesita @pytest.mark.asyncio
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

LOT_ID = "lot-uuid-1234"
ORG_ID = "org-uuid-5678"
TEMPLATE_ID = "tmpl-uuid-9999"

# Datos falsos que simularían la respuesta de Supabase
FAKE_LOT = {
    "id": LOT_ID,
    "numero_lote": "42",
    "precio": 15000000,
    "m2": 5000,
    "area_official_m2": 5133.3,
    "superficie_neta_m2": 4982.6,
    "servidumbre_m2": 150.7,
    "servidumbre_ancho_m": 5.0,
    "valor_reserva": 500000,
    "estado": "reservado",
    "lot_records": {
        "lot_id": LOT_ID,
        "cliente_nombre": "Juan Pérez González",
        "cliente_run": "12.345.678-9",
        "cliente_run_normalizado": "123456789",
        "cliente_direccion": "Av. Siempre Viva 742, Santiago",
        "cliente_estado_civil": "soltero",
        "cliente_ocupacion": "ingeniero",
        "cliente_email": "juan@example.com",
        "cliente_telefono": "+56912345678",
        "valor": 15000000,
        "abono": 500000,
        "saldo": 14500000,
        "firma_fecha": "2026-04-01",
        "firma_lugar": "Santiago",
        "firma_estado": "pendiente",
        "etapa_proceso": "reserva",
        "cbr_estado": None,
        "cbr_numero_petitorio": None,
        "cbr_fecha_salida_estimada": None,
    },
    "projects": {
        "id": "proj-uuid",
        "name": "Parcelación Los Álamos",
        "comuna": "Curicó",
        "region": "Maule",
        "organizations": {
            "id": ORG_ID,
            "name": "Inmobiliaria Ejemplo SpA",
        },
    },
}

FAKE_PAYMENT = {
    "organization_id": ORG_ID,
    "rut": "76.543.210-K",
    "banco": "Banco Estado",
    "numero_cuenta": "123456789",
    "tipo_cuenta": "Corriente",
    "email_transferencia": "pagos@ejemplo.cl",
}

FAKE_BLOCKS = [
    {
        "position": 1,
        "is_optional": False,
        "condition_field": None,
        "overrides": None,
        "document_blocks": {
            "id": "blk-1",
            "name": "Encabezado",
            "content": "<h1>Contrato Lote {{ numero_lote }}</h1>",
        },
    },
    {
        "position": 2,
        "is_optional": True,
        "condition_field": "servidumbre_m2",
        "overrides": None,
        "document_blocks": {
            "id": "blk-2",
            "name": "Servidumbre",
            "content": "<p>Servidumbre: {{ servidumbre_m2 }} m²</p>",
        },
    },
    {
        "position": 3,
        "is_optional": False,
        "condition_field": None,
        "overrides": {"cliente_nombre": "OVERRIDE_NOMBRE"},
        "document_blocks": {
            "id": "blk-3",
            "name": "Firma",
            "content": "<p>Firma: {{ cliente_nombre }}</p>",
        },
    },
]


def _make_supabase_mock(
    lot_data=FAKE_LOT, payment_data=FAKE_PAYMENT, blocks_data=FAKE_BLOCKS
):
    """Construye un mock de get_supabase_client() con las respuestas requeridas."""
    mock_result_lot = MagicMock()
    mock_result_lot.data = lot_data

    mock_result_payment = MagicMock()
    mock_result_payment.data = payment_data

    mock_result_blocks = MagicMock()
    mock_result_blocks.data = blocks_data

    supabase = MagicMock()

    # Mock estable para generated_documents (no se recrea en cada llamada a .table())
    gen_doc_tbl = MagicMock()
    latest_version_result = MagicMock()
    latest_version_result.data = []
    gen_doc_tbl.select.return_value.eq.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = latest_version_result
    gen_doc_insert = MagicMock()
    gen_doc_insert.execute.return_value = MagicMock(
        data=[
            {
                "id": "gen-doc-1",
                "file_url": "https://storage.example.com/test.pdf",
                "file_format": "pdf",
                "document_type": "generated",
                "version_number": 1,
                "lot_id": LOT_ID,
                "template_id": TEMPLATE_ID,
                "missing_variables_accepted": False,
                "missing_variables": [],
            }
        ]
    )
    gen_doc_tbl.insert.return_value = gen_doc_insert

    def table_side_effect(table_name):
        if table_name == "generated_documents":
            return gen_doc_tbl
        tbl = MagicMock()
        if table_name == "lots":
            tbl.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_result_lot
        elif table_name == "organization_payment_info":
            tbl.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = mock_result_payment
        elif table_name == "template_block_items":
            tbl.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_result_blocks
        return tbl

    supabase.table.side_effect = table_side_effect
    # Expuesto para assertions en TestPersistDocument
    supabase._gen_doc_tbl = gen_doc_tbl

    # Storage mock
    storage_bucket = MagicMock()
    storage_bucket.upload.return_value = MagicMock()
    storage_bucket.create_signed_url.return_value = {
        "signedURL": "https://storage.example.com/test.pdf"
    }
    supabase.storage.from_.return_value = storage_bucket

    return supabase


# ---------------------------------------------------------------------------
# Tests: resolve_variables
# ---------------------------------------------------------------------------


class TestResolveVariables:
    async def test_mapeo_campos_basicos(self):
        """Verifica que resolve_variables retorna todos los campos esperados."""
        supabase_mock = _make_supabase_mock()

        with (
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_engine import resolve_variables

            variables = await resolve_variables(LOT_ID, ORG_ID)

        # Lote
        assert variables["numero_lote"] == "42"
        assert variables["precio"] == 15000000
        assert variables["m2"] == 5000
        assert variables["servidumbre_m2"] == 150.7
        assert variables["valor_reserva"] == 500000
        assert variables["estado"] == "reservado"

        # Cliente
        assert variables["cliente_nombre"] == "Juan Pérez González"
        assert variables["cliente_run"] == "12.345.678-9"
        assert variables["cliente_estado_civil"] == "soltero"
        assert variables["saldo"] == 14500000

        # Proyecto
        assert variables["proyecto_nombre"] == "Parcelación Los Álamos"
        assert variables["proyecto_comuna"] == "Curicó"

        # Org
        assert variables["org_nombre"] == "Inmobiliaria Ejemplo SpA"
        assert variables["org_rut"] == "76.543.210-K"
        assert variables["org_banco"] == "Banco Estado"

    async def test_leve_not_found_lanza_valueerror(self):
        """resolve_variables debe lanzar ValueError si el lote no existe."""
        mock_result = MagicMock()
        mock_result.data = None

        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_result

        with (
            patch(
                "api.v1.endpoints.documents.get_supabase_client",
                return_value=supabase,
            ),
            patch(
                "services.document_engine.get_supabase_client", return_value=supabase
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_engine import resolve_variables

            with pytest.raises(ValueError, match="not found"):
                await resolve_variables("nonexistent-id", ORG_ID)

    async def test_payment_faltante_no_falla(self):
        """Si no hay organization_payment_info, los campos de pago quedan vacíos."""
        mock_lot = MagicMock()
        mock_lot.data = FAKE_LOT

        mock_payment = MagicMock()
        mock_payment.data = None  # Sin datos de pago

        supabase = MagicMock()

        def table_side(table_name):
            tbl = MagicMock()
            if table_name == "lots":
                tbl.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_lot
            elif table_name == "organization_payment_info":
                tbl.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = mock_payment
            return tbl

        supabase.table.side_effect = table_side

        with (
            patch(
                "api.v1.endpoints.documents.get_supabase_client",
                return_value=supabase,
            ),
            patch(
                "services.document_engine.get_supabase_client", return_value=supabase
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_engine import resolve_variables

            variables = await resolve_variables(LOT_ID, ORG_ID)

        assert variables["org_banco"] == ""
        assert variables["org_cuenta"] == ""


# ---------------------------------------------------------------------------
# Tests: render_template
# ---------------------------------------------------------------------------


class TestRenderTemplate:
    async def test_renderiza_html_con_variables(self):
        """El bloque Jinja2 recibe variables y las sustituye correctamente."""
        supabase_mock = _make_supabase_mock()

        with (
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_engine import render_template

            html = await render_template(TEMPLATE_ID, LOT_ID, ORG_ID)

        # Bloque 1: número de lote
        assert "42" in html
        assert "<h1>" in html

    async def test_bloque_condicional_incluido_cuando_servidumbre_existe(self):
        """Bloque con condition_field='servidumbre_m2' debe incluirse si servidumbre_m2 > 0."""
        supabase_mock = _make_supabase_mock()

        with (
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_engine import render_template

            html = await render_template(TEMPLATE_ID, LOT_ID, ORG_ID)

        assert "150.7" in html  # servidumbre_m2

    async def test_bloque_condicional_omitido_cuando_servidumbre_es_cero(self):
        """Bloque con condition_field='servidumbre_m2' se omite si servidumbre_m2 == 0."""
        lot_sin_servidumbre = {**FAKE_LOT, "servidumbre_m2": 0}
        supabase_mock = _make_supabase_mock(lot_data=lot_sin_servidumbre)

        with (
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_engine import render_template

            html = await render_template(TEMPLATE_ID, LOT_ID, ORG_ID)

        assert "Servidumbre:" not in html

    async def test_overrides_sobreescriben_variable(self):
        """El bloque 3 tiene override cliente_nombre='OVERRIDE_NOMBRE', debe usarlo."""
        supabase_mock = _make_supabase_mock()

        with (
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_engine import render_template

            html = await render_template(TEMPLATE_ID, LOT_ID, ORG_ID)

        assert "OVERRIDE_NOMBRE" in html


# ---------------------------------------------------------------------------
# Tests: generate_pdf / generate_docx
# ---------------------------------------------------------------------------


class TestGenerators:
    async def test_generate_pdf_retorna_bytes_no_vacios(self):
        """generate_pdf debe retornar bytes (PDF real de WeasyPrint)."""
        supabase_mock = _make_supabase_mock()

        with (
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_generator import generate_pdf

            pdf_bytes = await generate_pdf(TEMPLATE_ID, LOT_ID, ORG_ID)

        assert isinstance(pdf_bytes, bytes)
        assert len(pdf_bytes) > 0
        # Los PDFs empiezan con %PDF
        assert pdf_bytes[:4] == b"%PDF"

    async def test_generate_docx_retorna_bytes_no_vacios(self):
        """generate_docx debe retornar bytes de un archivo DOCX válido (ZIP)."""
        supabase_mock = _make_supabase_mock()

        with (
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_generator import generate_docx

            docx_bytes = await generate_docx(TEMPLATE_ID, LOT_ID, ORG_ID)

        assert isinstance(docx_bytes, bytes)
        assert len(docx_bytes) > 0
        # Los DOCX son ZIP que empiezan con PK
        assert docx_bytes[:2] == b"PK"


# ---------------------------------------------------------------------------
# Tests: persist_document
# ---------------------------------------------------------------------------


class TestPersistDocument:
    async def test_persist_llama_storage_upload_e_insert(self):
        """persist_document debe subir a Storage y registrar en generated_documents."""
        supabase_mock = _make_supabase_mock()

        with (
            patch(
                "services.document_generator.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_generator import persist_document

            document = await persist_document(
                file_bytes=b"%PDF-1.4 fake",
                file_format="pdf",
                template_id=TEMPLATE_ID,
                lot_id=LOT_ID,
                organization_id=ORG_ID,
            )

        assert document["file_url"] == "https://storage.example.com/test.pdf"
        assert document["id"] == "gen-doc-1"
        supabase_mock.storage.from_.assert_called_with("documents")
        supabase_mock.storage.from_().upload.assert_called_once()
        supabase_mock._gen_doc_tbl.insert.assert_called_once()

    async def test_persist_snapshot_incluye_variables_del_lote(self):
        """El insert en generated_documents debe incluir variables_snapshot con datos reales."""
        captured_payload = {}

        supabase_mock = _make_supabase_mock()

        def capture_insert(payload):
            captured_payload.update(payload)
            insert_mock = MagicMock()
            insert_mock.execute.return_value = MagicMock(data=[{"id": "gen-doc-1"}])
            return insert_mock

        # El mock estable expuesto en _gen_doc_tbl es el que usa persist_document
        supabase_mock._gen_doc_tbl.insert.side_effect = capture_insert

        with (
            patch(
                "services.document_generator.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_generator import persist_document

            await persist_document(
                file_bytes=b"%PDF-1.4 fake",
                file_format="pdf",
                template_id=TEMPLATE_ID,
                lot_id=LOT_ID,
                organization_id=ORG_ID,
                generated_by="user-uuid-abc",
            )

        assert "variables_snapshot" in captured_payload
        snapshot = captured_payload["variables_snapshot"]
        assert snapshot["numero_lote"] == "42"
        assert snapshot["cliente_nombre"] == "Juan Pérez González"
        assert captured_payload["generated_by"] == "user-uuid-abc"

    async def test_persist_calcula_version_siguiente_por_lote_template_tipo(self):
        """La regeneración debe incrementar version_number sin sobrescribir documentos previos."""
        captured_payload = {}
        supabase_mock = _make_supabase_mock()
        supabase_mock._gen_doc_tbl.select.return_value.eq.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"version_number": 3}]
        )

        def capture_insert(payload):
            captured_payload.update(payload)
            insert_mock = MagicMock()
            insert_mock.execute.return_value = MagicMock(
                data=[{"id": "gen-doc-4", **payload}]
            )
            return insert_mock

        supabase_mock._gen_doc_tbl.insert.side_effect = capture_insert

        with (
            patch(
                "services.document_generator.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from services.document_generator import persist_document

            document = await persist_document(
                file_bytes=b"%PDF-1.4 fake",
                file_format="pdf",
                template_id=TEMPLATE_ID,
                lot_id=LOT_ID,
                organization_id=ORG_ID,
                document_type="reserva",
            )

        assert captured_payload["version_number"] == 4
        assert document["version_number"] == 4
        assert document["document_type"] == "reserva"


# ---------------------------------------------------------------------------
# Tests: API endpoint /documents/preview y /generate
# ---------------------------------------------------------------------------


# App minimal para tests de integración — evita importar main.py
# (importar main activa lifespan events y settings reales que pueden romper el setup)
def _build_test_app(authenticated: bool = True):
    """
    Crea una app FastAPI mínima con el router de documentos.

    authenticated=True: el header X-Internal-Secret es aceptado sin validar.
    authenticated=False: se usa la dependencia real (para test de 403).
    """
    from fastapi import FastAPI
    from api.v1.endpoints.documents import router as docs_router
    from api.deps import verify_internal_secret

    app = FastAPI()

    if authenticated:

        async def _bypass_auth():
            return "test-secret"

        app.dependency_overrides[verify_internal_secret] = _bypass_auth

    else:
        # Mockear settings para que el secret esperado sea "real-secret"
        # y enviar sin header → 403
        mock_s = MagicMock()
        mock_s.INTERNAL_API_SECRET = "real-secret"

        def _override_settings():
            return mock_s

        with patch("core.config.get_settings", side_effect=_override_settings):
            pass  # pre-registro sólo para ilustrar; la dependencia real lee get_settings() en ejecución

    app.include_router(docs_router, prefix="/api/v1")
    return app


class TestDocumentsAPI:
    @pytest.fixture
    def client(self):
        """Cliente de FastAPI con dependencia de auth sobreescrita."""
        from fastapi.testclient import TestClient

        return TestClient(
            _build_test_app(authenticated=True),
            headers={"X-Internal-Secret": "test-secret"},
        )

    def test_preview_retorna_html(self, client):
        """POST /api/v1/documents/preview debe retornar {"html": "..."}."""
        supabase_mock = _make_supabase_mock()

        with (
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "services.document_generator.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "api.v1.endpoints.documents.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            response = client.post(
                "/api/v1/documents/preview",
                json={
                    "template_id": TEMPLATE_ID,
                    "lot_id": LOT_ID,
                    "organization_id": ORG_ID,
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert "html" in data
        assert "42" in data["html"]

    def test_preview_404_si_template_sin_bloques(self, client):
        """POST /api/v1/documents/preview debe retornar 404 si template no tiene bloques."""
        mock_result_lot = MagicMock()
        mock_result_lot.data = FAKE_LOT
        mock_result_payment = MagicMock()
        mock_result_payment.data = FAKE_PAYMENT
        mock_result_blocks = MagicMock()
        mock_result_blocks.data = []  # sin bloques

        supabase = MagicMock()

        def table_side(table_name):
            tbl = MagicMock()
            if table_name == "lots":
                tbl.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_result_lot
            elif table_name == "organization_payment_info":
                tbl.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = mock_result_payment
            elif table_name == "template_block_items":
                tbl.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_result_blocks
            return tbl

        supabase.table.side_effect = table_side

        with (
            patch(
                "api.v1.endpoints.documents.get_supabase_client",
                return_value=supabase,
            ),
            patch(
                "services.document_engine.get_supabase_client", return_value=supabase
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            response = client.post(
                "/api/v1/documents/preview",
                json={
                    "template_id": TEMPLATE_ID,
                    "lot_id": LOT_ID,
                    "organization_id": ORG_ID,
                },
            )

        assert response.status_code == 404

    def test_preview_403_si_organization_id_no_corresponde_al_lote(self, client):
        """POST /api/v1/documents/preview debe rechazar tenant cruzado."""
        supabase_mock = _make_supabase_mock()

        with (
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "api.v1.endpoints.documents.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            response = client.post(
                "/api/v1/documents/preview",
                json={
                    "template_id": TEMPLATE_ID,
                    "lot_id": LOT_ID,
                    "organization_id": "org-uuid-cross-tenant",
                },
            )

        assert response.status_code == 403

    def test_generate_pdf_retorna_file_url(self, client):
        """POST /api/v1/documents/generate con format=pdf debe retornar file_url."""
        supabase_mock = _make_supabase_mock()

        with (
            patch(
                "services.document_engine.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "services.document_generator.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "api.v1.endpoints.documents.get_supabase_client",
                return_value=supabase_mock,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
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

        assert response.status_code == 200
        data = response.json()
        assert "file_url" in data
        assert data["format"] == "pdf"
        assert data["document_id"] == "gen-doc-1"
        assert data["version_number"] == 1

    def test_generate_formato_invalido_retorna_422(self, client):
        """POST /api/v1/documents/generate con format inválido debe retornar 422."""
        response = client.post(
            "/api/v1/documents/generate",
            json={
                "template_id": TEMPLATE_ID,
                "lot_id": LOT_ID,
                "organization_id": ORG_ID,
                "format": "exe",
            },
        )
        assert response.status_code == 422

    def test_sin_secret_retorna_403(self):
        """Endpoints sin X-Internal-Secret deben retornar 403."""
        from fastapi.testclient import TestClient

        # App sin override → usa verify_internal_secret real
        from fastapi import FastAPI
        from api.v1.endpoints.documents import router as docs_router

        unauth_app = FastAPI()
        unauth_app.include_router(docs_router, prefix="/api/v1")

        mock_s = MagicMock()
        mock_s.INTERNAL_API_SECRET = "super-secret-that-no-one-knows"

        with patch("core.config.get_settings", return_value=mock_s):
            client_no_auth = TestClient(unauth_app)
            response = client_no_auth.post(
                "/api/v1/documents/preview",
                json={
                    "template_id": TEMPLATE_ID,
                    "lot_id": LOT_ID,
                    "organization_id": ORG_ID,
                },
            )
        assert response.status_code == 403
