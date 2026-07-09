import pytest
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from fastapi import status

from main import app
from core.miniapp_session import create_miniapp_session
from core.redis import get_arq_pool

# Constantes de prueba
ORG_ID = str(uuid.uuid4())
VENDOR_ID = str(uuid.uuid4())
CHAT_ID = 123456789
LOT_ID = str(uuid.uuid4())

def _obtener_headers_vendedor() -> dict:
    """Genera headers de autorización con un token JWT de vendedor válido."""
    token = create_miniapp_session(
        user_id=VENDOR_ID,
        org_id=ORG_ID,
        role="vendor",
        chat_id=CHAT_ID
    )
    return {
        "Authorization": f"Bearer {token}",
        "X-Idempotency-Key": str(uuid.uuid4())
    }

@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_crear_reserva_exito(mock_supabase_client):
    """Prueba que un vendedor pueda enviar una solicitud de reserva para un lote disponible."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    # Mock del pool de Redis/arq. Depends(get_arq_pool) captura la función real al
    # registrar la ruta, así que @patch no la intercepta: hay que usar dependency_overrides.
    mock_redis = MagicMock()
    mock_redis.enqueue_job = AsyncMock()
    app.dependency_overrides[get_arq_pool] = lambda: mock_redis

    # 1. Mock de búsqueda de lote disponible
    lot_data = {
        "id": LOT_ID,
        "estado": "disponible",
        "numero_lote": "104",
        "project_id": str(uuid.uuid4()),
        "precio": 45000000,
        "valor_reserva": 500000,
        "projects": {"organization_id": ORG_ID}
    }
    mock_lot_select = MagicMock()
    mock_lot_select.eq.return_value = mock_lot_select
    mock_lot_select.limit.return_value = mock_lot_select
    mock_lot_select.execute.return_value = MagicMock(data=[lot_data])
    # require_lot_organization() consulta con .single() para derivar el tenant del lote
    mock_lot_select.single.return_value.execute.return_value = MagicMock(data=lot_data)

    # 2. Mock de asignación del vendedor al proyecto (vendor_projects)
    mock_vp_select = MagicMock()
    mock_vp_select.eq.return_value = mock_vp_select
    mock_vp_select.limit.return_value = mock_vp_select
    mock_vp_select.execute.return_value = MagicMock(
        data=[{"vendor_id": VENDOR_ID}]
    )

    # 3. Mock de validación de que no hay reservas pendientes (approval_requests)
    mock_pending_select = MagicMock()
    mock_pending_select.eq.return_value = mock_pending_select
    mock_pending_select.limit.return_value = mock_pending_select
    mock_pending_select.execute.return_value = MagicMock(data=[])

    # 4. Mock de inserción en approval_requests
    approval_id = str(uuid.uuid4())
    mock_insert = MagicMock()
    mock_insert.execute.return_value = MagicMock(
        data=[{"id": approval_id}]
    )

    def mock_table(table_name):
        if table_name == "lots":
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_lot_select
            return mock_table_obj
        elif table_name == "vendor_projects":
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_vp_select
            return mock_table_obj
        elif table_name == "approval_requests":
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_pending_select
            mock_table_obj.insert.return_value = mock_insert
            return mock_table_obj
        return MagicMock()

    mock_supabase.table.side_effect = mock_table

    try:
        client = TestClient(app)
        payload = {
            "lot_id": LOT_ID,
            "buyer_name": "Juan Pérez",
            "buyer_rut": "12.345.678-9",
            "buyer_email": "juan@perez.cl",
            "buyer_phone": "+56912345678",
            "payment_method": "transfer",
            "payment_evidence_url": "https://bucket.supabase.co/minutas/evidencia.pdf",
            "observation": "Reserva inicial desde visor mini app"
        }

        response = client.post(
            "/api/v1/miniapp/reservas",
            json=payload,
            headers=_obtener_headers_vendedor()
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["approval_id"] == approval_id
        assert data["status"] == "pending"
        mock_redis.enqueue_job.assert_called_once_with("notify_admin_approval", approval_id)
    finally:
        app.dependency_overrides.pop(get_arq_pool, None)

@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_crear_reserva_lote_no_disponible(mock_supabase_client):
    """Prueba que falle la reserva si el lote ya está reservado o vendido."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase

    lot_data = {
        "id": LOT_ID,
        "estado": "reservado",
        "numero_lote": "104",
        "project_id": str(uuid.uuid4()),
        "precio": 45000000,
        "valor_reserva": 500000,
        "projects": {"organization_id": ORG_ID}
    }
    mock_lot_select = MagicMock()
    mock_lot_select.eq.return_value = mock_lot_select
    mock_lot_select.limit.return_value = mock_lot_select
    mock_lot_select.execute.return_value = MagicMock(data=[lot_data])
    # require_lot_organization() consulta con .single() para derivar el tenant del lote
    mock_lot_select.single.return_value.execute.return_value = MagicMock(data=lot_data)

    mock_supabase.table.return_value.select.return_value = mock_lot_select

    client = TestClient(app)
    payload = {
        "lot_id": LOT_ID,
        "buyer_name": "Juan Pérez",
        "buyer_rut": "12.345.678-9",
        "buyer_email": "juan@perez.cl",
        "buyer_phone": "+56912345678",
        "payment_method": "transfer",
        "payment_evidence_url": "https://bucket.supabase.co/minutas/evidencia.pdf"
    }

    response = client.post(
        "/api/v1/miniapp/reservas",
        json=payload,
        headers=_obtener_headers_vendedor()
    )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert "El lote no está disponible" in response.json()["detail"]

