"""SDD 007 US2 tests for legal variable extraction proposals and evidence."""

from __future__ import annotations

from services.legal_variable_resolution import (
    ClassifiedVariableProposal,
    LegalDocumentPageInput,
    LegalVariableResolutionService,
    VariableEvidenceInput,
    VariableProposalInput,
    resolve_document_variables,
)


ORG_ID = "00000000-0000-4000-8000-000000000001"
PROJECT_ID = "00000000-0000-4000-8000-000000000002"
LOT_ID = "00000000-0000-4000-8000-000000000003"
DOMINIO_DOCUMENT_ID = "00000000-0000-4000-8000-000000000010"
DOMINIO_PAGE_ID = "00000000-0000-4000-8000-000000000011"
SII_DOCUMENT_ID = "00000000-0000-4000-8000-000000000020"
SII_PAGE_ID = "00000000-0000-4000-8000-000000000021"
PLANO_DOCUMENT_ID = "00000000-0000-4000-8000-000000000030"
PLANO_PAGE_ID = "00000000-0000-4000-8000-000000000031"


def _evidence(
    *,
    legal_document_id: str,
    legal_document_page_id: str,
    snippet: str,
    confidence: float,
) -> VariableEvidenceInput:
    return VariableEvidenceInput(
        legal_document_id=legal_document_id,
        legal_document_page_id=legal_document_page_id,
        chunk_index=0,
        snippet=snippet,
        confidence=confidence,
    )





def test_sii_roles_sample_preserves_certificate_metadata_and_lot_scope():
    service = LegalVariableResolutionService()
    evidence = _evidence(
        legal_document_id=SII_DOCUMENT_ID,
        legal_document_page_id=SII_PAGE_ID,
        snippet="Lote 29 Rol matriz 123-45 Rol de avaluo en tramite PR-29",
        confidence=0.88,
    )
    proposals = (
        VariableProposalInput(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            variable_key="sii.certificado_asignacion_roles_numero",
            value_text="CAR-2026-001",
            source_ref={"document_type": "certificado_roles_sii"},
            confidence=0.88,
            extractor_name="sii_roles_rules_v1",
            evidence=(evidence,),
        ),
        VariableProposalInput(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            variable_key="sii.unidad_nombre",
            value_text="Lote 29",
            lot_id=LOT_ID,
            source_ref={"document_type": "certificado_roles_sii"},
            confidence=0.88,
            extractor_name="sii_roles_rules_v1",
            evidence=(evidence,),
        ),
        VariableProposalInput(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            variable_key="sii.rol_matriz",
            value_text="123-45",
            lot_id=LOT_ID,
            source_ref={"document_type": "certificado_roles_sii"},
            confidence=0.88,
            extractor_name="sii_roles_rules_v1",
            evidence=(evidence,),
        ),
        VariableProposalInput(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            variable_key="sii.pre_rol_lote",
            value_text="PR-29",
            lot_id=LOT_ID,
            source_ref={"document_type": "certificado_roles_sii"},
            confidence=0.88,
            extractor_name="sii_roles_rules_v1",
            evidence=(evidence,),
        ),
    )

    classified = service.classify_proposals(proposals)

    assert [item.classification for item in classified] == [
        "proposed",
        "proposed",
        "proposed",
        "proposed",
    ]
    assert classified[0].proposal.lot_id is None
    assert {item.proposal.lot_id for item in classified[1:]} == {LOT_ID}
    assert {item.proposal.variable_group for item in classified} == {"sii"}
    assert all(
        item.proposal.source_ref["document_type"] == "certificado_roles_sii"
        for item in classified
    )
    assert all(item.proposal.evidence[0].legal_document_page_id == SII_PAGE_ID for item in classified)


def test_sii_roles_rules_extract_certificate_metadata_and_unit_pre_role_values():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=SII_PAGE_ID,
        legal_document_id=SII_DOCUMENT_ID,
        page_number=1,
        text_content=(
            "Certificado de Asignacion de Roles numero CAR-2026-001. "
            "Fecha de emision 04-06-2026. Solicitud F2118 998877. "
            "Comuna TENO. "
            "Rol matriz 123-45. Unidad Lote 29 Rol de avaluo en tramite "
            "08179-00029."
        ),
    )

    classified = service.extract_sii_roles_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=SII_DOCUMENT_ID,
        pages=(page,),
    )
    by_key = {item.proposal.variable_key: item for item in classified}

    assert by_key["sii.certificado_asignacion_roles_numero"].proposal.value_text == (
        "CAR-2026-001"
    )
    assert by_key["sii.certificado_fecha_emision"].proposal.value_text == "04-06-2026"
    assert by_key["sii.solicitud_numero"].proposal.value_text == "998877"
    assert by_key["sii.rol_matriz"].proposal.value_text == "123-45"
    assert by_key["sii.unidad_nombre"].proposal.value_text == "Unidad Lote 29"
    assert by_key["sii.pre_rol_lote"].proposal.value_text == "08179-00029"
    assert by_key["sii.rol_avaluo_en_tramite_texto"].proposal.value_text == (
        "Rol de avaluo en tramite numero 08179-00029 de la comuna de TENO"
    )
    assert all(
        item.classification == "proposed"
        for item in by_key.values()
    )
    assert all(
        item.proposal.extractor_name == "sii_roles_rules_v1"
        for item in by_key.values()
    )
    assert all(
        item.proposal.source_ref["document_type"] == "certificado_roles_sii"
        for item in by_key.values()
    )
    assert by_key["sii.unidad_nombre"].proposal.source_ref["unit_index"] == 1
    assert all(
        item.proposal.evidence[0].legal_document_page_id == SII_PAGE_ID
        for item in by_key.values()
    )


