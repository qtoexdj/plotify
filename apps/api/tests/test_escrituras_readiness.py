"""SDD 007 US5 tests for escritura readiness and case snapshots."""

from __future__ import annotations

from types import SimpleNamespace

from services.escritura_readiness import (
    EscrituraReadinessScopeError,
    LEGAL_REVIEW_WARNING,
    calculate_escritura_readiness,
    create_escritura_case_snapshot,
    get_escritura_readiness,
)
from services.legal_variable_catalog import READINESS_REQUIRED_VARIABLES_BY_GATE


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_ID = "00000000-0000-4000-8000-000000000029"
USER_ID = "00000000-0000-4000-8000-000000000005"
SII_DOCUMENT_ID = "00000000-0000-4000-8000-000000000020"


def _approved_variable(variable_key: str, value: str = "ok") -> dict[str, object]:
    group = variable_key.split(".", 1)[0]
    return {
        "id": f"var-{variable_key}",
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "lot_id": None,
        "escritura_case_id": None,
        "variable_key": variable_key,
        "variable_group": group,
        "value_text": value,
        "value_json": None,
        "state": "approved",
        "source_type": "legal_review",
        "source_ref": {"test": True},
        "confidence": 1.0,
        "reviewed_at": "2026-06-03T12:00:00Z",
        "approval_required": True,
        "evidence": [
            {
                "legal_document_id": SII_DOCUMENT_ID,
                "page_number": 1,
                "snippet": f"Evidencia para {variable_key}",
                "confidence": 0.95,
            }
        ],
    }


def _ready_variables() -> list[dict[str, object]]:
    return [
        _approved_variable(variable_key)
        for keys in READINESS_REQUIRED_VARIABLES_BY_GATE.values()
        for variable_key in keys
    ]


def _matched_lot_legal_data() -> dict[str, object]:
    return {
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "lot_id": LOT_ID,
        "role_status": "rol_en_tramite",
        "matching_status": "matched",
        "source_legal_document_id": SII_DOCUMENT_ID,
    }


def test_readiness_blocks_missing_required_variables_and_explains_gate():
    variables = [
        variable
        for variable in _ready_variables()
        if variable["variable_key"] != "comprador.rut"
    ]

    readiness = calculate_escritura_readiness(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        lot_id=LOT_ID,
        variables=variables,
        lot_legal_data=_matched_lot_legal_data(),
        warning_acknowledged=True,
    )
    gates = {gate.gate: gate for gate in readiness.gates}

    assert readiness.readiness_status == "blocked"
    assert gates["party_verified"].status == "blocked"
    assert gates["party_verified"].blocking_variables == ("comprador.rut",)
    assert "comprador.rut" not in readiness.variable_snapshot


def test_readiness_allows_supported_rol_en_tramite_and_requires_warning_review():
    readiness = calculate_escritura_readiness(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        lot_id=LOT_ID,
        variables=_ready_variables(),
        lot_legal_data=_matched_lot_legal_data(),
        warning_acknowledged=False,
    )
    gates = {gate.gate: gate for gate in readiness.gates}

    assert gates["sii_verified"].status == "ready"
    assert gates["warning_acknowledged"].status == "needs_review"
    assert gates["warning_acknowledged"].warnings == (LEGAL_REVIEW_WARNING,)
    assert readiness.readiness_status == "needs_review"


def test_readiness_creates_ready_snapshot_when_all_gates_pass():
    variables = _ready_variables()

    readiness = calculate_escritura_readiness(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        lot_id=LOT_ID,
        variables=variables,
        lot_legal_data=_matched_lot_legal_data(),
        warning_acknowledged=True,
    )

    assert readiness.readiness_status == "ready"
    assert all(gate.status == "ready" for gate in readiness.gates)
    assert set(readiness.variable_snapshot) == {
        variable["variable_key"] for variable in variables
    }
    assert set(readiness.evidence_snapshot) == {
        variable["variable_key"] for variable in variables
    }