@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_crear_reserva_datos_invalidos(mock_supabase_client):
    """Prueba que el backend valide el esquema y retorne 422 para datos mal formateados."""
    client = TestClient(app)
    
    # 1. Teléfono inválido
    payload = {
        "lot_id": LOT_ID,
        "buyer_name": "Juan Pérez",
        "buyer_rut": "12.345.678-9",
        "buyer_email": "juan@perez.cl",
        "buyer_phone": "teléfono-inválido",
        "payment_method": "transfer"
    }
    response = client.post(
        "/api/v1/miniapp/reservas",
        json=payload,
        headers=_obtener_headers_vendedor()
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # 2. Email inválido
    payload["buyer_phone"] = "+56912345678"
    payload["buyer_email"] = "email-sin-arroba"
    response = client.post(
        "/api/v1/miniapp/reservas",
        json=payload,
        headers=_obtener_headers_vendedor()
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

def test_crear_reserva_no_autorizado():
    """Prueba que el endpoint devuelva 401 si no se provee un token de Mini App válido."""
    client = TestClient(app)
    payload = {
        "lot_id": LOT_ID,
        "buyer_name": "Juan Pérez",
        "buyer_rut": "12.345.678-9",
        "buyer_email": "juan@perez.cl",
        "buyer_phone": "+56912345678",
        "payment_method": "transfer"
    }
    response = client.post(
        "/api/v1/miniapp/reservas",
        json=payload
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

@patch("api.v1.endpoints.miniapp.get_supabase_client")
def test_crear_reserva_idempotencia(mock_supabase_client):
    """Prueba que el backend devuelva la misma respuesta al reenviar con la misma X-Idempotency-Key."""
    mock_supabase = MagicMock()
    mock_supabase_client.return_value = mock_supabase
    # Depends(get_arq_pool) captura la función real al registrar la ruta, así que
    # @patch no la intercepta: hay que usar dependency_overrides.
    mock_redis = MagicMock()
    mock_redis.enqueue_job = AsyncMock()
    app.dependency_overrides[get_arq_pool] = lambda: mock_redis

    # 1. Configurar mocks para éxito inicial
    lot_data = {
        "id": LOT_ID,
        "estado": "disponible",
        "numero_lote": "104",
        "project_id": str(uuid.uuid4()),
        "precio": 45000000,
        "valor_reserva": 500000,
        "projects": {"organization_id": ORG_ID}
    }
    mock_lot_select = MagicMock()
    mock_lot_select.eq.return_value = mock_lot_select
    mock_lot_select.limit.return_value = mock_lot_select
    mock_lot_select.execute.return_value = MagicMock(data=[lot_data])
    # require_lot_organization() consulta con .single() para derivar el tenant del lote
    mock_lot_select.single.return_value.execute.return_value = MagicMock(data=lot_data)

    mock_vp_select = MagicMock()
    mock_vp_select.eq.return_value = mock_vp_select
    mock_vp_select.limit.return_value = mock_vp_select
    mock_vp_select.execute.return_value = MagicMock(
        data=[{"vendor_id": VENDOR_ID}]
    )

    mock_pending_select = MagicMock()
    mock_pending_select.eq.return_value = mock_pending_select
    mock_pending_select.limit.return_value = mock_pending_select
    mock_pending_select.execute.return_value = MagicMock(data=[])

    approval_id = str(uuid.uuid4())
    mock_insert = MagicMock()
    mock_insert.execute.return_value = MagicMock(
        data=[{"id": approval_id}]
    )

    def mock_table(table_name):
        if table_name == "lots":
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_lot_select
            return mock_table_obj
        elif table_name == "vendor_projects":
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_vp_select
            return mock_table_obj
        elif table_name == "approval_requests":
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_pending_select
            mock_table_obj.insert.return_value = mock_insert
            return mock_table_obj
        return MagicMock()

    mock_supabase.table.side_effect = mock_table

    # Mock de Redis para almacenar y recuperar la respuesta idempotente
    idempotency_cache = {}
    idempotency_key = f"idempotency:miniapp_reserva:{ORG_ID}:test-key-123"

    async def mock_get(key):
        return idempotency_cache.get(key)

    async def mock_set(key, val, ex=None):
        idempotency_cache[key] = val
        return True

    mock_redis.get.side_effect = mock_get
    mock_redis.set.side_effect = mock_set

    try:
        client = TestClient(app)
        payload = {
            "lot_id": LOT_ID,
            "buyer_name": "Juan Pérez",
            "buyer_rut": "12.345.678-9",
            "buyer_email": "juan@perez.cl",
            "buyer_phone": "+56912345678",
            "payment_method": "transfer",
            "payment_evidence_url": "https://bucket.supabase.co/minutas/evidencia.pdf"
        }

        headers = _obtener_headers_vendedor()
        headers["X-Idempotency-Key"] = "test-key-123"

        # Primera petición: Debe crearla
        response1 = client.post(
            "/api/v1/miniapp/reservas",
            json=payload,
            headers=headers
        )
        assert response1.status_code == status.HTTP_201_CREATED
        data1 = response1.json()
        assert data1["approval_id"] == approval_id

        # Segunda petición (misma clave): Debe retornar el mismo body en caché sin llamar insert otra vez
        response2 = client.post(
            "/api/v1/miniapp/reservas",
            json=payload,
            headers=headers
        )
        assert response2.status_code == status.HTTP_201_CREATED
        data2 = response2.json()
        assert data2["approval_id"] == approval_id
        assert mock_insert.execute.call_count == 1  # Solo se insertó una vez
    finally:
        app.dependency_overrides.pop(get_arq_pool, None)