def test_sii_roles_rules_extract_sii_assigned_role_rows_across_pages():
    service = LegalVariableResolutionService()
    pages = (
        LegalDocumentPageInput(
            id=SII_PAGE_ID,
            legal_document_id=SII_DOCUMENT_ID,
            page_number=1,
            text_content=(
                "Comuna TENO\n"
                "CANTIDAD DE\n"
                "UNIDADES\n"
                "4\n"
                "Rol Matriz 00067-00023\n"
                "DIRECCION O NOMBRE DE LA UNIDAD N ROL DE AVALUO ASIGNADO\n"
                "LOTE 1 SECTOR EL CONDOR 08179-00001\n"
                "LOTE 2 SECTOR EL CONDOR 08179-00002\n"
            ),
        ),
        LegalDocumentPageInput(
            id="00000000-0000-4000-8000-000000000022",
            legal_document_id=SII_DOCUMENT_ID,
            page_number=2,
            text_content=(
                "LOTE 3 SECTOR EL CONDOR 08179-00003\n"
                "LOTE 4 SECTOR EL CONDOR 08179-00004\n"
            ),
        ),
    )

    classified = service.extract_sii_roles_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=SII_DOCUMENT_ID,
        pages=pages,
        required_variable_keys=("sii.unidad_nombre", "sii.pre_rol_lote"),
    )

    unit_proposals = [
        item.proposal
        for item in classified
        if item.proposal.variable_key == "sii.unidad_nombre"
    ]
    pre_role_proposals = [
        item.proposal
        for item in classified
        if item.proposal.variable_key == "sii.pre_rol_lote"
    ]

    assert [proposal.value_text for proposal in unit_proposals] == [
        "LOTE 1 SECTOR EL CONDOR",
        "LOTE 2 SECTOR EL CONDOR",
        "LOTE 3 SECTOR EL CONDOR",
        "LOTE 4 SECTOR EL CONDOR",
    ]
    assert [proposal.value_text for proposal in pre_role_proposals] == [
        "08179-00001",
        "08179-00002",
        "08179-00003",
        "08179-00004",
    ]
    assert [proposal.source_ref["unit_index"] for proposal in unit_proposals] == [1, 2, 3, 4]
    assert all(proposal.source_ref["declared_unit_count"] == 4 for proposal in unit_proposals)
    assert all(proposal.source_ref["extracted_unit_count"] == 4 for proposal in unit_proposals)
    assert all(proposal.source_ref["unit_count_matches"] is True for proposal in unit_proposals)
    assert all(
        item.classification == "proposed"
        for item in classified
        if item.proposal.variable_key in {"sii.unidad_nombre", "sii.pre_rol_lote"}
    )


def test_sii_roles_rules_extract_complete_lot_role_comuna_tuples_with_evidence():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=SII_PAGE_ID,
        legal_document_id=SII_DOCUMENT_ID,
        page_number=1,
        text_content=(
            "DIRECCION O NOMBRE DE LA UNIDAD N ROL DE AVALUO ASIGNADO COMUNA\n"
            "LOTE 29 08179-00029 TENO\n"
            "LOTE 30 08179-00030 SAN CLEMENTE\n"
        ),
    )

    classified = service.extract_sii_roles_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=SII_DOCUMENT_ID,
        pages=(page,),
        required_variable_keys=("sii.unidad_nombre", "sii.pre_rol_lote"),
    )
    unit_proposals = [
        item.proposal
        for item in classified
        if item.proposal.variable_key == "sii.unidad_nombre"
    ]
    pre_role_proposals = [
        item.proposal
        for item in classified
        if item.proposal.variable_key == "sii.pre_rol_lote"
    ]

    assert [proposal.value_text for proposal in unit_proposals] == ["LOTE 29", "LOTE 30"]
    assert [proposal.value_text for proposal in pre_role_proposals] == [
        "08179-00029",
        "08179-00030",
    ]
    assert [proposal.source_ref["lot_number_normalized"] for proposal in unit_proposals] == [
        "29",
        "30",
    ]
    assert [proposal.source_ref["comuna"] for proposal in unit_proposals] == [
        "TENO",
        "SAN CLEMENTE",
    ]
    assert [proposal.source_ref["row_index"] for proposal in unit_proposals] == [1, 2]
    assert all(
        proposal.source_ref["parser"] == "sii_role_certificate_tuple_v1"
        for proposal in unit_proposals
    )
    assert all(
        proposal.source_ref == unit.source_ref
        for proposal, unit in zip(pre_role_proposals, unit_proposals, strict=True)
    )
    assert all(
        "LOTE" in proposal.evidence[0].snippet
        and proposal.evidence[0].legal_document_page_id == SII_PAGE_ID
        for proposal in unit_proposals + pre_role_proposals
    )


