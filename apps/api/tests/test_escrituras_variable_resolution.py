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


def test_dominio_vigente_sample_proposes_matriz_variables_with_page_evidence():
    service = LegalVariableResolutionService()
    evidence = _evidence(
        legal_document_id=DOMINIO_DOCUMENT_ID,
        legal_document_page_id=DOMINIO_PAGE_ID,
        snippet="inscrita a fojas 4699 numero 3784 del Registro de Propiedad del ano 2020",
        confidence=0.92,
    )
    proposals = (
        VariableProposalInput(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            variable_key="matriz.inscripcion_fojas",
            value_text="4699",
            source_ref={"document_type": "dominio_vigente"},
            confidence=0.92,
            extractor_name="dominio_vigente_rules_v1",
            evidence=(evidence,),
        ),
        VariableProposalInput(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            variable_key="matriz.inscripcion_numero",
            value_text="3784",
            source_ref={"document_type": "dominio_vigente"},
            confidence=0.92,
            extractor_name="dominio_vigente_rules_v1",
            evidence=(evidence,),
        ),
        VariableProposalInput(
            organization_id=ORG_ID,
            project_id=PROJECT_ID,
            variable_key="matriz.inscripcion_anio",
            value_text="2020",
            source_ref={"document_type": "dominio_vigente"},
            confidence=0.92,
            extractor_name="dominio_vigente_rules_v1",
            evidence=(evidence,),
        ),
    )

    classified = service.classify_proposals(proposals)

    assert [item.classification for item in classified] == [
        "proposed",
        "proposed",
        "proposed",
    ]
    assert {item.proposal.variable_group for item in classified} == {"matriz"}
    assert all(item.proposal.source_type == "document" for item in classified)
    assert all(item.proposal.evidence[0].legal_document_id == DOMINIO_DOCUMENT_ID for item in classified)
    assert all(item.proposal.evidence[0].legal_document_page_id == DOMINIO_PAGE_ID for item in classified)
    assert all(item.proposal.evidence[0].snippet_hash for item in classified)


def test_dominio_vigente_rules_extract_schema_normalized_matriz_outputs():
    service = LegalVariableResolutionService()
    page = LegalDocumentPageInput(
        id=DOMINIO_PAGE_ID,
        legal_document_id=DOMINIO_DOCUMENT_ID,
        page_number=2,
        text_content=(
            "La propiedad denominada Parcela Los Castanos se encuentra ubicada en "
            "Camino Interior Km 12, comuna de Puerto Varas. Tiene una superficie "
            "de 12.500 metros cuadrados. Inscrita a fojas 4699 numero 3784 del "
            "ano 2020 en el Conservador de Bienes Raices de Puerto Varas. "
            "Rol de avaluo 1234-56. Adquirio por compraventa."
        ),
    )

    classified = service.extract_dominio_vigente_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=DOMINIO_DOCUMENT_ID,
        pages=(page,),
    )
    by_key = {item.proposal.variable_key: item for item in classified}

    assert by_key["matriz.inscripcion_fojas"].proposal.value_text == "4699"
    assert by_key["matriz.inscripcion_numero"].proposal.value_text == "3784"
    assert by_key["matriz.inscripcion_anio"].proposal.value_text == "2020"
    assert by_key["matriz.inscripcion_cbr"].proposal.value_text == "Puerto Varas"
    assert by_key["matriz.rol_avaluo"].proposal.value_text == "1234-56"
    assert by_key["matriz.nombre_predio"].proposal.value_text == "Parcela Los Castanos"
    assert by_key["matriz.superficie_total"].proposal.value_text == (
        "12.500 metros cuadrados"
    )
    assert by_key["matriz.adquisicion_modo"].proposal.value_text == "compraventa"
    assert by_key["matriz.ubicacion"].classification == "proposed"
    assert all(
        item.proposal.extractor_name == "dominio_vigente_rules_v1"
        for item in by_key.values()
        if item.classification != "missing"
    )
    assert all(
        item.proposal.source_ref["document_type"] == "dominio_vigente"
        for item in by_key.values()
        if item.classification != "missing"
    )
    assert all(
        item.proposal.evidence[0].legal_document_page_id == DOMINIO_PAGE_ID
        for item in by_key.values()
        if item.classification != "missing"
    )


def test_dominio_vigente_rules_mark_required_absent_values_as_missing():
    service = LegalVariableResolutionService()
    page = {
        "id": DOMINIO_PAGE_ID,
        "legal_document_id": DOMINIO_DOCUMENT_ID,
        "page_number": 1,
        "text_content": "Inscrita a fojas 4699 numero 3784 del ano 2020.",
    }

    classified = service.extract_dominio_vigente_variables(
        organization_id=ORG_ID,
        project_id=PROJECT_ID,
        legal_document_id=DOMINIO_DOCUMENT_ID,
        pages=[page],
        required_variable_keys=(
            "matriz.inscripcion_fojas",
            "matriz.nombre_predio",
            "matriz.rol_avaluo",
        ),
    )
    by_key = {item.proposal.variable_key: item for item in classified}

    assert by_key["matriz.inscripcion_fojas"].classification == "proposed"
    assert by_key["matriz.nombre_predio"].classification == "missing"
    assert by_key["matriz.nombre_predio"].reasons == (
        "critical_required_variable_absent",
    )
    assert by_key["matriz.rol_avaluo"].classification == "missing"


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
                variable_key="matriz.inscripcion_fojas",
                value_text="4699",
                confidence=0.91,
                evidence=(evidence,),
            ),
            VariableProposalInput(
                organization_id=ORG_ID,
                project_id=PROJECT_ID,
                variable_key="matriz.inscripcion_fojas",
                value_text="4700",
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
                variable_key="matriz.inscripcion_cbr",
                value_text="Puerto Varas",
                confidence=0.91,
                evidence=(evidence,),
            ),
            VariableProposalInput(
                organization_id=ORG_ID,
                project_id=PROJECT_ID,
                variable_key="matriz.inscripcion_cbr",
                value_text=" puerto   varas ",
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
