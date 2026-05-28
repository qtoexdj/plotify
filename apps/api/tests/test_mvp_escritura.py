"""Tests for User Story 4: Prepare Escritura From Project Data and Documents."""

import os
import glob
from pathlib import Path
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

def test_project_legal_data_migration_exists_t059():
    """
    T059: Add project legal data migration tests in apps/api/tests/test_mvp_escritura.py
    Acceptance: reviewed legal values store source document, status, reviewer, and project organization.
    Tests the migration SQL schema deterministically using absolute paths.
    """
    # Encontrar la migración T062 usando Path(__file__).resolve() para evitar rutas relativas frágiles
    current_dir = Path(__file__).resolve().parent
    # Ir de /apps/api/tests/ a la raíz del monorepo y luego a las migraciones
    migrations_dir = current_dir.parents[2] / "packages" / "database" / "supabase" / "migrations"
    
    migration_files = glob.glob(str(migrations_dir / "*_mvp_project_legal_data.sql"))
    
    if not migration_files:
        pytest.fail(
            "Fallo en T059: No existe el archivo de migración real de la base de datos para legal data (*_mvp_project_legal_data.sql). "
            "Asegúrate de completar T062 antes de marcar este test como aprobado."
        )
        
    migration_file = migration_files[0]
    with open(migration_file, "r", encoding="utf-8") as f:
        content = f.read().lower()
        
    # Validar la estructura del esquema planificado
    required_keywords = [
        "project_id",
        "organization_id",
        "source_document",
        "review_status",
        "reviewer_id",
        "reviewed_at"
    ]
    
    for keyword in required_keywords:
        assert keyword in content, f"La migración T062 no contiene la columna/definición requerida: '{keyword}'"


@pytest.mark.asyncio
async def test_escritura_variable_resolver_classification_t060():
    """
    T060: Add escritura variable status tests in apps/api/tests/test_mvp_escritura.py
    Acceptance: variables are classified as project, lot, buyer, geometry, legal document, or missing.
    Tests the real document_engine.py functions with deterministic mocks.
    """
    from services.document_engine import resolve_variable_status
    
    # 1. Mock determinístico de Supabase
    lot_result = MagicMock(
        data={
            "id": "lot-mvp-1",
            "numero_lote": "24",
            "precio": 10000000,
            "m2": 5000,
            "area_official_m2": 5100,
            "perimeter_m": 300,
            "area_ha": 0.51,
            "servidumbre_m2": 0,
            "estado": "reservado",
            "lot_records": {
                "cliente_nombre": "Comprador Demo",
                "cliente_run": "12.345.678-9",
            },
            "projects": {
                "id": "project-mvp-1",
                "name": "Proyecto Piloto",
                "organizations": {"id": "org-mvp-1", "name": "Org Piloto"},
            },
        }
    )
    
    payment_result = MagicMock(data={})
    
    # Mock de project_legal_data (que se creará en T062)
    legal_data_result = MagicMock(
        data={
            "dominio_cbr_fojas": "1234",
            "dominio_cbr_numero": "5678",
            "dominio_cbr_ano": "2025",
            "source_document": "dominio_vigente.pdf",
            "review_status": "approved",
            "reviewer_id": "reviewer-user-1",
            "organization_id": "org-mvp-1",
            "project_id": "project-mvp-1",
        }
    )
    
    # Mock de template_block_items para simular variables requeridas por el template
    blocks_result = MagicMock(
        data=[
            {
                "document_blocks": {
                    "content": "Escritura: fojas {{ dominio_cbr_fojas }}, numero {{ dominio_cbr_numero }}."
                }
            }
        ]
    )
    
    # Llevar tracking de las consultas de tabla realizadas
    called_tables = []
    
    supabase = MagicMock()
    def table_side_effect(table_name):
        called_tables.append(table_name)
        table = MagicMock()
        if table_name == "lots":
            table.select.return_value.eq.return_value.single.return_value.execute.return_value = lot_result
        elif table_name == "organization_payment_info":
            table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = payment_result
        elif table_name == "project_legal_data":
            table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = legal_data_result
        elif table_name == "template_block_items":
            table.select.return_value.eq.return_value.execute.return_value = blocks_result
        return table
        
    supabase.table.side_effect = table_side_effect
    
    with (
        patch("services.document_engine.get_supabase_client", return_value=supabase),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        status = await resolve_variable_status(
            lot_id="lot-mvp-1",
            organization_id="org-mvp-1",
            template_id="template-escritura-1"
        )
        
    # Verificar que el resolver haya consultado realmente la nueva tabla project_legal_data
    # Esto evitará falsos verdes donde el resolvedor no consulte el origen correcto.
    assert "project_legal_data" in called_tables, (
        "Fallo en T060: El resolvedor real no está consultando la tabla 'project_legal_data'."
    )
    
    variables = status["variables"]
    
    # Verificar que las variables del grupo canónico 'matriz' o 'personeria' se alimenten
    # del mock de project_legal_data y no de lot_records de manera hardcodeada
    assert variables["matriz"]["dominio_cbr_fojas"] == "1234", (
        "Fallo en T060: La variable dominio_cbr_fojas no tiene el valor del mock de project_legal_data."
    )
    
    # 2. Verificar que si quitamos el mock de project_legal_data (devuelve None/vacío),
    # las variables asociadas pasen a la lista "missing"
    called_tables.clear()
    
    def empty_table_side_effect(table_name):
        called_tables.append(table_name)
        table = MagicMock()
        if table_name == "lots":
            table.select.return_value.eq.return_value.single.return_value.execute.return_value = lot_result
        elif table_name == "organization_payment_info":
            table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = payment_result
        elif table_name == "project_legal_data":
            table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)
        elif table_name == "template_block_items":
            table.select.return_value.eq.return_value.execute.return_value = blocks_result
        return table
        
    supabase.table.side_effect = empty_table_side_effect
    
    with (
        patch("services.document_engine.get_supabase_client", return_value=supabase),
        patch("asyncio.to_thread", new=AsyncMock(side_effect=lambda fn, *a, **kw: fn())),
    ):
        status_empty = await resolve_variable_status(
            lot_id="lot-mvp-1",
            organization_id="org-mvp-1",
            template_id="template-escritura-1"
        )
        
    assert "matriz.dominio_cbr_fojas" in status_empty["missing"], (
        "Fallo en T060: La variable dominio_cbr_fojas debería estar marcada como 'missing' si no existen datos en project_legal_data."
    )