def test_sii_roles_rules_extract_real_pilot_certificate_rows_with_header_context():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=SII_PAGE_ID,
        legal_document_id=SII_DOCUMENT_ID,
        page_number=1,
        text_content=(
            "Certificado de Asignacion de Roles N CAR-2026-8179\n"
            "Fecha de Emision 05/06/2026\n"
            "Solicitud F2118 N 445566\n"
            "Comuna TENO\n"
            "Numero(s) de Rol(es) Matriz(ces):\n"
            "00067-00023\n"
            "DIRECCION O NOMBRE DE LA UNIDAD N ROL DE AVALUO ASIGNADO\n"
            "LOTE 1 SECTOR EL CONDOR 08179-00001\n"
            "PROY. PARC. LAS ROSAS LOTE 2 08179-00002\n"
            "PARCELA A LT 3 08179-00003\n"
            "SAN JOSE LOTE 4 08179-00004\n"
        ),
    )

    classified = service.extract_sii_roles_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=SII_DOCUMENT_ID,
        pages=(page,),
        required_variable_keys=("sii.unidad_nombre", "sii.pre_rol_lote"),
    )
    by_key = {item.proposal.variable_key: item for item in classified}
    unit_proposals = [
        item.proposal
        for item in classified
        if item.proposal.variable_key == "sii.unidad_nombre"
    ]
    pre_role_proposals = [
        item.proposal
        for item in classified
        if item.proposal.variable_key == "sii.pre_rol_lote"
    ]

    assert by_key["sii.certificado_asignacion_roles_numero"].proposal.value_text == (
        "CAR-2026-8179"
    )
    assert by_key["sii.certificado_fecha_emision"].proposal.value_text == "05/06/2026"
    assert by_key["sii.solicitud_numero"].proposal.value_text == "445566"
    assert by_key["sii.rol_matriz"].proposal.value_text == "00067-00023"
    assert [proposal.value_text for proposal in unit_proposals] == [
        "LOTE 1 SECTOR EL CONDOR",
        "PROY. PARC. LAS ROSAS LOTE 2",
        "PARCELA A LT 3",
        "SAN JOSE LOTE 4",
    ]
    assert [proposal.value_text for proposal in pre_role_proposals] == [
        "08179-00001",
        "08179-00002",
        "08179-00003",
        "08179-00004",
    ]
    assert [proposal.source_ref["lot_number_normalized"] for proposal in unit_proposals] == [
        "1",
        "2",
        "3",
        "4",
    ]
    assert all(proposal.source_ref["comuna"] == "TENO" for proposal in unit_proposals)
    assert all(
        proposal.source_ref["role_matrix"] == "00067-00023"
        for proposal in unit_proposals
    )
    assert all(
        proposal.source_ref["parser"] == "sii_role_certificate_real_v1"
        for proposal in unit_proposals
    )
    assert all(
        proposal.source_ref == unit.source_ref
        for proposal, unit in zip(pre_role_proposals, unit_proposals, strict=True)
    )


def test_sii_roles_rules_propagates_header_context_across_certificate_pages():
    service = LegalVariableResolutionService()
    row_page_id = "00000000-0000-4000-8000-000000000022"
    pages = (
        LegalDocumentPageInput(
            id=SII_PAGE_ID,
            legal_document_id=SII_DOCUMENT_ID,
            page_number=1,
            text_content=(
                "Certificado de Asignacion de Roles N CAR-2026-8179\n"
                "Fecha de Emision 05/06/2026\n"
                "Solicitud F2118 N 445566\n"
                "Comuna TENO\n"
                "Numero(s) de Rol(es) Matriz(ces):\n"
                "00067-00023\n"
            ),
        ),
        LegalDocumentPageInput(
            id=row_page_id,
            legal_document_id=SII_DOCUMENT_ID,
            page_number=2,
            text_content=(
                "DIRECCION O NOMBRE DE LA UNIDAD N ROL DE AVALUO ASIGNADO\n"
                "LOTE 1 SECTOR EL CONDOR 08179-00001\n"
                "LOTE 2 SECTOR EL CONDOR 08179-00002\n"
            ),
        ),
    )

    classified = service.extract_sii_roles_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=SII_DOCUMENT_ID,
        pages=pages,
        required_variable_keys=("sii.unidad_nombre", "sii.pre_rol_lote"),
    )
    unit_items = [
        item
        for item in classified
        if item.proposal.variable_key == "sii.unidad_nombre"
    ]
    pre_role_items = [
        item
        for item in classified
        if item.proposal.variable_key == "sii.pre_rol_lote"
    ]

    assert [item.proposal.value_text for item in unit_items] == [
        "LOTE 1 SECTOR EL CONDOR",
        "LOTE 2 SECTOR EL CONDOR",
    ]
    assert [item.proposal.value_text for item in pre_role_items] == [
        "08179-00001",
        "08179-00002",
    ]
    assert all(item.classification == "proposed" for item in unit_items + pre_role_items)
    assert all(item.proposal.source_ref["comuna"] == "TENO" for item in unit_items)
    assert all(
        item.proposal.source_ref["role_matrix"] == "00067-00023"
        for item in unit_items
    )
    assert all(
        item.proposal.source_ref["header_page_number"] == 1
        for item in unit_items + pre_role_items
    )
    assert all(
        item.proposal.source_ref["header_legal_document_page_id"] == SII_PAGE_ID
        for item in unit_items + pre_role_items
    )
    assert all(
        item.proposal.evidence[0].legal_document_page_id == row_page_id
        for item in unit_items + pre_role_items
    )


