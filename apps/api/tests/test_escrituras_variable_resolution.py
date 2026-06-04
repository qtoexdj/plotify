"""SDD 007 US2 tests for legal variable extraction proposals and evidence."""

from __future__ import annotations

from services.legal_variable_resolution import (
    LegalDocumentPageInput,
    LegalVariableResolutionService,
    VariableEvidenceInput,
    VariableProposalInput,
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
        "Rol de avaluo en tramite"
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
    assert by_key["sag.oficina_sectorial"].proposal.value_text == "Puerto Varas"
    assert by_key["sag.plano_cbr_numero"].proposal.value_text == "742"
    assert by_key["sag.plano_cbr_anio"].proposal.value_text == "2024"
    assert by_key["sag.plano_cbr_registro"].proposal.value_text == "Puerto Varas"
    assert all(item.classification == "proposed" for item in by_key.values())
    assert all(
        item.proposal.extractor_name == "sag_plano_rules_v1"
        for item in by_key.values()
    )
    assert all(
        item.proposal.evidence[0].legal_document_page_id == PLANO_PAGE_ID
        for item in by_key.values()
    )


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
