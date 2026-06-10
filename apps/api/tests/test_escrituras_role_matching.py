"""SDD 007 US4 tests for SII role matching by lot."""

from __future__ import annotations

from types import SimpleNamespace

from services.legal_role_matching import (
    LegalRoleMatchingError,
    ProjectLot,
    SiiRoleUnit,
    apply_manual_role_override,
    fetch_sii_role_units_from_variables,
    get_project_role_matching_inventory,
    match_sii_roles_to_lots,
    summarize_role_matches,
)


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_7_ID = "00000000-0000-4000-8000-000000000007"
LOT_8_ID = "00000000-0000-4000-8000-000000000008"
LOT_9_ID = "00000000-0000-4000-8000-000000000009"
LOT_29_ID = "00000000-0000-4000-8000-000000000029"
LOT_30_ID = "00000000-0000-4000-8000-000000000030"
SII_DOCUMENT_ID = "00000000-0000-4000-8000-000000000020"
SUPERSEDED_SII_DOCUMENT_ID = "00000000-0000-4000-8000-000000000021"
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
                    "Rol de avaluo en tramite numero 08179-00029 de la comuna de Teno"
                ),
                source_legal_document_id=SII_DOCUMENT_ID,
                raw={
                    "lot_number_normalized": "29",
                    "comuna": "Teno",
                    "role_matrix": "08179-00000",
                    "row_index": 1,
                    "parser": "sii_role_certificate_real_v1",
                },
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


def test_sii_unit_match_uses_extracted_lot_number_not_other_visible_numbers():
    matches = match_sii_roles_to_lots(
        lots=[
            _lot(LOT_7_ID, "7"),
            _lot(LOT_8_ID, "8"),
            _lot(LOT_9_ID, "9"),
        ],
        sii_units=[
            SiiRoleUnit(
                unit_name="GAONA 7 PARCELA 8 LT 9",
                role_matrix="00999-00001",
                pre_role="01234-00009",
                role_in_process_text=(
                    "Rol de avaluo en tramite numero 01234-00009 de la comuna de Pemuco"
                ),
                source_legal_document_id=SII_DOCUMENT_ID,
                raw={
                    "lot_number_normalized": "9",
                    "comuna": "Pemuco",
                    "role_matrix": "00999-00001",
                    "row_index": 7,
                    "parser": "sii_role_certificate_real_v1",
                },
            )
        ],
    )

    by_lot_number = {match.lot_number: match for match in matches}

    assert by_lot_number["9"].matching_status == "matched"
    assert by_lot_number["9"].sii_lot_number_normalized == "9"
    assert by_lot_number["9"].sii_pre_role == "01234-00009"
    assert by_lot_number["7"].matching_status == "missing"
    assert by_lot_number["8"].matching_status == "missing"
    assert by_lot_number["7"].sii_pre_role is None
    assert by_lot_number["8"].sii_pre_role is None


def test_sii_role_row_is_not_automatically_consumed_by_multiple_lots():
    matches = match_sii_roles_to_lots(
        lots=[
            _lot(LOT_29_ID, "29"),
            _lot(LOT_30_ID, "29"),
        ],
        sii_units=[
            SiiRoleUnit(
                unit_name="Lote 29",
                role_matrix="08179-00000",
                pre_role="08179-00029",
                role_in_process_text=(
                    "Rol de avaluo en tramite numero 08179-00029 de la comuna de Teno"
                ),
                source_legal_document_id=SII_DOCUMENT_ID,
                raw={
                    "lot_number_normalized": "29",
                    "comuna": "Teno",
                    "role_matrix": "08179-00000",
                    "row_index": 29,
                    "parser": "sii_role_certificate_real_v1",
                },
            )
        ],
    )

    assert [match.matching_status for match in matches] == ["ambiguous", "ambiguous"]
    assert all(match.role_status == "rol_en_tramite" for match in matches)
    assert all(len(match.candidates) == 1 for match in matches)
    assert all(
        match.candidates[0].unit.raw["row_index"] == 29
        for match in matches
    )