def test_sii_roles_rules_multiple_matrix_roles_require_manual_review():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=SII_PAGE_ID,
        legal_document_id=SII_DOCUMENT_ID,
        page_number=1,
        text_content=(
            "Certificado de Asignacion de Roles N CAR-2026-8179\n"
            "Comuna TENO\n"
            "Numero(s) de Rol(es) Matriz(ces): 00067-00023 00068-00024\n"
            "DIRECCION O NOMBRE DE LA UNIDAD N ROL DE AVALUO ASIGNADO\n"
            "LOTE 1 SECTOR EL CONDOR 08179-00001\n"
            "LOTE 2 SECTOR EL CONDOR 08179-00002\n"
        ),
    )

    classified = service.extract_sii_roles_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=SII_DOCUMENT_ID,
        pages=(page,),
        required_variable_keys=("sii.unidad_nombre", "sii.pre_rol_lote"),
    )
    unit_items = [
        item
        for item in classified
        if item.proposal.variable_key == "sii.unidad_nombre"
    ]
    pre_role_items = [
        item
        for item in classified
        if item.proposal.variable_key == "sii.pre_rol_lote"
    ]

    assert [item.proposal.value_text for item in unit_items] == [
        "LOTE 1 SECTOR EL CONDOR",
        "LOTE 2 SECTOR EL CONDOR",
    ]
    assert [item.classification for item in unit_items + pre_role_items] == [
        "manual_review",
        "manual_review",
        "manual_review",
        "manual_review",
    ]
    assert all(
        item.reasons == ("ambiguous_sii_matrix_roles",)
        for item in unit_items + pre_role_items
    )
    assert all(
        item.proposal.source_ref["matrix_roles"] == [
            "00067-00023",
            "00068-00024",
        ]
        for item in unit_items + pre_role_items
    )
    assert all("role_matrix" not in item.proposal.source_ref for item in unit_items)


def test_sii_roles_rules_extract_gaona_and_pemuco_certificate_shapes():
    service = LegalVariableResolutionService()
    pages = (
        LegalDocumentPageInput(
            id=SII_PAGE_ID,
            legal_document_id=SII_DOCUMENT_ID,
            page_number=1,
            text_content=(
                "Certificado N GAONA-3\n"
                "Fecha Certificado 2026-06-05\n"
                "Formulario F2118 778899\n"
                "COMUNA GAONA\n"
                "Rol(es) Matriz(ces): 01234-00056\n"
                "DIRECCION O NOMBRE DE LA UNIDAD N ROL DE AVALUO ASIGNADO\n"
                "GAONA 3 LOTE 7 01234-00007\n"
                "GAONA 7 PARCELA 8 LT 9 01234-00009\n"
            ),
        ),
        LegalDocumentPageInput(
            id="00000000-0000-4000-8000-000000000022",
            legal_document_id=SII_DOCUMENT_ID,
            page_number=2,
            text_content=(
                "Certificado N PEMUCO-1\n"
                "Comuna Pemuco\n"
                "Numero(s) de Rol(es) Matriz(ces): 05432-00001\n"
                "DIRECCION O NOMBRE DE LA UNIDAD N ROL DE AVALUO ASIGNADO\n"
                "PARCELA 12 LT 15 CAMINO INTERIOR 05432-00015\n"
            ),
        ),
    )

    classified = service.extract_sii_roles_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=SII_DOCUMENT_ID,
        pages=pages,
        required_variable_keys=("sii.unidad_nombre", "sii.pre_rol_lote"),
    )
    unit_proposals = [
        item.proposal
        for item in classified
        if item.proposal.variable_key == "sii.unidad_nombre"
    ]
    pre_role_proposals = [
        item.proposal
        for item in classified
        if item.proposal.variable_key == "sii.pre_rol_lote"
    ]

    assert [proposal.value_text for proposal in unit_proposals] == [
        "GAONA 3 LOTE 7",
        "GAONA 7 PARCELA 8 LT 9",
        "PARCELA 12 LT 15 CAMINO INTERIOR",
    ]
    assert [proposal.value_text for proposal in pre_role_proposals] == [
        "01234-00007",
        "01234-00009",
        "05432-00015",
    ]
    assert [proposal.source_ref["lot_number_normalized"] for proposal in unit_proposals] == [
        "7",
        "9",
        "15",
    ]
    assert [proposal.source_ref["comuna"] for proposal in unit_proposals] == [
        "GAONA",
        "GAONA",
        "Pemuco",
    ]
    assert [proposal.source_ref["role_matrix"] for proposal in unit_proposals] == [
        "01234-00056",
        "01234-00056",
        "05432-00001",
    ]
    assert all(
        proposal.source_ref == unit.source_ref
        for proposal, unit in zip(pre_role_proposals, unit_proposals, strict=True)
    )


def test_sii_roles_rules_incomplete_lot_role_tuple_requires_manual_review():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=SII_PAGE_ID,
        legal_document_id=SII_DOCUMENT_ID,
        page_number=1,
        text_content=(
            "DIRECCION O NOMBRE DE LA UNIDAD N ROL DE AVALUO ASIGNADO COMUNA\n"
            "LOTE 29 08179-00029\n"
            "LOTE 30 SAN CLEMENTE\n"
        ),
    )

    classified = service.extract_sii_roles_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=SII_DOCUMENT_ID,
        pages=(page,),
        required_variable_keys=("sii.unidad_nombre", "sii.pre_rol_lote"),
    )
    unit_items = [
        item
        for item in classified
        if item.proposal.variable_key == "sii.unidad_nombre"
    ]
    pre_role_items = [
        item
        for item in classified
        if item.proposal.variable_key == "sii.pre_rol_lote"
    ]

    assert {item.classification for item in unit_items + pre_role_items} <= {
        "manual_review",
        "missing",
    }
    assert all(
        "incomplete_sii_role_tuple" in item.reasons
        or "critical_required_variable_absent" in item.reasons
        for item in unit_items + pre_role_items
    )
    assert all(
        "comuna" not in item.proposal.source_ref
        or item.classification == "manual_review"
        for item in unit_items + pre_role_items
    )


