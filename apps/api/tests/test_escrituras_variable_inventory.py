"""API/service tests for SDD 007 US2 legal variable inventory."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
VARIABLE_ID = "00000000-0000-4000-8000-000000000003"
DOCUMENT_ID = "00000000-0000-4000-8000-000000000004"
PAGE_ID = "00000000-0000-4000-8000-000000000005"
EVIDENCE_ID = "00000000-0000-4000-8000-000000000006"


def _client() -> TestClient:
    from api.deps import verify_internal_secret
    from api.v1.router import api_router

    app = FastAPI()

    async def bypass_secret() -> str:
        return "test"

    app.dependency_overrides[verify_internal_secret] = bypass_secret
    app.include_router(api_router, prefix="/api/v1")
    return TestClient(app, headers={"X-Internal-Secret": "test"})


def _inventory_response():
    from schemas.legal_variables import (
        DocumentEvidenceResponse,
        VariableInventoryResponse,
        VariableResolutionResponse,
    )

    evidence = DocumentEvidenceResponse.model_validate(
        {
            "id": EVIDENCE_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_resolution_id": VARIABLE_ID,
            "legal_document_id": DOCUMENT_ID,
            "legal_document_page_id": PAGE_ID,
            "snippet_hash": "a" * 64,
            "confidence": 0.92,
        }
    )
    variable = VariableResolutionResponse.model_validate(
        {
            "id": VARIABLE_ID,
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_key": "matriz.rol_avaluo",
            "variable_group": "matriz",
            "value_text": "4699",
            "state": "proposed",
            "source_type": "document",
            "confidence": 0.92,
            "approval_required": True,
            "evidence": [evidence],
        }
    )
    return VariableInventoryResponse(
        project_id=PROJECT_ID,
        groups={"matriz": [variable]},
        summary={
            "total": 1,
            "approved": 0,
            "proposed": 1,
            "missing": 0,
            "conflict": 0,
            "manual_review": 0,
        },
    )


def test_get_project_legal_variables_endpoint_returns_inventory(monkeypatch):
    import api.v1.endpoints.legal_variables as endpoint

    client = _client()
    get_inventory = AsyncMock(return_value=_inventory_response())
    monkeypatch.setattr(
        endpoint,
        "get_project_variable_inventory_service",
        get_inventory,
    )

    response = client.get(
        f"/api/v1/legal-variables/project/{PROJECT_ID}",
        params={
            "organization_id": ORG_ID,
            "state": "proposed",
            "group": "matriz",
            "include_evidence": "true",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["project_id"] == PROJECT_ID
    assert payload["groups"]["matriz"][0]["variable_key"] == "matriz.rol_avaluo"
    assert payload["groups"]["matriz"][0]["evidence"][0]["legal_document_page_id"] == PAGE_ID
    assert payload["summary"]["proposed"] == 1
    get_inventory.assert_awaited_once_with(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        lot_id=None,
        state="proposed",
        group="matriz",
        include_evidence=True,
    )


class FakeSupabaseTable:
    def __init__(self, supabase: "FakeSupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.filters: dict[str, object] = {}
        self.op = "select"
        self.payload: object = None

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self.filters[str(column)] = value
        return self

    def neq(self, column, value):
        self.filters[f"{column}__neq"] = value
        return self

    def in_(self, column, values):
        self.filters[f"{column}__in"] = list(values)
        return self

    def is_(self, column, value):
        self.filters[f"{column}__is"] = value
        return self

    def limit(self, *_args):
        return self

    def single(self):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def execute(self):
        return self.supabase.execute(self)


class FakeSupabase:
    def __init__(
        self,
        variable_rows: list[dict[str, object]] | None = None,
        *,
        templates: list[dict[str, object]] | None = None,
        template_clauses: list[dict[str, object]] | None = None,
    ) -> None:
        self.variable_rows = variable_rows
        self.templates = templates or []
        self.template_clauses = template_clauses or []
        self.inserted_variable_rows: list[dict[str, object]] = []

    def table(self, name: str) -> FakeSupabaseTable:
        return FakeSupabaseTable(self, name)

    def execute(self, table: FakeSupabaseTable):
        now = datetime(2026, 6, 4, 12, 0, tzinfo=UTC)
        if table.name == "projects":
            return SimpleNamespace(data={"id": PROJECT_ID, "organization_id": ORG_ID})
        if table.name == "lots":
            if table.filters.get("id") == "00000000-0000-4000-8000-000000000099":
                return SimpleNamespace(data=[])
            return SimpleNamespace(data={"id": table.filters.get("id"), "project_id": PROJECT_ID})
        if table.name == "escritura_templates":
            return SimpleNamespace(data=self.templates)
        if table.name == "escritura_template_clauses":
            return SimpleNamespace(data=self.template_clauses)
        if table.name == "variable_resolutions" and table.op == "insert":
            rows = table.payload if isinstance(table.payload, list) else [table.payload]
            self.inserted_variable_rows.extend(rows)
            return SimpleNamespace(data=rows)
        if table.name == "variable_resolutions":
            rows = self.variable_rows or [
                {
                    "id": VARIABLE_ID,
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "variable_key": "matriz.rol_avaluo",
                    "variable_group": "matriz",
                    "value_text": "4699",
                    "state": "proposed",
                    "source_type": "document",
                    "source_ref": {"document_type": "dominio_vigente"},
                    "confidence": 0.92,
                    "approval_required": True,
                    "created_at": now,
                    "updated_at": now,
                },
                {
                    "id": "00000000-0000-4000-8000-000000000007",
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "variable_key": "matriz.nombre_predio",
                    "variable_group": "matriz",
                    "value_text": None,
                    "state": "missing",
                    "source_type": "system",
                    "source_ref": {},
                    "confidence": None,
                    "approval_required": True,
                },
                {
                    "id": "00000000-0000-4000-8000-000000000008",
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "variable_key": "matriz.nombre_predio",
                    "variable_group": "matriz",
                    "value_text": None,
                    "state": "superseded",
                    "source_type": "system",
                    "source_ref": {},
                    "confidence": None,
                    "approval_required": True,
                },
            ]
            if table.filters.get("state__neq"):
                rows = [
                    row
                    for row in rows
                    if row.get("state") != table.filters["state__neq"]
                ]
            return SimpleNamespace(data=rows)
        if table.name == "document_evidence":
            return SimpleNamespace(
                data=[
                    {
                        "id": EVIDENCE_ID,
                        "organization_id": ORG_ID,
                        "project_id": PROJECT_ID,
                        "variable_resolution_id": VARIABLE_ID,
                        "legal_document_id": DOCUMENT_ID,
                        "legal_document_page_id": PAGE_ID,
                        "snippet": "inscrita a fojas 4699",
                        "snippet_hash": "b" * 64,
                        "confidence": 0.92,
                    }
                ]
            )
        return SimpleNamespace(data=[])


async def test_get_project_variable_inventory_groups_summary_and_evidence():
    from services.legal_variable_resolution import get_project_variable_inventory

    inventory = await get_project_variable_inventory(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        supabase=FakeSupabase(),
    )

    assert set(inventory.groups) == {"matriz"}
    assert [item.variable_key for item in inventory.groups["matriz"]] == [
        "matriz.rol_avaluo",
        "matriz.nombre_predio",
    ]
    assert inventory.summary == {
        "total": 2,
        "missing": 1,
        "proposed": 1,
        "resolved": 0,
        "approved": 0,
        "manual_review": 0,
        "conflict": 0,
        "derived": 0,
        "not_applicable": 0,
        "superseded": 0,
    }
    assert inventory.groups["matriz"][0].evidence[0].legal_document_page_id == PAGE_ID
    assert inventory.groups["matriz"][1].evidence == []


async def test_get_project_variable_inventory_exposes_producer_by_group_and_key():
    from services.legal_variable_resolution import get_project_variable_inventory

    now = datetime(2026, 6, 30, 12, 0, tzinfo=UTC)
    rows = [
        {
            "id": "00000000-0000-4000-8000-000000000101",
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_key": "vendedor.nombre",
            "variable_group": "vendedor",
            "value_text": "JUAN DE DIOS GALAZ ABARCA",
            "state": "proposed",
            "source_type": "document",
            "source_ref": {},
            "confidence": 0.98,
            "approval_required": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "00000000-0000-4000-8000-000000000102",
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_key": "sag.plano_cbr_numero",
            "variable_group": "sag",
            "value_text": "1394",
            "state": "proposed",
            "source_type": "manual",
            "source_ref": {},
            "confidence": None,
            "approval_required": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "00000000-0000-4000-8000-000000000103",
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_key": "comprador.nombre",
            "variable_group": "comprador",
            "value_text": None,
            "state": "missing",
            "source_type": "system",
            "source_ref": {},
            "confidence": None,
            "approval_required": False,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "00000000-0000-4000-8000-000000000104",
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_key": "clausulas.saneamiento_eviccion",
            "variable_group": "clausulas",
            "value_text": "La vendedora respondera del saneamiento.",
            "state": "derived",
            "source_type": "system",
            "source_ref": {},
            "confidence": None,
            "approval_required": False,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "00000000-0000-4000-8000-000000000105",
            "organization_id": ORG_ID,
            "project_id": PROJECT_ID,
            "variable_key": "documento.notario.nombre",
            "variable_group": "documento",
            "value_text": None,
            "state": "missing",
            "source_type": "system",
            "source_ref": {},
            "confidence": None,
            "approval_required": False,
            "created_at": now,
            "updated_at": now,
        },
    ]

    inventory = await get_project_variable_inventory(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        include_evidence=False,
        supabase=FakeSupabase(variable_rows=rows),
    )

    producer_by_key = {
        item.variable_key: item.producer
        for group in inventory.groups.values()
        for item in group
    }

    assert producer_by_key == {
        "vendedor.nombre": "extracted",
        "sag.plano_cbr_numero": "manual",
        "comprador.nombre": "sale_gap",
        "clausulas.saneamiento_eviccion": "authored",
        "documento.notario.nombre": "signing",
    }


def _clause_content(variable_key: str) -> dict[str, object]:
    return {
        "schema_version": 1,
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "variable_token", "attrs": {"variableKey": variable_key}}
                ],
            }
        ],
    }


async def test_get_project_variable_inventory_seeds_authored_gap_without_default():
    """SDD 013 (alineacion LOTE 29): mandato.rectificacion_nombre es `authored`
    sin default de catalogo; si el template publicado la referencia y el
    proyecto no tiene fila, el inventario debe autosanar con un `missing`
    antes de responder, para que deje de desaparecer de la mesa."""
    from services.legal_variable_resolution import get_project_variable_inventory

    fake = FakeSupabase(
        variable_rows=[],
        templates=[{"id": "tmpl-1"}],
        template_clauses=[
            {"content_json": _clause_content("mandato.rectificacion_nombre")},
            {"content_json": _clause_content("mandato.rectificacion_rut")},
            # authored CON default de catalogo: no debe sembrarse.
            {"content_json": _clause_content("clausulas.gastos_cargo")},
            # extracted: no es responsabilidad de este seeding.
            {"content_json": _clause_content("vendedor.nombre")},
        ],
    )

    await get_project_variable_inventory(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        supabase=fake,
    )

    seeded_keys = {row["variable_key"] for row in fake.inserted_variable_rows}
    assert seeded_keys == {"mandato.rectificacion_nombre", "mandato.rectificacion_rut"}
    for row in fake.inserted_variable_rows:
        assert row["state"] == "missing"
        assert row["variable_group"] == "mandato"
        assert row["project_id"] == PROJECT_ID
        assert row["lot_id"] is None


async def test_get_project_variable_inventory_does_not_reseed_existing_gap():
    from services.legal_variable_resolution import get_project_variable_inventory

    fake = FakeSupabase(
        variable_rows=[
            {
                "id": VARIABLE_ID,
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_key": "mandato.rectificacion_nombre",
                "variable_group": "mandato",
                "value_text": "Juan Pérez",
                "state": "resolved",
                "source_type": "legal_review",
                "source_ref": {},
                "confidence": None,
                "approval_required": True,
            }
        ],
        templates=[{"id": "tmpl-1"}],
        template_clauses=[
            {"content_json": _clause_content("mandato.rectificacion_nombre")},
        ],
    )

    await get_project_variable_inventory(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        supabase=fake,
    )

    assert fake.inserted_variable_rows == []


async def test_get_project_variable_inventory_skips_seeding_for_lot_scope():
    from services.legal_variable_resolution import get_project_variable_inventory

    fake = FakeSupabase(
        variable_rows=[],
        templates=[{"id": "tmpl-1"}],
        template_clauses=[
            {"content_json": _clause_content("mandato.rectificacion_nombre")},
        ],
    )

    await get_project_variable_inventory(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        lot_id="00000000-0000-4000-8000-000000000010",
        supabase=fake,
    )

    assert fake.inserted_variable_rows == []


async def test_get_project_variable_inventory_rejects_lot_outside_project_scope():
    from services.legal_variable_resolution import (
        LegalVariableInventoryNotFoundError,
        get_project_variable_inventory,
    )

    with pytest.raises(LegalVariableInventoryNotFoundError):
        await get_project_variable_inventory(
            project_id=PROJECT_ID,
            organization_id=ORG_ID,
            lot_id="00000000-0000-4000-8000-000000000099",
            supabase=FakeSupabase(),
        )
