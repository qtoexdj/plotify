"""SDD 007 US4 tests for SII role matching by lot."""

from __future__ import annotations

from types import SimpleNamespace

from services.legal_role_matching import (
    LegalRoleMatchingError,
    ProjectLot,
    SiiRoleUnit,
    apply_manual_role_override,
    fetch_sii_role_units_from_variables,
    match_sii_roles_to_lots,
    summarize_role_matches,
)


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_29_ID = "00000000-0000-4000-8000-000000000029"
LOT_30_ID = "00000000-0000-4000-8000-000000000030"
SII_DOCUMENT_ID = "00000000-0000-4000-8000-000000000020"
USER_ID = "00000000-0000-4000-8000-000000000005"


def _lot(lot_id: str, lot_number: str) -> ProjectLot:
    return ProjectLot(
        id=lot_id,
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        lot_number=lot_number,
    )


def test_exact_sii_unit_match_assigns_rol_en_tramite_to_lot():
    matches = match_sii_roles_to_lots(
        lots=[_lot(LOT_29_ID, "29")],
        sii_units=[
            SiiRoleUnit(
                unit_name="Lote 29",
                role_matrix="08179-00000",
                pre_role="08179-00029",
                role_in_process_text=(
                    "Rol de avaluo en tramite numero 08179-00029"
                ),
                source_legal_document_id=SII_DOCUMENT_ID,
            )
        ],
    )

    assert len(matches) == 1
    match = matches[0]
    assert match.lot_id == LOT_29_ID
    assert match.sii_unit_name == "Lote 29"
    assert match.sii_role_matrix == "08179-00000"
    assert match.sii_pre_role == "08179-00029"
    assert match.role_status == "rol_en_tramite"
    assert match.matching_status == "matched"
    assert match.matching_score == 1.0
    assert match.source_legal_document_id == SII_DOCUMENT_ID
    assert summarize_role_matches(matches) == {
        "ambiguous": 0,
        "manual_override": 0,
        "matched": 1,
        "missing": 0,
    }


def test_ambiguous_sii_unit_match_keeps_competing_candidates_for_manual_review():
    matches = match_sii_roles_to_lots(
        lots=[_lot(LOT_29_ID, "29")],
        sii_units=[
            SiiRoleUnit(
                unit_name="Lote 29",
                pre_role="08179-00029-A",
                source_legal_document_id=SII_DOCUMENT_ID,
            ),
            SiiRoleUnit(
                unit_name="Unidad 29",
                pre_role="08179-00029-B",
                source_legal_document_id=SII_DOCUMENT_ID,
            ),
        ],
    )

    match = matches[0]
    assert match.matching_status == "ambiguous"
    assert match.role_status == "rol_en_tramite"
    assert match.matching_score == 1.0
    assert {candidate.unit.unit_name for candidate in match.candidates} == {
        "Lote 29",
        "Unidad 29",
    }
    assert {candidate.unit.pre_role for candidate in match.candidates} == {
        "08179-00029-A",
        "08179-00029-B",
    }
    assert summarize_role_matches(matches)["ambiguous"] == 1


def test_missing_sii_unit_match_does_not_silently_assign_role():
    matches = match_sii_roles_to_lots(
        lots=[_lot(LOT_29_ID, "29"), _lot(LOT_30_ID, "30")],
        sii_units=[
            SiiRoleUnit(
                unit_name="Lote 44",
                pre_role="08179-00044",
                source_legal_document_id=SII_DOCUMENT_ID,
            )
        ],
    )

    assert [match.matching_status for match in matches] == ["missing", "missing"]
    assert [match.role_status for match in matches] == ["missing", "missing"]
    assert all(match.sii_unit_name is None for match in matches)
    assert all(match.matching_score is None for match in matches)
    assert summarize_role_matches(matches) == {
        "ambiguous": 0,
        "manual_override": 0,
        "matched": 0,
        "missing": 2,
    }