class FakeSupabaseTable:
    def __init__(self, supabase: "FakeSupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.insert_payload: dict[str, object] | None = None
        self.update_payload: dict[str, object] | None = None

    def select(self, *_args):
        return self

    def eq(self, *_args):
        return self

    def or_(self, *_args):
        return self

    def is_(self, *_args):
        return self

    def in_(self, *_args):
        return self

    def neq(self, *_args):
        return self

    def maybe_single(self):
        return self

    def insert(self, payload):
        self.insert_payload = payload
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def execute(self):
        return self.supabase.execute(self)


class FakeSupabase:
    def __init__(self) -> None:
        self.variables = [
            {key: value for key, value in variable.items() if key != "evidence"}
            for variable in _ready_variables()
        ]
        self.evidence_rows = [
            evidence
            for variable in _ready_variables()
            for evidence in [
                {
                    **variable["evidence"][0],
                    "id": f"evidence-{variable['variable_key']}",
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "variable_resolution_id": variable["id"],
                    "legal_document_page_id": None,
                    "chunk_index": None,
                    "snippet_hash": "a" * 64,
                }
            ]
        ]
        self.lot_legal_data = _matched_lot_legal_data()
        self.lot_row: dict[str, object] | None = {
            "id": LOT_ID,
            "project_id": PROJECT_ID,
            "projects": {"organization_id": ORG_ID},
        }
        self.existing_case: dict[str, object] | None = None
        self.inserted_cases: list[dict[str, object]] = []
        self.updated_cases: list[dict[str, object]] = []

    def table(self, name: str) -> FakeSupabaseTable:
        return FakeSupabaseTable(self, name)

    def execute(self, table: FakeSupabaseTable):
        if table.name == "lots":
            return SimpleNamespace(data=self.lot_row)
        if table.name == "variable_resolutions":
            return SimpleNamespace(data=self.variables)
        if table.name == "lot_legal_data":
            return SimpleNamespace(data=self.lot_legal_data)
        if table.name == "document_evidence":
            return SimpleNamespace(data=self.evidence_rows)
        if table.name == "escritura_cases":
            if table.insert_payload is not None:
                row = {
                    "id": "00000000-0000-4000-8000-000000000099",
                    **table.insert_payload,
                }
                self.existing_case = row
                self.inserted_cases.append(row)
                return SimpleNamespace(data=[row])
            if table.update_payload is not None:
                row = {
                    **(self.existing_case or {}),
                    **table.update_payload,
                }
                self.existing_case = row
                self.updated_cases.append(row)
                return SimpleNamespace(data=[row])
            return SimpleNamespace(data=self.existing_case)
        raise AssertionError(f"Unexpected table {table.name}")


async def test_case_creation_persists_readiness_and_variable_evidence_snapshots():
    supabase = FakeSupabase()

    row = await create_escritura_case_snapshot(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        lot_id=LOT_ID,
        created_by=USER_ID,
        warning_acknowledged=True,
        supabase=supabase,
    )

    assert row["id"] == "00000000-0000-4000-8000-000000000099"
    assert row["case_status"] == "ready_for_minuta"
    assert row["readiness_status"] == "ready"
    assert row["created_by"] == USER_ID
    assert row["readiness_gates"]["warning_acknowledged"]["status"] == "ready"
    assert row["variable_snapshot"]["comprador.rut"]["value_text"] == "ok"
    assert row["evidence_snapshot"]["sii.pre_rol_lote"][0]["snippet"] == (
        "Evidencia para sii.pre_rol_lote"
    )
    assert supabase.inserted_cases == [row]


async def test_readiness_rejects_lot_outside_project_scope():
    supabase = FakeSupabase()
    supabase.lot_row = None

    try:
        await get_escritura_readiness(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_ID,
            warning_acknowledged=True,
            supabase=supabase,
        )
    except EscrituraReadinessScopeError as exc:
        assert "lot_id" in str(exc)
    else:
        raise AssertionError("readiness must reject lots outside project scope")


async def test_case_creation_refreshes_existing_active_case_snapshot():
    supabase = FakeSupabase()
    supabase.existing_case = {
        "id": "00000000-0000-4000-8000-000000000099",
        "organization_id": ORG_ID,
        "project_id": PROJECT_ID,
        "lot_id": LOT_ID,
        "case_status": "variables_pending",
        "readiness_status": "blocked",
        "variable_snapshot": {},
        "evidence_snapshot": {},
    }

    row = await create_escritura_case_snapshot(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        lot_id=LOT_ID,
        created_by=USER_ID,
        warning_acknowledged=True,
        supabase=supabase,
    )

    assert row["id"] == "00000000-0000-4000-8000-000000000099"
    assert row["case_status"] == "ready_for_minuta"
    assert row["readiness_status"] == "ready"
    assert supabase.inserted_cases == []
    assert supabase.updated_cases == [row]