def test_sii_roles_rules_lower_confidence_when_declared_unit_count_mismatches():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=SII_PAGE_ID,
        legal_document_id=SII_DOCUMENT_ID,
        page_number=1,
        text_content=(
            "CANTIDAD DE UNIDADES 3\n"
            "LOTE 1 SECTOR EL CONDOR 08179-00001\n"
            "LOTE 2 SECTOR EL CONDOR 08179-00002\n"
        ),
    )

    classified = service.extract_sii_roles_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=SII_DOCUMENT_ID,
        pages=(page,),
        required_variable_keys=("sii.unidad_nombre", "sii.pre_rol_lote"),
    )
    unit_items = [
        item
        for item in classified
        if item.proposal.variable_key == "sii.unidad_nombre"
    ]

    assert [item.classification for item in unit_items] == ["manual_review", "manual_review"]
    assert all(item.proposal.confidence == 0.7 for item in unit_items)
    assert all(item.proposal.source_ref["declared_unit_count"] == 3 for item in unit_items)
    assert all(item.proposal.source_ref["extracted_unit_count"] == 2 for item in unit_items)
    assert all(item.proposal.source_ref["unit_count_matches"] is False for item in unit_items)


def test_low_confidence_plano_sample_falls_back_to_manual_review_with_evidence():
    service = LegalVariableResolutionService()
    evidence = _evidence(
        legal_document_id=PLANO_DOCUMENT_ID,
        legal_document_page_id=PLANO_PAGE_ID,
        snippet="Plano archivado bajo numero posiblemente 742, texto borroso",
        confidence=0.41,
    )
    proposal = VariableProposalInput(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        variable_key="sag.plano_cbr_numero",
        value_text="742",
        source_ref={"document_type": "plano_oficial"},
        confidence=0.41,
        extractor_name="plano_rules_v1",
        evidence=(evidence,),
    )

    (classified,) = service.classify_proposals((proposal,))

    assert classified.classification == "manual_review"
    assert classified.blocks_readiness is True
    assert classified.reasons == ("critical_low_confidence",)
    assert classified.proposal.variable_group == "sag"
    assert classified.proposal.evidence[0].legal_document_id == PLANO_DOCUMENT_ID
    assert classified.proposal.evidence[0].snippet_hash


def test_sag_plano_rules_extract_clear_certificate_and_plan_outputs():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=PLANO_PAGE_ID,
        legal_document_id=PLANO_DOCUMENT_ID,
        page_number=1,
        text_content=(
            "Resolucion SAG numero 4567-2024 de fecha 15-03-2024. "
            "El Jefe de Oficina Sectorial Puerto Varas del Servicio Agricola y Ganadero, "
            "Region de Los Lagos en cumplimiento de la ley certifica. "
            "Oficina Sectorial SAG Puerto Varas. Plano archivado CBR "
            "numero 742 del ano 2024 en registro Puerto Varas."
        ),
    )

    classified = service.extract_sag_plano_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=PLANO_DOCUMENT_ID,
        pages=(page,),
    )
    by_key = {item.proposal.variable_key: item for item in classified}

    assert by_key["sag.certificado_numero"].proposal.value_text == "4567-2024"
    assert by_key["sag.certificado_fecha"].proposal.value_text == "15-03-2024"
    assert by_key["sag.region_oficina"].proposal.value_text == "Region de Los Lagos"
    assert by_key["sag.oficina_sectorial"].proposal.value_text == "Puerto Varas"
    assert by_key["sag.plano_cbr_numero"].proposal.value_text == "742"
    assert by_key["sag.plano_cbr_anio"].proposal.value_text == "2024"
    assert "sag.plano_cbr_registro" not in by_key
    assert all(item.classification == "proposed" for item in by_key.values())
    assert all(
        item.proposal.extractor_name == "sag_plano_rules_v1"
        for item in by_key.values()
    )
    assert all(
        item.proposal.evidence[0].legal_document_page_id == PLANO_PAGE_ID
        for item in by_key.values()
    )


def test_sag_office_survives_fi_ligature_in_pdf_text():
    # PDFs del CBR/SAG traen la ligadura "ﬁ" (U+FB01): "Oﬁcina Sectorial Curicó".
    # normalize_whitespace la expande para que el regex matchee.
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=PLANO_PAGE_ID,
        legal_document_id=PLANO_DOCUMENT_ID,
        page_number=1,
        text_content=(
            "CERTIFICADO Nº 1468/2024. "
            "El Jefe de Oﬁcina Sectorial Curicó del Servicio Agrícola y Ganadero, "
            "Región del Maule en ejercicio certifica."
        ),
    )

    classified = service.extract_sag_plano_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=PLANO_DOCUMENT_ID,
        pages=(page,),
    )
    by_key = {item.proposal.variable_key: item for item in classified}

    assert by_key["sag.oficina_sectorial"].proposal.value_text == "Curicó"
    assert by_key["sag.region_oficina"].proposal.value_text == "Región del Maule"


def test_sii_emission_date_with_colon_uppercase_label():
    # Cert real: "FECHA DE EMISIÓN: 12/08/2024" — el ':' separa etiqueta y fecha.
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=SII_PAGE_ID,
        legal_document_id=SII_DOCUMENT_ID,
        page_number=1,
        text_content=(
            "ASIGNACIÓN DE ROLES DE AVALÚO "
            "CERTIFICADO N° 972575 FECHA DE EMISIÓN: 12/08/2024 "
            "DATOS DE LA SOLICITUD F2118 Comuna TENO."
        ),
    )

    classified = service.extract_sii_roles_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=SII_DOCUMENT_ID,
        pages=(page,),
    )
    by_key = {item.proposal.variable_key: item for item in classified}

    assert by_key["sii.certificado_fecha_emision"].proposal.value_text == "12/08/2024"