class FakeSupabaseTable:
    def __init__(self, supabase: "FakeSupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.filters: dict[str, object] = {}
        self.insert_payload: dict[str, object] | None = None
        self.upsert_payload: dict[str, object] | None = None
        self.on_conflict: str | None = None

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self.filters[str(column)] = value
        return self

    def maybe_single(self):
        return self

    def insert(self, payload):
        self.insert_payload = payload
        return self

    def upsert(self, payload, *, on_conflict):
        self.upsert_payload = payload
        self.on_conflict = on_conflict
        return self

    def execute(self):
        return self.supabase.execute(self)


class FakeSupabase:
    def __init__(self) -> None:
        self.upserts: list[dict[str, object]] = []
        self.review_decisions: list[dict[str, object]] = []

    def table(self, name: str) -> FakeSupabaseTable:
        return FakeSupabaseTable(self, name)

    def execute(self, table: FakeSupabaseTable):
        if table.name == "lots":
            assert table.filters == {
                "id": LOT_29_ID,
                "project_id": PROJECT_ID,
                "projects.organization_id": ORG_ID,
            }
            return SimpleNamespace(data={"id": LOT_29_ID, "project_id": PROJECT_ID})
        if table.name == "lot_legal_data":
            assert table.on_conflict == "lot_id"
            assert table.upsert_payload is not None
            self.upserts.append(table.upsert_payload)
            return SimpleNamespace(data=[table.upsert_payload])
        if table.name == "legal_review_decisions":
            assert table.insert_payload is not None
            self.review_decisions.append(table.insert_payload)
            return SimpleNamespace(data={**table.insert_payload})
        raise AssertionError(f"Unexpected table {table.name}")


async def test_manual_override_persists_reviewed_lot_legal_data():
    supabase = FakeSupabase()

    record = await apply_manual_role_override(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        lot_id=LOT_29_ID,
        sii_unit_name="Lote 29",
        sii_role_matrix="08179-00000",
        sii_pre_role="08179-00029",
        sii_role_in_process_text="Rol de avaluo en tramite numero 08179-00029",
        role_status="rol_en_tramite",
        reason="Validado por certificado SII y revision legal",
        source_legal_document_id=SII_DOCUMENT_ID,
        reviewed_by=USER_ID,
        supabase=supabase,
    )

    assert record["organization_id"] == ORG_ID
    assert record["project_id"] == PROJECT_ID
    assert record["lot_id"] == LOT_29_ID
    assert record["sii_unit_name"] == "Lote 29"
    assert record["sii_role_matrix"] == "08179-00000"
    assert record["sii_pre_role"] == "08179-00029"
    assert record["role_status"] == "rol_en_tramite"
    assert record["matching_status"] == "manual_override"
    assert record["matching_score"] == 1.0
    assert record["source_legal_document_id"] == SII_DOCUMENT_ID
    assert record["reviewed_by"] == USER_ID
    assert record["reviewed_at"]
    assert supabase.upserts == [record]
    assert supabase.review_decisions[0]["decision_type"] == "manual_override"
    assert supabase.review_decisions[0]["decision_status"] == "approved"
    assert supabase.review_decisions[0]["reason"] == (
        "Validado por certificado SII y revision legal"
    )
    assert supabase.review_decisions[0]["decided_by"] == USER_ID


async def test_manual_override_requires_reviewer_for_auditability():
    supabase = FakeSupabase()

    try:
        await apply_manual_role_override(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_29_ID,
            sii_unit_name="Lote 29",
            role_status="rol_en_tramite",
            reason="Validado por certificado SII",
            sii_pre_role="08179-00029",
            supabase=supabase,
        )
    except LegalRoleMatchingError as exc:
        assert "reviewed_by" in str(exc)
    else:
        raise AssertionError("manual override without reviewer should fail")

    assert supabase.upserts == []
    assert supabase.review_decisions == []


class FakeVariableSupabaseTable:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows
        self.filters: dict[str, object] = {}
        self.in_filters: dict[str, object] = {}

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self.filters[str(column)] = value
        return self

    def in_(self, column, values):
        self.in_filters[str(column)] = set(values)
        return self

    def execute(self):
        rows = [
            row
            for row in self.rows
            if all(row.get(column) == value for column, value in self.filters.items())
        ]
        for column, values in self.in_filters.items():
            rows = [row for row in rows if row.get(column) in values]
        return SimpleNamespace(data=rows)


class FakeVariableSupabase:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def table(self, name: str) -> FakeVariableSupabaseTable:
        assert name == "variable_resolutions"
        return FakeVariableSupabaseTable(self.rows)


async def test_fetch_sii_units_preserves_source_legal_document_id_from_source_ref():
    supabase = FakeVariableSupabase(
        [
            {
                "id": "var-unit",
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_key": "sii.unidad_nombre",
                "value_text": "Lote 29",
                "source_ref": {
                    "unit_index": 1,
                    "legal_document_id": SII_DOCUMENT_ID,
                },
            },
            {
                "id": "var-pre-role",
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_key": "sii.pre_rol_lote",
                "value_text": "08179-00029",
                "source_ref": {
                    "unit_index": 1,
                    "legal_document_id": SII_DOCUMENT_ID,
                },
            },
        ]
    )

    units = await fetch_sii_role_units_from_variables(
        PROJECT_ID,
        ORG_ID,
        supabase=supabase,
    )

    assert len(units) == 1
    assert units[0].unit_name == "Lote 29"
    assert units[0].pre_role == "08179-00029"
    assert units[0].source_legal_document_id == SII_DOCUMENT_ID
