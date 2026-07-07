from __future__ import annotations

import math
import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

from api.deps import verify_internal_secret
from api.v1.endpoints import escritura_matrices

ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
ADMIN_ID = "00000000-0000-4000-8000-000000000009"

class MockResponse:
    def __init__(self, data):
        self.data = data

class MockQuery:
    def __init__(self, table_name, store):
        self.table_name = table_name
        self.store = store
        self.filters = {}

    def select(self, *args):
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def single(self):
        return self

    def update(self, payload):
        self.store.updates.append((self.table_name, self.filters, payload))
        return self

    def insert(self, payload):
        self.store.inserts.append((self.table_name, payload))
        return self

    def execute(self):
        if self.table_name == "organization_members":
            # Retornar que el ADMIN_ID tiene rol 'admin'
            if self.filters.get("user_id") == ADMIN_ID:
                return MockResponse({"role": "admin"})
            return MockResponse(None)
        
        if self.table_name == "lots":
            # Retornar los lotes del test
            return MockResponse(self.store.lots_data)

        if self.table_name == "geometries":
            # Retornar las geometrías del test
            return MockResponse(self.store.geometries_data)

        return MockResponse([])

class MockSupabaseStore:
    def __init__(self):
        self.lots_data = []
        self.geometries_data = []
        self.updates = []
        self.inserts = []

    def table(self, table_name):
        return MockQuery(table_name, self)

@pytest.fixture
def test_store():
    return MockSupabaseStore()

@pytest.fixture
def client(test_store, monkeypatch):
    monkeypatch.setattr("core.database.get_supabase_client", lambda: test_store)
    
    app = FastAPI()
    app.dependency_overrides[verify_internal_secret] = lambda: None
    app.include_router(escritura_matrices.router, prefix="/api/v1")
    
    return TestClient(app, headers={"X-Internal-Secret": "test-secret"})

def test_bulk_verify_lots_success_and_tolerances(client, test_store):
    # 1. Configurar datos de prueba
    # Un lote exacto, un lote desviado por 5%, un lote sin geometría
    
    # Geometría cuadrada de aprox 100m en Chile Central (Zona 19 Sur)
    # Puntos en longitud/latitud
    square_geometry = {
        "type": "Polygon",
        "coordinates": [[
            [-71.0, -33.0],
            [-71.0, -33.0009],  # aprox 100 metros al sur
            [-71.00108, -33.0009], # aprox 100 metros al oeste
            [-71.00108, -33.0],
            [-71.0, -33.0]
        ]]
    }

    # Calculamos área aproximada para calibrar los datos oficiales
    # Dejemos que corra primero un cálculo ficticio o usemós valores exactos:
    # Área aproximada: ~10000 m2, perímetro: ~400m
    # Para asegurar precisión de tolerancia en test:
    # Lote 1 (Verificado exacto): Oficial = 10000.0 m2, 400.0m
    # Lote 2 (Desviado por 5%): Oficial = 10500.0 m2 (5% más), 420.0m
    # Lote 3 (Sin geometría)
    
    test_store.lots_data = [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "numero_lote": "Lote 1",
            "m2": 0.0,
            "area_official_m2": 10074.715,
            "perimeter_official_m": 401.498,
            "verified_status": "draft",
            "geometry_id": "geom-1"
        },
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "numero_lote": "Lote 2",
            "m2": 0.0,
            "area_official_m2": 10578.45,  # ~5% de desviación
            "perimeter_official_m": 421.57,
            "verified_status": "draft",
            "geometry_id": "geom-2"
        },
        {
            "id": "33333333-3333-3333-3333-333333333333",
            "numero_lote": "Lote 3",
            "m2": 0.0,
            "area_official_m2": 10000.0,
            "perimeter_official_m": 400.0,
            "verified_status": "draft",
            "geometry_id": None
        }
    ]

    test_store.geometries_data = [
        {"id": "geom-1", "geometry": square_geometry},
        {"id": "geom-2", "geometry": square_geometry}
    ]

    # 2. Ejecutar con tolerancia 0.5% (Lote 1 verificado, Lote 2 desviado, Lote 3 sin geometría)
    response = client.post(
        f"/api/v1/projects/{PROJECT_ID}/lots/bulk-verify?organization_id={ORG_ID}",
        json={
            "tolerance_pct": 0.5,
            "admin_id": ADMIN_ID
        }
    )
    
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["verified"] == 1
    assert "22222222-2222-2222-2222-222222222222" in res_data["deviated"]
    assert "33333333-3333-3333-3333-333333333333" in res_data["skipped_no_geometry"]

    # Validar que se guardó en Supabase la actualización del Lote 1 y la inserción del log de auditoría
    assert len(test_store.updates) == 1
    assert test_store.updates[0][0] == "lots"
    assert test_store.updates[0][2]["verified_status"] == "verified_exact"
    assert test_store.updates[0][2]["m2"] == 10074.715

    assert len(test_store.inserts) == 1
    assert test_store.inserts[0][0] == "audit_logs"
    assert test_store.inserts[0][1]["action"] == "VERIFY"
    assert test_store.inserts[0][1]["payload"]["bulk"] is True

    # Resetear updates e inserts
    test_store.updates.clear()
    test_store.inserts.clear()

    # 3. Ejecutar con tolerancia 6.0% (Lote 1 y Lote 2 verificados, Lote 3 sin geometría)
    response = client.post(
        f"/api/v1/projects/{PROJECT_ID}/lots/bulk-verify?organization_id={ORG_ID}",
        json={
            "tolerance_pct": 6.0,
            "admin_id": ADMIN_ID
        }
    )
    
    assert response.status_code == 200
    res_data = response.json()
    
    assert res_data["verified"] == 2
    assert len(res_data["deviated"]) == 0
    assert "33333333-3333-3333-3333-333333333333" in res_data["skipped_no_geometry"]
    
    assert len(test_store.updates) == 2
    assert len(test_store.inserts) == 2