def test_ambiguous_sii_unit_match_keeps_competing_candidates_for_manual_review():
    matches = match_sii_roles_to_lots(
        lots=[_lot(LOT_29_ID, "29")],
        sii_units=[
            SiiRoleUnit(
                unit_name="Lote 29",
                pre_role="08179-00029-A",
                source_legal_document_id=SII_DOCUMENT_ID,
                raw={
                    "lot_number_normalized": "29",
                    "comuna": "Teno",
                    "row_index": 1,
                    "parser": "sii_role_certificate_real_v1",
                },
            ),
            SiiRoleUnit(
                unit_name="Unidad 29",
                pre_role="08179-00029-B",
                source_legal_document_id=SII_DOCUMENT_ID,
                raw={
                    "lot_number_normalized": "29",
                    "comuna": "Teno",
                    "row_index": 2,
                    "parser": "sii_role_certificate_real_v1",
                },
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


def test_tuple_sii_unit_match_preserves_lot_role_comuna_record():
    matches = match_sii_roles_to_lots(
        lots=[_lot(LOT_29_ID, "29")],
        sii_units=[
            SiiRoleUnit(
                unit_name="Lote 29",
                role_matrix="08179-00000",
                pre_role="08179-00029",
                role_in_process_text=(
                    "Rol de avaluo en tramite numero 08179-00029 de la comuna de Teno"
                ),
                source_legal_document_id=SII_DOCUMENT_ID,
                raw={
                    "lot_number_normalized": "29",
                    "comuna": "Teno",
                    "row_index": 12,
                    "parser": "sii_role_certificate_tuple_v1",
                },
            )
        ],
    )

    record = matches[0].to_lot_legal_data_record()

    assert matches[0].matching_status == "matched"
    assert matches[0].sii_comuna == "Teno"
    assert matches[0].sii_role_matrix == "08179-00000"
    
    assert record["sii_lot_number_normalized"] == "29"
    assert record["sii_comuna"] is None
    assert record["sii_role_matrix"] is None
    assert record["sii_role_in_process_text"] == (
        "Rol de avaluo en tramite numero 08179-00029 de la comuna de Teno"
    )
    assert record["sii_role_record"] == {
        "lot_number": "29",
        "role": "08179-00029",
        "comuna": "Teno",
        "role_matrix": "08179-00000",
        "row_index": 12,
        "parser": "sii_role_certificate_tuple_v1",
    }


def test_sii_unit_match_requires_comuna_and_parser_evidence():
    matches = match_sii_roles_to_lots(
        lots=[_lot(LOT_29_ID, "29"), _lot(LOT_30_ID, "30")],
        sii_units=[
            SiiRoleUnit(
                unit_name="Lote 29",
                pre_role="08179-00029",
                source_legal_document_id=SII_DOCUMENT_ID,
                raw={
                    "lot_number_normalized": "29",
                    "row_index": 12,
                    "parser": "sii_role_certificate_tuple_v1",
                },
            ),
            SiiRoleUnit(
                unit_name="Lote 30",
                pre_role="08179-00030",
                source_legal_document_id=SII_DOCUMENT_ID,
            )
        ],
    )

    assert [match.matching_status for match in matches] == ["missing", "missing"]
    assert all(match.role_status == "missing" for match in matches)
    assert all(
        match.to_lot_legal_data_record()["sii_pre_role"] is None
        for match in matches
    )


class FakeSupabaseTable:
    def __init__(self, supabase: "FakeSupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.filters: dict[str, object] = {}
        self.select_args: tuple[object, ...] = ()
        self.insert_payload: dict[str, object] | None = None
        self.upsert_payload: dict[str, object] | None = None
        self.on_conflict: str | None = None

    def select(self, *args):
        self.select_args = args
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
        self.project_upserts: list[dict[str, object]] = []
        self.review_decisions: list[dict[str, object]] = []

    def table(self, name: str) -> FakeSupabaseTable:
        return FakeSupabaseTable(self, name)

    def execute(self, table: FakeSupabaseTable):
        if table.name == "lots":
            if "projects.organization_id" in table.filters:
                assert table.filters == {
                    "id": LOT_29_ID,
                    "project_id": PROJECT_ID,
                    "projects.organization_id": ORG_ID,
                }
            else:
                assert table.filters == {
                    "id": LOT_29_ID,
                    "project_id": PROJECT_ID,
                }
            return SimpleNamespace(
                data={
                    "id": LOT_29_ID,
                    "project_id": PROJECT_ID,
                    "numero_lote": "29",
                }
            )
        if table.name == "lot_legal_data":
            assert table.on_conflict == "lot_id"
            assert table.upsert_payload is not None
            self.upserts.append(table.upsert_payload)
            return SimpleNamespace(data=[table.upsert_payload])
        if table.name == "project_legal_data":
            assert table.on_conflict == "project_id"
            assert table.upsert_payload is not None
            self.project_upserts.append(table.upsert_payload)
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
    
    # Verify lot_legal_data record does not store sii_role_matrix or sii_comuna (should be None)
    assert len(supabase.upserts) == 1
    assert supabase.upserts[0]["lot_id"] == LOT_29_ID
    assert supabase.upserts[0]["sii_role_matrix"] is None
    assert supabase.upserts[0]["sii_comuna"] is None
    assert supabase.upserts[0]["sii_pre_role"] == "08179-00029"
    
    # Verify project_legal_data record stores the shared matrix values
    assert len(supabase.project_upserts) == 1
    assert supabase.project_upserts[0]["project_id"] == PROJECT_ID
    assert supabase.project_upserts[0]["sii_role_matrix"] == "08179-00000"
    assert supabase.project_upserts[0]["sii_roles_source_legal_document_id"] == SII_DOCUMENT_ID

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
    def __init__(self, supabase: "FakeVariableSupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.filters: dict[str, object] = {}
        self.neq_filters: dict[str, object] = {}
        self.in_filters: dict[str, object] = {}
        self.order_column: str | None = None
        self.desc = False
        self.limit_count: int | None = None

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self.filters[str(column)] = value
        return self

    def neq(self, column, value):
        self.neq_filters[str(column)] = value
        return self

    def is_(self, column, value):
        # Para simplificar, si value es null, podemos manejarlo en el filtro
        self.filters[str(column)] = None if value == "null" else value
        return self

    def in_(self, column, values):
        self.in_filters[str(column)] = set(values)
        return self

    def order(self, column, desc=False):
        self.order_column = str(column)
        self.desc = bool(desc)
        return self

    def limit(self, count):
        self.limit_count = int(count)
        return self

    def single(self):
        return self

    def execute(self):
        rows = list(self.supabase.rows_by_table.get(self.name, []))
        rows = [
            row
            for row in rows
            if all(row.get(column) == value for column, value in self.filters.items())
            and all(row.get(column) != value for column, value in self.neq_filters.items())
        ]
        for column, values in self.in_filters.items():
            rows = [row for row in rows if row.get(column) in values]
        if self.order_column:
            rows.sort(
                key=lambda row: row.get(self.order_column) or 0,
                reverse=self.desc,
            )
        if self.limit_count is not None:
            rows = rows[: self.limit_count]
        return SimpleNamespace(data=rows)


class FakeVariableSupabase:
    def __init__(
        self,
        rows: list[dict[str, object]],
        *,
        documents: list[dict[str, object]] | None = None,
    ) -> None:
        self.rows_by_table = {
            "projects": [
                {
                    "id": PROJECT_ID,
                    "organization_id": ORG_ID,
                }
            ],
            "variable_resolutions": rows,
            "legal_documents": documents or [],
        }

    def table(self, name: str) -> FakeVariableSupabaseTable:
        assert name in self.rows_by_table
        return FakeVariableSupabaseTable(self, name)


class MissingProjectSiiColumnsError(Exception):
    code = "42703"
    message = "column project_legal_data.sii_comuna does not exist"

    def __str__(self) -> str:
        return self.message


class FakeRoleInventorySupabaseTable:
    def __init__(self, supabase: "FakeRoleInventorySupabase", name: str) -> None:
        self.supabase = supabase
        self.name = name
        self.filters: dict[str, object] = {}
        self.neq_filters: dict[str, object] = {}
        self.in_filters: dict[str, set[object]] = {}
        self.order_column: str | None = None
        self.desc = False
        self.limit_count: int | None = None
        self.upsert_payload: dict[str, object] | list[dict[str, object]] | None = None
        self.on_conflict: str | None = None
        self.single_result = False

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self.filters[str(column)] = value
        return self

    def neq(self, column, value):
        self.neq_filters[str(column)] = value
        return self

    def in_(self, column, values):
        self.in_filters[str(column)] = set(values)
        return self

    def order(self, column, desc=False):
        self.order_column = str(column)
        self.desc = bool(desc)
        return self

    def limit(self, count):
        self.limit_count = int(count)
        return self

    def maybe_single(self):
        self.single_result = True
        return self

    def single(self):
        self.single_result = True
        return self

    def upsert(self, payload, *, on_conflict):
        self.upsert_payload = payload
        self.on_conflict = on_conflict
        return self

    def execute(self):
        return self.supabase.execute(self)


class FakeRoleInventorySupabase:
    def __init__(self, *, missing_project_sii_columns: bool = False) -> None:
        self.missing_project_sii_columns = missing_project_sii_columns
        self.project_legal_data: dict[str, object] = {}
        self.rows_by_table: dict[str, list[dict[str, object]]] = {
            "projects": [{"id": PROJECT_ID, "organization_id": ORG_ID}],
            "lots": [
                {
                    "id": LOT_29_ID,
                    "project_id": PROJECT_ID,
                    "numero_lote": "29",
                    "projects.organization_id": ORG_ID,
                }
            ],
            "legal_documents": [
                {
                    "id": SII_DOCUMENT_ID,
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "lot_id": None,
                    "document_type": "certificado_roles_sii",
                    "source_field": "doc_roles",
                    "storage_bucket": "project-files",
                    "storage_path": f"{PROJECT_ID}/legal/roles-sii-v2.pdf",
                    "original_filename": "Roles SII vigente.pdf",
                    "mime_type": "application/pdf",
                    "file_size_bytes": 223456,
                    "sha256_hash": "b" * 64,
                    "version_number": 2,
                    "upload_source": "project_documents",
                    "uploaded_by": USER_ID,
                    "extraction_status": "variables_proposed",
                    "superseded_by": None,
                }
            ],
            "variable_resolutions": [
                {
                    "id": "new-unit",
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "variable_key": "sii.unidad_nombre",
                    "value_text": "Lote 29",
                    "source_ref": {
                        "unit_index": 1,
                        "legal_document_id": SII_DOCUMENT_ID,
                        "lot_number_normalized": "29",
                        "comuna": "Teno",
                        "role_matrix": "08179-00000",
                        "row_index": 1,
                        "parser": "sii_role_certificate_real_v1",
                    },
                    "state": "proposed",
                },
                {
                    "id": "new-pre-role",
                    "organization_id": ORG_ID,
                    "project_id": PROJECT_ID,
                    "variable_key": "sii.pre_rol_lote",
                    "value_text": "08179-00029",
                    "source_ref": {
                        "unit_index": 1,
                        "legal_document_id": SII_DOCUMENT_ID,
                        "lot_number_normalized": "29",
                        "comuna": "Teno",
                        "role_matrix": "08179-00000",
                        "row_index": 1,
                        "parser": "sii_role_certificate_real_v1",
                    },
                    "state": "proposed",
                },
            ],
            "lot_legal_data": [],
        }

    def table(self, name: str) -> FakeRoleInventorySupabaseTable:
        assert name in self.rows_by_table or name == "project_legal_data"
        return FakeRoleInventorySupabaseTable(self, name)

    def execute(self, table: FakeRoleInventorySupabaseTable):
        if table.name == "project_legal_data":
            if self.missing_project_sii_columns:
                raise MissingProjectSiiColumnsError()
            if table.upsert_payload is not None:
                assert isinstance(table.upsert_payload, dict)
                self.project_legal_data.update(table.upsert_payload)
                return SimpleNamespace(data=[dict(self.project_legal_data)])
            return SimpleNamespace(data=dict(self.project_legal_data) or None)

        if table.name == "lot_legal_data" and table.upsert_payload is not None:
            payloads = (
                table.upsert_payload
                if isinstance(table.upsert_payload, list)
                else [table.upsert_payload]
            )
            assert table.on_conflict == "lot_id"
            self.rows_by_table["lot_legal_data"] = [dict(payload) for payload in payloads]
            return SimpleNamespace(data=self.rows_by_table["lot_legal_data"])

        rows = list(self.rows_by_table.get(table.name, []))
        rows = [
            row
            for row in rows
            if all(row.get(column) == value for column, value in table.filters.items())
            and all(row.get(column) != value for column, value in table.neq_filters.items())
        ]
        for column, values in table.in_filters.items():
            rows = [row for row in rows if row.get(column) in values]
        if table.order_column:
            rows.sort(
                key=lambda row: row.get(table.order_column) or 0,
                reverse=table.desc,
            )
        if table.limit_count is not None:
            rows = rows[: table.limit_count]
        if table.single_result:
            return SimpleNamespace(data=rows[0] if rows else None)
        return SimpleNamespace(data=rows)


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
        ],
        documents=[
            {
                "id": SII_DOCUMENT_ID,
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "lot_id": None,
                "document_type": "certificado_roles_sii",
                "source_field": "doc_roles",
                "storage_bucket": "project-files",
                "storage_path": f"{PROJECT_ID}/legal/roles-sii-v2.pdf",
                "original_filename": "Roles SII vigente.pdf",
                "mime_type": "application/pdf",
                "file_size_bytes": 223456,
                "sha256_hash": "b" * 64,
                "version_number": 2,
                "upload_source": "project_documents",
                "uploaded_by": USER_ID,
                "extraction_status": "variables_proposed",
                "superseded_by": None,
            }
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


async def test_fetch_sii_units_defaults_to_active_latest_certificate_variables():
    supabase = FakeVariableSupabase(
        [
            {
                "id": "old-unit",
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_key": "sii.unidad_nombre",
                "value_text": "Lote 29",
                "source_ref": {
                    "unit_index": 1,
                    "legal_document_id": SUPERSEDED_SII_DOCUMENT_ID,
                    "lot_number_normalized": "29",
                    "comuna": "Teno",
                    "row_index": 1,
                    "parser": "sii_role_certificate_real_v1",
                },
            },
            {
                "id": "old-pre-role",
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_key": "sii.pre_rol_lote",
                "value_text": "99999-00029",
                "source_ref": {
                    "unit_index": 1,
                    "legal_document_id": SUPERSEDED_SII_DOCUMENT_ID,
                    "lot_number_normalized": "29",
                    "comuna": "Teno",
                    "row_index": 1,
                    "parser": "sii_role_certificate_real_v1",
                },
            },
            {
                "id": "new-unit",
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_key": "sii.unidad_nombre",
                "value_text": "Lote 29",
                "source_ref": {
                    "unit_index": 1,
                    "legal_document_id": SII_DOCUMENT_ID,
                    "lot_number_normalized": "29",
                    "comuna": "Teno",
                    "row_index": 1,
                    "parser": "sii_role_certificate_real_v1",
                },
            },
            {
                "id": "new-pre-role",
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_key": "sii.pre_rol_lote",
                "value_text": "08179-00029",
                "source_ref": {
                    "unit_index": 1,
                    "legal_document_id": SII_DOCUMENT_ID,
                    "lot_number_normalized": "29",
                    "comuna": "Teno",
                    "row_index": 1,
                    "parser": "sii_role_certificate_real_v1",
                },
            },
        ],
        documents=[
            {
                "id": SUPERSEDED_SII_DOCUMENT_ID,
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "lot_id": None,
                "document_type": "certificado_roles_sii",
                "source_field": "doc_roles",
                "storage_bucket": "project-files",
                "storage_path": f"{PROJECT_ID}/legal/roles-sii-v1.pdf",
                "original_filename": "Roles SII antiguo.pdf",
                "mime_type": "application/pdf",
                "file_size_bytes": 123456,
                "sha256_hash": "a" * 64,
                "version_number": 1,
                "upload_source": "project_documents",
                "uploaded_by": USER_ID,
                "extraction_status": "superseded",
                "superseded_by": SII_DOCUMENT_ID,
            },
            {
                "id": SII_DOCUMENT_ID,
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "lot_id": None,
                "document_type": "certificado_roles_sii",
                "source_field": "doc_roles",
                "storage_bucket": "project-files",
                "storage_path": f"{PROJECT_ID}/legal/roles-sii-v2.pdf",
                "original_filename": "Roles SII vigente.pdf",
                "mime_type": "application/pdf",
                "file_size_bytes": 223456,
                "sha256_hash": "b" * 64,
                "version_number": 2,
                "upload_source": "project_documents",
                "uploaded_by": USER_ID,
                "extraction_status": "variables_proposed",
                "superseded_by": None,
            },
        ],
    )

    units = await fetch_sii_role_units_from_variables(
        PROJECT_ID,
        ORG_ID,
        supabase=supabase,
    )

    assert len(units) == 1
    assert units[0].source_legal_document_id == SII_DOCUMENT_ID
    assert units[0].pre_role == "08179-00029"


async def test_manual_override_derives_role_in_process_text_on_pre_role_or_comuna_change():
    supabase = FakeSupabase()

    record = await apply_manual_role_override(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        lot_id=LOT_29_ID,
        sii_unit_name="Lote 29",
        sii_role_matrix="08179-00000",
        sii_pre_role="08179-00029",
        sii_comuna="Teno",
        sii_role_in_process_text=None,
        role_status="rol_en_tramite",
        reason="Validado por certificado SII y comuna",
        source_legal_document_id=SII_DOCUMENT_ID,
        reviewed_by=USER_ID,
        supabase=supabase,
    )

    assert record["sii_role_in_process_text"] == "Rol de avaluo en tramite numero 08179-00029 de la comuna de Teno"


async def test_manual_override_rejects_stale_client_role_in_process_text():
    supabase = FakeSupabase()

    try:
        await apply_manual_role_override(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            lot_id=LOT_29_ID,
            sii_unit_name="Lote 29",
            sii_role_matrix="08179-00000",
            sii_pre_role="08179-00029",
            sii_comuna="Teno",
            sii_role_in_process_text="Rol de avaluo en tramite numero 99999-99999 de la comuna de Pemuco",
            role_status="rol_en_tramite",
            reason="Intento de override con texto inconsistente",
            source_legal_document_id=SII_DOCUMENT_ID,
            reviewed_by=USER_ID,
            supabase=supabase,
        )
    except LegalRoleMatchingError as exc:
        assert "stale" in str(exc).lower() or "mismatch" in str(exc).lower() or "inconsistent" in str(exc).lower()
    else:
        raise AssertionError("Expected LegalRoleMatchingError for stale client text mismatch")


# ==============================================================================
# Phase 12 Regression Tests: Matriz/Lote Source Of Truth Alignment
# ==============================================================================

import pytest


def test_active_certificado_roles_sii_implies_rol_en_tramite():
    """T097: Verify that having an active certificado de roles SII implies a 'rol_en_tramite' status."""
    lot = _lot(LOT_7_ID, "7")
    unit = SiiRoleUnit(
        unit_name="Lote 7",
        pre_role="08179-00007",
        source_legal_document_id=SII_DOCUMENT_ID,
        raw={
            "lot_number_normalized": "7",
            "comuna": "Teno",
            "parser": "sii_role_certificate_real_v1",
        },
    )
    matches = match_sii_roles_to_lots(lots=[lot], sii_units=[unit])
    assert len(matches) == 1
    assert matches[0].role_status == "rol_en_tramite"
    assert matches[0].matching_status == "matched"


def test_shared_sii_comuna_and_sii_role_matrix_across_sibling_lots():
    """T097: Verify that sii_comuna and sii_role_matrix are shared across sibling lots from the same project certificate."""
    lots = [
        _lot(LOT_7_ID, "7"),
        _lot(LOT_8_ID, "8"),
    ]
    sii_units = [
        SiiRoleUnit(
            unit_name="Lote 7",
            role_matrix="08179-00000",
            pre_role="08179-00007",
            source_legal_document_id=SII_DOCUMENT_ID,
            raw={
                "lot_number_normalized": "7",
                "comuna": "Teno",
                "parser": "sii_role_certificate_real_v1",
            },
        ),
        SiiRoleUnit(
            unit_name="Lote 8",
            role_matrix="08179-00000",
            pre_role="08179-00008",
            source_legal_document_id=SII_DOCUMENT_ID,
            raw={
                "lot_number_normalized": "8",
                "comuna": "Teno",
                "parser": "sii_role_certificate_real_v1",
            },
        ),
    ]
    matches = match_sii_roles_to_lots(lots, sii_units)
    assert len(matches) == 2
    match_7 = next(m for m in matches if m.lot_id == LOT_7_ID)
    match_8 = next(m for m in matches if m.lot_id == LOT_8_ID)

    assert match_7.sii_comuna == "Teno"
    assert match_8.sii_comuna == "Teno"
    assert match_7.sii_role_matrix == "08179-00000"
    assert match_8.sii_role_matrix == "08179-00000"


def test_unique_sii_pre_role_per_lot_id():
    """T097: Verify that each lot_id resolves a unique sii_pre_role from the matching results."""
    lots = [
        _lot(LOT_7_ID, "7"),
        _lot(LOT_8_ID, "8"),
    ]
    sii_units = [
        SiiRoleUnit(
            unit_name="Lote 7",
            pre_role="08179-00007",
            source_legal_document_id=SII_DOCUMENT_ID,
            raw={
                "lot_number_normalized": "7",
                "comuna": "Teno",
                "parser": "sii_role_certificate_real_v1",
            },
        ),
        SiiRoleUnit(
            unit_name="Lote 8",
            pre_role="08179-00008",
            source_legal_document_id=SII_DOCUMENT_ID,
            raw={
                "lot_number_normalized": "8",
                "comuna": "Teno",
                "parser": "sii_role_certificate_real_v1",
            },
        ),
    ]
    matches = match_sii_roles_to_lots(lots, sii_units)
    assert len(matches) == 2
    match_7 = next(m for m in matches if m.lot_id == LOT_7_ID)
    match_8 = next(m for m in matches if m.lot_id == LOT_8_ID)

    assert match_7.sii_pre_role == "08179-00007"
    assert match_8.sii_pre_role == "08179-00008"
    assert match_7.sii_pre_role != match_8.sii_pre_role


@pytest.mark.asyncio
async def test_no_role_assumptions_when_no_active_certificado_exists():
    """T097: Verify that no roles are assumed when no active certificado de roles SII exists."""
    # Simulation: No active document exists in the project scope, only a superseded one.
    # We populate the variables for the superseded document.
    supabase = FakeVariableSupabase(
        rows=[
            {
                "id": "old-unit",
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_key": "sii.unidad_nombre",
                "value_text": "Lote 29",
                "source_ref": {
                    "unit_index": 1,
                    "legal_document_id": SUPERSEDED_SII_DOCUMENT_ID,
                },
                "state": "proposed",
            },
            {
                "id": "old-pre-role",
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "variable_key": "sii.pre_rol_lote",
                "value_text": "99999-00029",
                "source_ref": {
                    "unit_index": 1,
                    "legal_document_id": SUPERSEDED_SII_DOCUMENT_ID,
                },
                "state": "proposed",
            },
        ],
        documents=[
            {
                "id": SUPERSEDED_SII_DOCUMENT_ID,
                "organization_id": ORG_ID,
                "project_id": PROJECT_ID,
                "document_type": "certificado_roles_sii",
                "extraction_status": "superseded",
                "superseded_by": "some-other-id",
            }
        ],
    )

    # When fetching roles with no active certificate, it should return an empty list of SiiRoleUnits
    units = await fetch_sii_role_units_from_variables(
        PROJECT_ID,
        ORG_ID,
        supabase=supabase,
    )

    assert len(units) == 0


@pytest.mark.asyncio
async def test_role_inventory_keeps_roles_visible_when_project_sii_columns_are_missing():
    """The role panel must not 500 while the project-level SII migration is pending."""
    supabase = FakeRoleInventorySupabase(missing_project_sii_columns=True)

    inventory = await get_project_role_matching_inventory(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        supabase=supabase,
    )

    assert inventory["summary"]["matched"] == 1
    assert inventory["summary"]["missing"] == 0
    assert inventory["certificate_summary"]["source_legal_document_ids"] == [
        SII_DOCUMENT_ID
    ]
    assert inventory["certificate_summary"]["role_matrices"] == ["08179-00000"]

    row = inventory["lots"][0]
    assert row["lot_id"] == LOT_29_ID
    assert row["lot_number"] == "29"
    assert row["matching_status"] == "matched"
    assert row["role_status"] == "rol_en_tramite"
    assert row["sii_lot_number_normalized"] == "29"
    assert row["sii_pre_role"] == "08179-00029"
    assert row["sii_comuna"] == "Teno"
    assert row["sii_role_matrix"] == "08179-00000"
    assert row["source_document_label"] == "Certificado de roles SII"


@pytest.mark.asyncio
async def test_role_inventory_returns_fresh_shared_values_on_first_recompute():
    """Shared comuna/matriz values must appear in the first API response, not only after reload."""
    supabase = FakeRoleInventorySupabase()

    inventory = await get_project_role_matching_inventory(
        project_id=PROJECT_ID,
        organization_id=ORG_ID,
        supabase=supabase,
    )

    row = inventory["lots"][0]
    assert row["matching_status"] == "matched"
    assert row["sii_comuna"] == "Teno"
    assert row["sii_role_matrix"] == "08179-00000"
    assert supabase.project_legal_data["sii_comuna"] == "Teno"
    assert supabase.project_legal_data["sii_role_matrix"] == "08179-00000"