def test_sag_certificate_extracts_article_two_header_values_from_certificate_layout():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=PLANO_PAGE_ID,
        legal_document_id=PLANO_DOCUMENT_ID,
        page_number=1,
        text_content=(
            "CERTIFICADO Nº 1468/2024\n"
            "El Jefe de Oﬁcina Sectorial Curicó del Servicio Agrícola y Ganadero, "
            "Región del Maule en cumplimiento de lo dispuesto certifica. "
            "CURICÓ, 31/07/2024"
        ),
    )

    classified = service.extract_sag_plano_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=PLANO_DOCUMENT_ID,
        pages=(page,),
        required_variable_keys=(
            "sag.certificado_numero",
            "sag.certificado_fecha",
            "sag.region_oficina",
        ),
    )
    by_key = {item.proposal.variable_key: item for item in classified}

    assert by_key["sag.certificado_numero"].proposal.value_text == "1468"
    assert by_key["sag.certificado_fecha"].proposal.value_text == "31/07/2024"
    assert by_key["sag.region_oficina"].proposal.value_text == "Región del Maule"
    assert all(item.classification == "proposed" for item in by_key.values())


def test_sag_plano_rules_mark_low_confidence_plan_values_for_manual_review():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=PLANO_PAGE_ID,
        legal_document_id=PLANO_DOCUMENT_ID,
        page_number=3,
        text_content=(
            "OCR borroso: plano archivado CBR numero posiblemente 742 "
            "del ano 2024, registro no se lee."
        ),
    )

    classified = service.extract_sag_plano_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=PLANO_DOCUMENT_ID,
        pages=(page,),
        required_variable_keys=("sag.plano_cbr_numero", "sag.plano_cbr_anio"),
    )
    by_key = {item.proposal.variable_key: item for item in classified}

    assert by_key["sag.plano_cbr_numero"].proposal.value_text == "742"
    assert by_key["sag.plano_cbr_numero"].classification == "manual_review"
    assert by_key["sag.plano_cbr_numero"].reasons == ("critical_low_confidence",)
    assert by_key["sag.plano_cbr_anio"].proposal.value_text == "2024"
    assert by_key["sag.plano_cbr_anio"].classification == "manual_review"
    assert by_key["sag.plano_cbr_numero"].proposal.evidence[0].snippet


def test_plano_oficial_resolution_only_requires_archive_number_and_year():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=PLANO_PAGE_ID,
        legal_document_id=PLANO_DOCUMENT_ID,
        page_number=1,
        text_content="Timbre ilegible del plano escaneado.",
    )

    classified = resolve_document_variables(
        service,
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=PLANO_DOCUMENT_ID,
        document_type="plano_oficial",
        pages=(page,),
    )
    by_key = {item.proposal.variable_key: item for item in classified}

    assert set(by_key) == {"sag.plano_cbr_numero", "sag.plano_cbr_anio"}
    assert by_key["sag.plano_cbr_numero"].classification == "missing"
    assert by_key["sag.plano_cbr_anio"].classification == "missing"


def test_critical_variable_conflicts_block_readiness_with_specific_reason():
    service = LegalVariableResolutionService()
    evidence = _evidence(
        legal_document_id=DOMINIO_DOCUMENT_ID,
        legal_document_page_id=DOMINIO_PAGE_ID,
        snippet="dos dominios proponen roles distintos",
        confidence=0.91,
    )

    classified = service.classify_proposals(
        (
            VariableProposalInput(
                organization_id=ORG_ID,
                project_id=PROJECT_ID,
                variable_key="matriz.rol_avaluo",
                value_text="123-45",
                confidence=0.91,
                evidence=(evidence,),
            ),
            VariableProposalInput(
                organization_id=ORG_ID,
                project_id=PROJECT_ID,
                variable_key="matriz.rol_avaluo",
                value_text="123-46",
                confidence=0.91,
                evidence=(evidence,),
            ),
        )
    )

    assert {item.classification for item in classified} == {"conflict"}
    assert all(item.blocks_readiness for item in classified)
    assert all(
        item.reasons == ("critical_multiple_values_for_same_scope",)
        for item in classified
    )


def test_duplicate_values_for_same_scope_are_not_conflicts_after_normalization():
    service = LegalVariableResolutionService()
    evidence = _evidence(
        legal_document_id=DOMINIO_DOCUMENT_ID,
        legal_document_page_id=DOMINIO_PAGE_ID,
        snippet="mismo valor repetido",
        confidence=0.91,
    )

    classified = service.classify_proposals(
        (
            VariableProposalInput(
                organization_id=ORG_ID,
                project_id=PROJECT_ID,
                variable_key="matriz.nombre_predio",
                value_text="Los Castanos",
                confidence=0.91,
                evidence=(evidence,),
            ),
            VariableProposalInput(
                organization_id=ORG_ID,
                project_id=PROJECT_ID,
                variable_key="matriz.nombre_predio",
                value_text=" los   castanos ",
                confidence=0.91,
                evidence=(evidence,),
            ),
        )
    )

    assert [item.classification for item in classified] == ["proposed", "proposed"]


def test_critical_document_variable_without_evidence_requires_manual_review():
    service = LegalVariableResolutionService()

    (classified,) = service.classify_proposals(
        (
            VariableProposalInput(
                organization_id=ORG_ID,
                project_id=PROJECT_ID,
                variable_key="sii.pre_rol_lote",
                value_text="08179-00029",
                confidence=0.9,
            ),
        )
    )

    assert classified.classification == "manual_review"
    assert classified.blocks_readiness is True
    assert classified.reasons == ("critical_evidence_missing",)


