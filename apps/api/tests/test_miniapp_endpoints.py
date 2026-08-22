import time
import pytest
import uuid
import jwt
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from fastapi import status

from main import app
from core.config import get_settings
from core.miniapp_session import create_miniapp_session

# Constantes de prueba
ORG_ID = str(uuid.uuid4())
ADMIN_ID = str(uuid.uuid4())
VENDOR_ID = str(uuid.uuid4())
CHAT_ID = 123456789


@pytest.fixture(autouse=True)
def _isolate_workspace_guard(monkeypatch):
    """Workspace authority has its own contract suite; endpoint tests isolate domain IO."""
    monkeypatch.setattr(
        "core.miniapp_session._revalidate_workspace_authority",
        AsyncMock(return_value=None),
    )


def _obtener_headers_admin() -> dict:
    """Genera headers de autorización con un token JWT de admin válido."""
    token = create_miniapp_session(
        user_id=ADMIN_ID,
        org_id=ORG_ID,
        role="admin",
        chat_id=CHAT_ID
    )
    return {"Authorization": f"Bearer {token}"}


def _obtener_headers_vendedor() -> dict:
    """Genera headers de autorización con un token JWT de vendedor válido (debe dar 403)."""
    token = create_miniapp_session(
        user_id=VENDOR_ID,
        org_id=ORG_ID,
        role="vendor",
        chat_id=CHAT_ID,
        vendor_id=VENDOR_ID,
    )
    return {"Authorization": f"Bearer {token}"}


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_bandeja_vacio(mock_supabase_client):
    """Prueba que si no hay elementos en la base de datos, la bandeja retorne una lista vacía."""
    # Configurar mock de Supabase para retornar listas vacías en las tablas de interés
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    # Mock para approval_requests
    mock_select_approval = MagicMock()
    mock_select_approval.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

    # Mock para escritura_cases
    mock_select_cases = MagicMock()
    mock_select_cases.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

    # Ruteo por nombre de tabla
    def mock_table(table_name):
        if table_name == "approval_requests":
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_select_approval
            return mock_table_obj
        elif table_name == "escritura_cases":
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_select_cases
            return mock_table_obj
        return MagicMock()

    mock_supabase.table.side_effect = mock_table

    client = TestClient(app)
    response = client.get("/api/v1/miniapp/bandeja", headers=_obtener_headers_admin())

    assert response.status_code == 200
    assert response.json() == []


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_bandeja_con_datos(mock_supabase_client):
    """Prueba que la bandeja unifique solicitudes pendientes y casos en excepción de la organización."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    # Datos simulados de solicitudes de aprobación pendientes
    approval_uuid = str(uuid.uuid4())
    approval_data = [
        {
            "id": approval_uuid,
            "request_type": "reservation",
            "vendor_name": "Pedro Vendedor",
            "created_at": "2026-07-09T10:00:00Z",
            "status": "pending",
            "lot_id": str(uuid.uuid4()),
            "lots": {"numero_lote": "45"}
        }
    ]

    # Datos simulados de excepciones de escritura
    case_uuid = str(uuid.uuid4())
    generation_uuid = str(uuid.uuid4())
    cases_data = [
        {
            "id": case_uuid,
            "lot_id": str(uuid.uuid4()),
            "created_at": "2026-07-09T08:00:00Z",
            "status": "exception",
            "lots": {"numero_lote": "12", "projects": {"name": "Lomas de Teno"}},
            "escritura_cascade_runs": [
                {
                    "error_cause": "Falta aprobación de la matriz de proyecto"
                }
            ]
        }
    ]

    # Configuración de los mocks de Supabase
    mock_select_approval = MagicMock()
    mock_select_approval.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=approval_data)

    mock_select_cases = MagicMock()
    mock_select_cases.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=cases_data)

    def mock_table(table_name):
        if table_name == "approval_requests":
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_select_approval
            return mock_table_obj
        elif table_name == "escritura_cases":
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_select_cases
            return mock_table_obj
        return MagicMock()

    mock_supabase.table.side_effect = mock_table

    client = TestClient(app)
    response = client.get("/api/v1/miniapp/bandeja", headers=_obtener_headers_admin())

    assert response.status_code == 200
    res_data = response.json()
    assert len(res_data) == 2

    # Verificar que el item unificado de reserva esté correcto
    reserva_item = next(item for item in res_data if item["tipo"] == "reserva")
    assert reserva_item["id"] == approval_uuid
    assert "Lote 45" in reserva_item["titulo"]
    assert reserva_item["estado"] == "pending"

    # Verificar que el item unificado de excepción esté correcto
    excepcion_item = next(item for item in res_data if item["tipo"] == "excepcion")
    assert excepcion_item["id"] == case_uuid
    assert "Lote 12" in excepcion_item["titulo"]
    assert "Lomas de Teno" in excepcion_item["titulo"]
    assert excepcion_item["estado"] == "exception"
    assert "matriz" in excepcion_item["causa"].lower()


def test_get_bandeja_forbidden_para_vendedor():
    """Prueba que un vendedor reciba 403 Forbidden al intentar ver la bandeja."""
    client = TestClient(app)
    response = client.get("/api/v1/miniapp/bandeja", headers=_obtener_headers_vendedor())
    assert response.status_code == status.HTTP_403_FORBIDDEN


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_bandeja_detail_reserva(mock_supabase_client):
    """Prueba la obtención del detalle para un item de tipo reserva."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    approval_uuid = str(uuid.uuid4())
    approval_detail = {
        "id": approval_uuid,
        "request_type": "reservation",
        "vendor_name": "Pedro Vendedor",
        "created_at": "2026-07-09T10:00:00Z",
        "status": "pending",
        "lot_id": str(uuid.uuid4()),
        "payload": {
            "cliente_nombre": "Maria Diaz",
            "cliente_run": "9.876.543-2",
            "cliente_email": "maria@example.com",
            "cliente_telefono": "+56911223344",
            "valor_reserva": 500000
        },
        "lots": {
            "numero_lote": "45",
            "precio": 15000000,
            "projects": {"name": "Lomas de Teno"}
        }
    }

    mock_select = MagicMock()
    mock_select.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[approval_detail])
    mock_supabase.table.return_value.select.return_value = mock_select

    client = TestClient(app)
    response = client.get(f"/api/v1/miniapp/bandeja/{approval_uuid}?tipo=reserva", headers=_obtener_headers_admin())

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["id"] == approval_uuid
    assert res_data["tipo"] == "reserva"
    assert res_data["comprador"]["nombre"] == "Maria Diaz"
    assert res_data["comprador"]["rut"] == "9.876.543-2"
    assert res_data["detalles_lote"]["numero"] == "45"
    assert res_data["detalles_lote"]["precio"] == 15000000


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_bandeja_detail_excepcion(mock_supabase_client):
    """Prueba la obtención del detalle para un item de tipo excepción de cascada."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    case_uuid = str(uuid.uuid4())
    case_detail = {
        "id": case_uuid,
        "lot_id": str(uuid.uuid4()),
        "created_at": "2026-07-09T08:00:00Z",
        "status": "exception",
        "lots": {
            "numero_lote": "12",
            "precio": 18000000,
            "projects": {"name": "Lomas de Teno"}
        },
        "escritura_cascade_runs": [
            {
                "error_cause": "Conflicto en datos de escrituración",
                "variables_state": {
                    "cliente_nombre": {
                        "vendedor": "Juan Gomez",
                        "certificado": "Juan Gomez Perez",
                        "diferencia": "Nombre no coincide exactamente con certificado de matrimonio"
                    }
                }
            }
        ],
        "escritura_deliveries": [
            {
                "id": str(uuid.uuid4()),
                "file_path": "minutas/lote_12_borrador.pdf"
            }
        ]
    }

    # Simular la llamada del select para el caso de escritura
    mock_select = MagicMock()
    mock_select.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[case_detail])
    mock_supabase.table.return_value.select.return_value = mock_select

    # Simular almacenamiento firmado si existe
    mock_supabase.storage.from_.return_value.create_signed_url.return_value = {
        "signedURL": "https://storage.supabase.com/signed/minutas/lote_12_borrador.pdf"
    }

    client = TestClient(app)
    response = client.get(f"/api/v1/miniapp/bandeja/{case_uuid}?tipo=excepcion", headers=_obtener_headers_admin())

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["id"] == case_uuid
    assert res_data["tipo"] == "excepcion"
    assert len(res_data["conflictos"]) == 1
    assert res_data["conflictos"][0]["nombre"] == "cliente_nombre"
    assert res_data["conflictos"][0]["valor_vendedor"] == "Juan Gomez"
    assert res_data["conflictos"][0]["valor_certificado"] == "Juan Gomez Perez"
    assert res_data["evidence_file_id"] is None


@patch("api.v1.endpoints.miniapp.get_supabase_client")
@patch("api.v1.endpoints.miniapp.process_admin_decision", create=True)
def test_post_bandeja_decidir(mock_process_decision, mock_supabase_client):
    """Prueba que la decisión del admin (approve) invoque la lógica correspondiente."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    approval_uuid = str(uuid.uuid4())
    mock_process_decision.return_value = "SUCCESS"

    # Verificar que el approval request existe
    mock_select = MagicMock()
    mock_select.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[{"id": approval_uuid}])
    mock_supabase.table.return_value.select.return_value = mock_select

    client = TestClient(app)
    response = client.post(
        f"/api/v1/miniapp/bandeja/{approval_uuid}/decidir",
        headers=_obtener_headers_admin(),
        json={"decision": "approve", "comentario": "Aprobado desde la Mini App"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    mock_process_decision.assert_called_once_with(
        ctx={},
        org_id=ORG_ID,
        approval_id=approval_uuid,
        action="approve",
        admin_id=ADMIN_ID,
        channel="miniapp"
    )


@patch("api.v1.endpoints.miniapp.get_supabase_client")
@patch("api.v1.endpoints.miniapp.reintentar_cascada_workflow", create=True)
def test_post_bandeja_reintentar_cascada(mock_reintentar, mock_supabase_client):
    """Prueba que el reintento de cascada invoque el servicio correspondiente."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    case_uuid = str(uuid.uuid4())
    mock_reintentar.return_value = {"status": "processing", "message": "Cascade processing started"}

    # Verificar que el caso de escritura existe
    mock_select = MagicMock()
    mock_select.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[{"id": case_uuid}])
    mock_supabase.table.return_value.select.return_value = mock_select

    client = TestClient(app)
    response = client.post(
        f"/api/v1/miniapp/bandeja/{case_uuid}/reintentar-cascada",
        headers=_obtener_headers_admin()
    )

    assert response.status_code == 200
    assert response.json()["status"] == "processing"
    mock_reintentar.assert_called_once_with(case_id=case_uuid)


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_ventas_vendedor(mock_supabase_client):
    """Prueba que el vendedor pueda listar sus ventas con etapa y blockers humanizados."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    case_uuid = str(uuid.uuid4())
    lot_uuid = str(uuid.uuid4())
    
    # Mock de respuesta para casos de escritura asignados a este vendedor
    mock_select = MagicMock()
    mock_select.eq.return_value = mock_select
    mock_select.in_.return_value = mock_select
    mock_select.order.return_value = mock_select
    mock_select.limit.return_value = mock_select
    mock_select.execute.return_value = MagicMock(
        data=[
            {
                "id": case_uuid,
                "project_id": str(uuid.uuid4()),
                "lot_id": lot_uuid,
                "vendedor_id": VENDOR_ID,
                "status": "in_progress",
                "current_stage": "validacion",
                "blockers": ["missing_buyer_marital_status", "invalid_buyer_rut"],
                "created_at": "2026-07-09T08:00:00Z",
                "projects": {"name": "Lomas de Frutillar"},
                "lots": {"numero_lote": "104"}
            }
        ]
    )
    assignment_select = MagicMock()
    assignment_select.eq.return_value.execute.return_value = MagicMock(
        data=[{"project_id": mock_select.execute.return_value.data[0]["project_id"]}]
    )

    def table_for_ventas(table_name):
        table = MagicMock()
        table.select.return_value = assignment_select if table_name == "vendor_projects" else mock_select
        return table

    mock_supabase.table.side_effect = table_for_ventas

    client = TestClient(app)
    response = client.get(
        "/api/v1/miniapp/ventas",
        headers=_obtener_headers_vendedor()
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == case_uuid
    assert data[0]["etapa"] == "validacion"
    # Verificar humanización de blockers
    assert "Falta definir el estado civil del comprador" in data[0]["blockers_humanizados"]
    assert "El RUT del comprador no es válido" in data[0]["blockers_humanizados"]


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_venta_detalle_vendedor(mock_supabase_client):
    """Prueba la consulta de detalle de una venta específica de un vendedor."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    case_uuid = str(uuid.uuid4())
    lot_uuid = str(uuid.uuid4())

    mock_select = MagicMock()
    mock_select.eq.return_value = mock_select
    mock_select.in_.return_value = mock_select
    mock_select.limit.return_value = mock_select
    mock_select.execute.return_value = MagicMock(
        data=[
            {
                "id": case_uuid,
                "project_id": str(uuid.uuid4()),
                "lot_id": lot_uuid,
                "vendedor_id": VENDOR_ID,
                "status": "in_progress",
                "current_stage": "revision",
                "blockers": ["missing_buyer_signature"],
                "created_at": "2026-07-09T08:00:00Z",
                "projects": {"name": "Lomas de Frutillar"},
                "lots": {"numero_lote": "104"}
            }
        ]
    )
    assignment_select = MagicMock()
    assignment_select.eq.return_value.execute.return_value = MagicMock(
        data=[{"project_id": mock_select.execute.return_value.data[0]["project_id"]}]
    )

    def table_for_venta_detail(table_name):
        table = MagicMock()
        table.select.return_value = assignment_select if table_name == "vendor_projects" else mock_select
        return table

    mock_supabase.table.side_effect = table_for_venta_detail

    client = TestClient(app)
    response = client.get(
        f"/api/v1/miniapp/ventas/{case_uuid}",
        headers=_obtener_headers_vendedor()
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == case_uuid
    assert data["etapa"] == "revision"
    assert "Falta la firma del comprador en la documentación" in data["blockers_humanizados"]


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_documentos_vendedor(mock_supabase_client):
    """Prueba que el vendedor pueda listar las minutas entregadas con enlaces firmados."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    delivery_uuid = str(uuid.uuid4())
    case_uuid = str(uuid.uuid4())
    generation_uuid = str(uuid.uuid4())

    # Datos simulados de entregas de documentos
    mock_select = MagicMock()
    mock_select.eq.return_value = mock_select
    mock_select.order.return_value = mock_select
    mock_select.execute.return_value = MagicMock(
        data=[
            {
                "id": delivery_uuid,
                "escritura_case_id": case_uuid,
                "generation_id": generation_uuid,
                "organization_id": ORG_ID,
                "recipient_user_id": VENDOR_ID,
                "channel": "web",
                "status": "sent",
                "link_expires_at": "2099-07-16T09:00:00+00:00",
                "sent_at": "2026-07-09T09:00:00Z",
                "created_at": "2026-07-09T09:00:00Z",
            }
        ]
    )
    mock_generation_select = MagicMock()
    mock_generation_select.eq.return_value.in_.return_value = mock_generation_select
    mock_generation_select.execute.return_value = MagicMock(
        data=[{"id": generation_uuid, "storage_path": "minutas/minuta_104.pdf"}]
    )
    mock_supabase.table.side_effect = lambda table: (
        MagicMock(select=MagicMock(return_value=mock_select))
        if table == "escritura_deliveries"
        else MagicMock(select=MagicMock(return_value=mock_generation_select))
    )
    mock_supabase.storage.from_("documents").create_signed_url.return_value = {
        "signedURL": "https://supabase.co/signed-url/minuta_104"
    }

    client = TestClient(app)
    response = client.get(
        "/api/v1/miniapp/documentos",
        headers=_obtener_headers_vendedor()
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == delivery_uuid
    assert data[0]["file_id"] == generation_uuid
    assert data[0]["status"] == "sent"


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_renovar_documento_rechaza_entrega_de_otro_destinatario(mock_supabase_client):
    """La renovación reutiliza el scope recipient_user_id + organization_id."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase
    query = MagicMock()
    query.eq.return_value = query
    query.maybe_single.return_value = query
    query.execute.return_value = MagicMock(data=None)
    mock_supabase.table.return_value.select.return_value = query

    response = TestClient(app).post(
        f"/api/v1/miniapp/documentos/{uuid.uuid4()}/renovar",
        headers=_obtener_headers_vendedor(),
    )

    assert response.status_code == 404


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_proyecto_mapa_miniapp(mock_supabase_client):
    """Prueba que se pueda obtener el GeoJSON del mapa del proyecto desde la Mini App."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    project_uuid = str(uuid.uuid4())

    mock_select = MagicMock()
    mock_select.eq.return_value = mock_select
    mock_select.not_.is_.return_value = mock_select
    mock_select.execute.return_value = MagicMock(
        data=[
            {
                "id": str(uuid.uuid4()),
                "project_id": project_uuid,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
                },
                "lots": {
                    "id": str(uuid.uuid4()),
                    "numero_lote": "104",
                    "estado": "disponible"
                }
            }
        ]
    )
    mock_supabase.table.return_value.select.return_value = mock_select

    client = TestClient(app)
    response = client.get(
        f"/api/v1/miniapp/proyectos/{project_uuid}/mapa",
        headers=_obtener_headers_vendedor()
    )

    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == 1
    assert data["features"][0]["properties"]["numero_lote"] == "104"
    assert data["features"][0]["geometry"]["type"] == "Polygon"


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_lote_detalle_miniapp(mock_supabase_client):
    """Prueba que se pueda obtener el detalle técnico de un lote específico desde la Mini App."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    lot_uuid = str(uuid.uuid4())
    project_uuid = str(uuid.uuid4())

    mock_select = MagicMock()
    mock_select.eq.return_value = mock_select
    mock_select.limit.return_value = mock_select
    mock_select.execute.return_value = MagicMock(
        data=[
            {
                "id": lot_uuid,
                "project_id": project_uuid,
                "numero_lote": "104",
                "estado": "disponible",
                "area_official_m2": 5000.0,
                "superficie_neta_m2": None,
                "m2": None,
                "precio": 45000000,
                "boundaries_official": None,
                "projects": {"name": "Lomas de Frutillar", "organization_id": ORG_ID},
                "lot_legal_data": {
                    "sii_definitive_role": "123-45",
                    "sii_pre_role": None,
                    "sii_role_in_process_text": None
                }
              }
        ]
    )
    assignment_query = MagicMock()
    assignment_query.eq.return_value = assignment_query
    assignment_query.limit.return_value = assignment_query
    assignment_query.execute.return_value = MagicMock(data=[{"vendor_id": VENDOR_ID}])

    project_query = MagicMock()
    project_query.eq.return_value = project_query
    project_query.limit.return_value = project_query
    project_query.execute.return_value = MagicMock(data=[{"id": project_uuid}])

    def table(name):
        query = MagicMock()
        if name == "lots":
            query.select.return_value = mock_select
        elif name == "projects":
            query.select.return_value = project_query
        elif name == "vendor_projects":
            query.select.return_value = assignment_query
        return query

    mock_supabase.table.side_effect = table

    client = TestClient(app)
    response = client.get(
        f"/api/v1/miniapp/lotes/{lot_uuid}",
        headers=_obtener_headers_vendedor()
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == lot_uuid
    assert data["numero_lote"] == "104"
    assert data["status"] == "disponible"
    assert data["superficie"] == 5000.0
    assert data["precio"] == 45000000
    assert data["numero_rol"] == "123-45"
    assert data["proyecto_nombre"] == "Lomas de Frutillar"


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_mapa_no_expone_un_proyecto_fuera_de_la_organizacion(mock_supabase_client):
    """Una sesión de Mini App no puede inferir geometrías de otro tenant."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    geometry_query = MagicMock()
    geometry_query.eq.return_value = geometry_query
    geometry_query.not_.is_.return_value = geometry_query
    geometry_query.execute.return_value = MagicMock(data=[{"geometry": {"type": "Polygon"}}])

    project_query = MagicMock()
    project_query.eq.return_value = project_query
    project_query.limit.return_value = project_query
    project_query.execute.return_value = MagicMock(data=[])

    def table(name):
        query = MagicMock()
        if name == "projects":
            query.select.return_value = project_query
        elif name == "geometries":
            query.select.return_value = geometry_query
        return query

    mock_supabase.table.side_effect = table

    client = TestClient(app)
    response = client.get(
        f"/api/v1/miniapp/proyectos/{uuid.uuid4()}/mapa",
        headers=_obtener_headers_admin(),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_sdd019_miniapp_evidence_never_projects_storage_urls_or_paths():
    from pathlib import Path

    source = (
        Path(__file__).resolve().parents[1] / "api/v1/endpoints/miniapp.py"
    ).read_text()
    for forbidden in (
        "create_signed_url",
        "evidencia_url",
        "storage_path",
        "storage_bucket",
        "signedURL",
        "signedUrl",
    ):
        assert forbidden not in source, f"STORAGE_URL_EXPOSED: Mini App contains {forbidden}"


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_proyectos_vendedor_solo_asignados(mock_supabase_client):
    """El vendedor solo ve los proyectos que tiene asignados en vendor_projects."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    project_ids = [str(uuid.uuid4()), str(uuid.uuid4())]

    assignments = MagicMock()
    assignments.eq.return_value = assignments
    assignments.execute.return_value = MagicMock(
        data=[{"project_id": project_ids[0]}]
    )

    projects_query = MagicMock()
    projects_query.eq.return_value = projects_query
    projects_query.in_.return_value = projects_query
    projects_query.execute.return_value = MagicMock(
        data=[{"id": project_ids[0], "name": "Teno 2"}]
    )

    def table(name):
        query = MagicMock()
        if name == "vendor_projects":
            query.select.return_value = assignments
        elif name == "projects":
            query.select.return_value = projects_query
        return query

    mock_supabase.table.side_effect = table

    client = TestClient(app)
    response = client.get("/api/v1/miniapp/proyectos", headers=_obtener_headers_vendedor())

    assert response.status_code == 200
    data = response.json()
    assert data == [{"id": project_ids[0], "name": "Teno 2"}]
    projects_query.in_.assert_called_once_with("id", [project_ids[0]])


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_proyectos_vendedor_sin_asignaciones_retorna_vacio(mock_supabase_client):
    """Un vendedor sin vendor_projects recibe una lista vacía, no un error."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    assignments = MagicMock()
    assignments.eq.return_value = assignments
    assignments.execute.return_value = MagicMock(data=[])

    mock_supabase.table.return_value.select.return_value = assignments

    client = TestClient(app)
    response = client.get("/api/v1/miniapp/proyectos", headers=_obtener_headers_vendedor())

    assert response.status_code == 200
    assert response.json() == []


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_get_proyectos_admin_todos_los_de_la_org(mock_supabase_client):
    """El admin recibe todos los proyectos de su organización sin filtro por asignación."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    project_id = str(uuid.uuid4())

    projects_query = MagicMock()
    projects_query.eq.return_value = projects_query
    projects_query.execute.return_value = MagicMock(
        data=[{"id": project_id, "name": "Lomas de Frutillar"}]
    )

    mock_supabase.table.return_value.select.return_value = projects_query

    client = TestClient(app)
    response = client.get("/api/v1/miniapp/proyectos", headers=_obtener_headers_admin())

    assert response.status_code == 200
    assert response.json() == [{"id": project_id, "name": "Lomas de Frutillar"}]


@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_lote_no_expone_ficha_a_vendedor_sin_proyecto_asignado(mock_supabase_client):
    """Un vendedor solo puede abrir fichas de lotes de proyectos asignados."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    lot_query = MagicMock()
    lot_query.eq.return_value = lot_query
    lot_query.limit.return_value = lot_query
    lot_query.execute.return_value = MagicMock(
        data=[
            {
                "id": str(uuid.uuid4()),
                "project_id": str(uuid.uuid4()),
                "numero_lote": "104",
                "estado": "disponible",
                "projects": {"name": "Proyecto ajeno", "organization_id": ORG_ID},
            }
        ]
    )

    assignment_query = MagicMock()
    assignment_query.eq.return_value = assignment_query
    assignment_query.limit.return_value = assignment_query
    assignment_query.execute.return_value = MagicMock(data=[])

    def table(name):
        query = MagicMock()
        if name == "lots":
            query.select.return_value = lot_query
        elif name == "vendor_projects":
            query.select.return_value = assignment_query
        return query

    mock_supabase.table.side_effect = table

    client = TestClient(app)
    response = client.get(
        f"/api/v1/miniapp/lotes/{uuid.uuid4()}",
        headers=_obtener_headers_vendedor(),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
