"""
Tests de integración contra Supabase REAL para los endpoints de lectura de
la Mini App (Fase 0 de la remediación SDD18).

Objetivo: un `select` de una columna inexistente debe fallar AQUÍ, no solo
en producción. Los tests que mockean Supabase (test_miniapp_endpoints.py)
no detectan este tipo de bug porque el mock nunca valida columnas reales
contra PostgREST — ese es el patrón exacto que originó la remediación (ver
memoria de proyecto `sdd18-miniapp-schema-role-bugs.md`: escritura_cases no
tiene status/current_stage/blockers/vendedor_id, escritura_cascade_runs no
tiene error_cause/variables_state, escritura_deliveries no tiene
file_path/delivered_at/expires_at).

Requiere SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY reales (ya presentes en
.env de desarrollo). Se omite automáticamente si no están configuradas
(p.ej. en CI sin secretos) — igual que el resto de tests `integration`
existentes en este repo.

Ejecutar con: pytest -m integration tests/test_miniapp_schema_integration.py
"""
import pytest
from fastapi.testclient import TestClient

from main import app
from core.config import get_settings
from core.miniapp_session import create_miniapp_session

pytestmark = pytest.mark.integration

# IDs reales del proyecto Supabase de desarrollo (swkrnjdpnlrgxgotmfxy),
# verificados por Supabase MCP el 2026-07-20 — no inventados.
ORG_ID = "7a0203ce-8b31-4661-a7b7-933613d49069"
ADMIN_PROFILE_ID = "4778854b-6dfd-4aad-8c9a-bd9f92bbb460"
VENDOR_PROFILE_ID = "6198888a-357f-40be-bcf8-49f329debaa0"
# Caso real con escritura_case + minuta generada y entregada (lote 12).
CASE_ID_CON_ENTREGA = "464b1b09-3301-4a97-aa8f-d596d7927df4"


def _skip_sin_supabase_real() -> None:
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        pytest.skip("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY no configuradas")


def _headers(user_id: str, role: str) -> dict:
    vendor_id = None
    if role == "vendor":
        # ID real del vendedor en el proyecto de desarrollo de Supabase
        vendor_id = "5a5e29ea-5c86-41cb-b1a3-50d61c0dc803"
    token = create_miniapp_session(
        user_id=user_id, org_id=ORG_ID, role=role, chat_id=1, vendor_id=vendor_id
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    _skip_sin_supabase_real()
    return TestClient(app)


def test_bandeja_admin_no_revienta_contra_esquema_real(client):
    """GET /miniapp/bandeja: escritura_cases/escritura_cascade_runs deben
    consultarse con columnas que existen de verdad (case_status/outcome/
    causes), no status/error_cause/variables_state."""
    res = client.get("/api/v1/miniapp/bandeja", headers=_headers(ADMIN_PROFILE_ID, "admin"))
    assert res.status_code == 200, res.text


def test_bandeja_detalle_excepcion_no_revienta_contra_esquema_real(client):
    """GET /miniapp/bandeja/{id}?tipo=excepcion: la evidencia lado a lado
    debe leerse de columnas reales de escritura_cascade_runs/deliveries."""
    res = client.get(
        f"/api/v1/miniapp/bandeja/{CASE_ID_CON_ENTREGA}?tipo=excepcion",
        headers=_headers(ADMIN_PROFILE_ID, "admin"),
    )
    assert res.status_code in (200, 404), res.text


def test_ventas_vendedor_no_revienta_contra_esquema_real(client):
    """GET /miniapp/ventas: la etapa y los blockers deben derivarse de
    case_status/readiness_status/readiness_gates, no de columnas
    inexistentes (status/current_stage/blockers/vendedor_id)."""
    res = client.get("/api/v1/miniapp/ventas", headers=_headers(VENDOR_PROFILE_ID, "vendor"))
    assert res.status_code == 200, res.text


def test_venta_detalle_no_revienta_contra_esquema_real(client):
    res = client.get(
        f"/api/v1/miniapp/ventas/{CASE_ID_CON_ENTREGA}",
        headers=_headers(VENDOR_PROFILE_ID, "vendor"),
    )
    assert res.status_code in (200, 404), res.text


def test_documentos_vendedor_no_revienta_contra_esquema_real(client):
    """GET /miniapp/documentos: las entregas deben leerse de
    escritura_deliveries con sus columnas reales (link_token/
    link_expires_at/status/generation_id), no file_path/delivered_at/
    expires_at."""
    res = client.get("/api/v1/miniapp/documentos", headers=_headers(VENDOR_PROFILE_ID, "vendor"))
    assert res.status_code == 200, res.text


async def test_resolve_miniapp_user_vendedor_real_resuelve_vendors_id():
    """El único vendedor real de datos (organization_members.role='user',
    fila activa en vendors) debe resolver role='vendor' y el vendors.id
    correcto — no profiles.id. Prueba directa contra Supabase real,
    sin pasar por el bot (no requiere initData firmado)."""
    _skip_sin_supabase_real()
    from core.miniapp_session import resolve_miniapp_user

    error, detail = await resolve_miniapp_user(ORG_ID, "5844273174")

    assert error is None, error
    assert detail["role"] == "vendor"
    assert detail["user_id"] == VENDOR_PROFILE_ID
    assert detail["vendor_id"] == "5a5e29ea-5c86-41cb-b1a3-50d61c0dc803"