# ==============================================================================
# Phase 12 Regression Tests: Matriz/Lote Source Of Truth Alignment
# ==============================================================================

import pytest
from types import SimpleNamespace


@pytest.mark.asyncio
async def test_repeatable_sii_role_text_scoping_by_unit_index():
    """T099: Verify that sii.rol_avaluo_en_tramite_texto proposals are scoped by unit_index and can persist independently."""
    service = LegalVariableResolutionService()

    # Mocking Supabase execution to capture payloads
    inserted_payloads = []

    class FakeSupabaseTable:
        def select(self, *args, **kwargs):
            return self
        def update(self, *args, **kwargs):
            return self
        def eq(self, *args, **kwargs):
            return self
        def neq(self, *args, **kwargs):
            return self
        def is_(self, *args, **kwargs):
            return self
        def insert(self, payload):
            nonlocal inserted_payloads
            inserted_payloads.extend(payload if isinstance(payload, list) else [payload])
            return self
        def execute(self):
            return SimpleNamespace(data=inserted_payloads)

    class FakeSupabase:
        def table(self, name: str):
            return FakeSupabaseTable()

    # Two proposals for the same project/lote, same variable key, but different unit_index
    prop_1 = ClassifiedVariableProposal(
        proposal=VariableProposalInput(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            variable_key="sii.rol_avaluo_en_tramite_texto",
            value_text="Rol de Lote 7",
            source_ref={"unit_index": 1, "legal_document_id": SII_DOCUMENT_ID},
            confidence=0.88,
        ),
        classification="proposed",
    )

    prop_2 = ClassifiedVariableProposal(
        proposal=VariableProposalInput(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            variable_key="sii.rol_avaluo_en_tramite_texto",
            value_text="Rol de Lote 8",
            source_ref={"unit_index": 2, "legal_document_id": SII_DOCUMENT_ID},
            confidence=0.88,
        ),
        classification="proposed",
    )

    # Run persistence
    await service.persist_proposals([prop_1, prop_2], supabase=FakeSupabase())

    # Desired behavior: both proposals should be inserted because they have different unit_index
    assert len(inserted_payloads) == 2

    # Verify that values and unit_index are preserved
    by_unit = {p["source_ref"]["unit_index"]: p for p in inserted_payloads}
    assert by_unit[1]["value_text"] == "Rol de Lote 7"
    assert by_unit[2]["value_text"] == "Rol de Lote 8"


# ─── SDD 013 (alineación LOTE 29): extractor de certificado GP ──────────────
# (Certificado de Hipotecas, Gravámenes, Prohibiciones y Litigios). Textos
# reales de 3 Conservadores distintos (Curicó/Teno, Peralillo, San Carlos)
# aportados por el usuario para validar variaciones de formato reales.

GP_DOCUMENT_ID = "00000000-0000-4000-8000-000000000040"
GP_PAGE_ID = "00000000-0000-4000-8000-000000000041"

GP_TENO_CLEAN_TEXT = """CERTIFICADO DE HIPOTECA Y GRAVÁMENES
PROHIBICIONES, INTERDICCIONES Y/O EMBARGOS
REVISADO EL INMUEBLE UBICADO EN LA COMUNA DE TENO, INSCRITO A FOJA 4699,
NÚMERO 2781, DEL REGISTRO DE PROPIEDAD DEL AÑO 2023, A NOMBRE DE JUAN DE
DIOS GALAZ ABARCA.
Certifico que, revisados los registros de Hipotecas y Gravámenes, por sus
índices y nombres correspondientes, desde 1994 hasta la fecha; al inmueble
previamente individualizado, NO LE AFECTAN HIPOTECAS NI GRAVÁMENES.
Así también, certifico que, revisados los registros de Interdicciones y
Prohibiciones de Enajenar, por sus índices y nombres correspondientes, 1994
la fecha; al inmueble previamente individualizado, NO LE AFECTAN
PROHIBICIONES, INTERDICCIONES Y/O EMBARGOS.
ESTA PROPIEDAD NO ESTÁ AFECTA A LITIGIOS.
Certificado emitido por el Conservador de Bienes Raíces de Curicó, a
catorce de octubre del dos mil veinticuatro.-
"""

GP_PERALILLO_MIXED_TEXT = """CERTIFICADO DE HIPOTECAS Y GRAVAMENES
INTERDICCIONES Y PROHIBICIONES
Del inmueble ubicado en la Comuna de Marchigüe, inscrito a fojas ciento
ochenta y tres (183) número ciento sesenta y nueve (169) del Registro de
Propiedad del año dos mil diecinueve (2019), a nombre de DT PEÑUELAS S.A..
Revisados los Indices del Registro de Hipotecas y Gravámenes durante
treinta años a la fecha, certifico que al inmueble individualizado
precedentemente tiene(n) en dicho período una inscripción vigente(s).
1.- SERVIDUMBRE : A fojas dieciocho (18) número catorce (14) del año dos
mil veinte (2020) en favor de SOCIEDAD MONTES SA.
Conservador de Bienes Raíces de Peralillo, ocho de Junio del año dos mil
veintitrés a las 11:46 AM.-
Revisados igualmente durante treinta años a la fecha los Indices del
Registro de Interdicciones y Prohibiciones de Enajenar, certifico que al
inmueble individualizado precedentemente NO le afectan Interdicciones y
Prohibiciones.
Conservador de Bienes Raíces de Peralillo, ocho de Junio del año dos mil
veintitrés a las 11:46 AM.-
"""

GP_SAN_CARLOS_CLEAN_TEXT = """CESAR FUENTES VENEGAS
CONSERVADOR DE BIENES RAICES
SAN CARLOS
CERTIFICADO DE HIPOTECAS Y GRAVAMENES
Revisados por personal del CBR., los índices del Registro de Hipotecas y
Gravámenes, durante treinta años a la fecha, certifico que la propiedad
individualizada precedentemente a la fecha, NO tiene en dicho período
inscripcion(es) vigente(s).-
San Carlos, 17 de Noviembre de 2025.-
CERTIFICADO DE INTERDICCIONES Y PROHIBICIONES DE ENAJENAR
Revisados igualmente por personal del CBR., durante treinta años, los
índices del Registro de Interdicciones y Prohibiciones de enajenar,
certifico que la propiedad referida anteriormente, NO tiene en dicho
período inscripcion(es) vigente(s).-
San Carlos, 17 de Noviembre de 2025.-
CERTIFICADO DE LITIGIOS
CERTIFICO: Que revisada por el personal del CBR, la inscripción de dominio
de la propiedad antes referida, no hay constancia de que dicha propiedad
sea objeto de Litigios pendientes.
San Carlos, 17 de Noviembre de 2025.-
"""


def _gp_page(text: str) -> LegalDocumentPageInput:
    return LegalDocumentPageInput(
        id=GP_PAGE_ID,
        legal_document_id=GP_DOCUMENT_ID,
        page_number=1,
        text_content=text,
    )


def test_hipoteca_gravamen_clean_certificate_proposes_citation_with_cbr_and_fecha():
    service = LegalVariableResolutionService()
    result = service.extract_hipoteca_gravamen_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=GP_DOCUMENT_ID,
        pages=[_gp_page(GP_TENO_CLEAN_TEXT)],
    )
    assert len(result) == 1
    item = result[0]
    assert item.proposal.variable_key == "evidencia.certificado_gp_referencia"
    assert item.classification == "proposed"
    assert "Curicó" in item.proposal.value_text
    assert "catorce de octubre del dos mil veinticuatro" in item.proposal.value_text
    assert item.proposal.evidence


def test_hipoteca_gravamen_different_cbr_format_still_resolves_clean():
    """Formato de otro Conservador (San Carlos): declaraciones separadas por
    sección con frase "NO tiene... vigente(s)" en vez de "NO le afectan"."""
    service = LegalVariableResolutionService()
    result = service.extract_hipoteca_gravamen_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=GP_DOCUMENT_ID,
        pages=[_gp_page(GP_SAN_CARLOS_CLEAN_TEXT)],
    )
    assert len(result) == 1
    assert result[0].classification == "proposed"
    assert "San Carlos" in result[0].proposal.value_text


def test_hipoteca_gravamen_real_encumbrance_never_drafts_and_requires_manual_review():
    """Caso mixto real (Peralillo): hay una servidumbre vigente en la sección
    de hipotecas/gravámenes aunque prohibiciones esté limpia. Nunca se redacta
    una declaración legal sobre un gravamen real — siempre manual_review."""
    service = LegalVariableResolutionService()
    result = service.extract_hipoteca_gravamen_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=GP_DOCUMENT_ID,
        pages=[_gp_page(GP_PERALILLO_MIXED_TEXT)],
    )
    assert len(result) == 1
    item = result[0]
    assert item.classification == "manual_review"
    assert "gp_certificate_encumbrance_detected" in item.reasons
    assert "no se redacta" in item.proposal.value_text.lower()


def test_hipoteca_gravamen_unrecognizable_text_requires_manual_review():
    """Documento escaneado sin OCR disponible: sin texto, sin secciones
    reconocibles. No debe fallar ni proponer datos inventados."""
    service = LegalVariableResolutionService()
    result = service.extract_hipoteca_gravamen_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=GP_DOCUMENT_ID,
        pages=[_gp_page("   ")],
    )
    assert len(result) == 1
    item = result[0]
    assert item.classification == "manual_review"
    assert "gp_certificate_no_recognizable_sections" in item.reasons


def test_hipoteca_gravamen_clean_sections_without_cbr_metadata_requires_manual_review():
    """Las tres secciones dan limpio pero no se puede extraer Conservador ni
    fecha: nunca se inventa la cita, se escala a revisión manual."""
    text = (
        "revisados los registros de Hipotecas y Gravámenes, NO LE AFECTAN "
        "HIPOTECAS NI GRAVÁMENES. revisados los registros de Interdicciones y "
        "Prohibiciones, NO LE AFECTAN PROHIBICIONES. NO ESTÁ AFECTA A LITIGIOS."
    )
    service = LegalVariableResolutionService()
    result = service.extract_hipoteca_gravamen_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=GP_DOCUMENT_ID,
        pages=[_gp_page(text)],
    )
    assert len(result) == 1
    item = result[0]
    assert item.classification == "manual_review"
    assert "gp_certificate_cbr_or_fecha_not_extracted" in item.reasons


def test_resolve_document_variables_dispatches_hipoteca_gravamen_to_gp_extractor():
    service = LegalVariableResolutionService()
    result = resolve_document_variables(
        service,
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=GP_DOCUMENT_ID,
        document_type="hipoteca_gravamen",
        pages=[_gp_page(GP_TENO_CLEAN_TEXT)],
    )
    assert len(result) == 1
    assert result[0].proposal.variable_key == "evidencia.certificado_gp_referencia"
