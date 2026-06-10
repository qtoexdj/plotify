"""Canonical legal variable catalog for SDD 007.

The module is dependency-free so schemas, services, and workers can share the
same document types, states, source types, variable keys, and readiness gates.
"""

from __future__ import annotations

from typing import Final


LEGAL_DOCUMENT_TYPES: Final[tuple[str, ...]] = (
    "dominio_vigente",
    "hipoteca_gravamen",
    "certificado_roles_sii",
    "certificado_sag",
    "plano_oficial",
    "personeria",
    "rnda",
    "instruccion_pago",
    "otro",
)
LEGAL_DOCUMENT_TYPE_SET: Final = frozenset(LEGAL_DOCUMENT_TYPES)

LEGAL_DOCUMENT_UPLOAD_SOURCES: Final[tuple[str, ...]] = (
    "onboarding",
    "project_documents",
    "legal_control_center",
    "api",
)
LEGAL_DOCUMENT_UPLOAD_SOURCE_SET: Final = frozenset(LEGAL_DOCUMENT_UPLOAD_SOURCES)

LEGAL_DOCUMENT_EXTRACTION_STATUSES: Final[tuple[str, ...]] = (
    "pending",
    "queued",
    "processing",
    "text_extracted",
    "variables_proposed",
    "needs_review",
    "failed",
    "superseded",
)
DOCUMENT_INGESTION_JOB_STATUSES: Final[tuple[str, ...]] = (
    "queued",
    "processing",
    "text_extracted",
    "variables_proposed",
    "failed",
    "cancelled",
)
EXTRACTION_STATUSES: Final[tuple[str, ...]] = tuple(
    dict.fromkeys(LEGAL_DOCUMENT_EXTRACTION_STATUSES + DOCUMENT_INGESTION_JOB_STATUSES)
)
EXTRACTION_STATUS_SET: Final = frozenset(EXTRACTION_STATUSES)
LEGAL_DOCUMENT_EXTRACTION_STATUS_SET: Final = frozenset(
    LEGAL_DOCUMENT_EXTRACTION_STATUSES
)
DOCUMENT_INGESTION_JOB_STATUS_SET: Final = frozenset(DOCUMENT_INGESTION_JOB_STATUSES)

VARIABLE_STATES: Final[tuple[str, ...]] = (
    "missing",
    "proposed",
    "resolved",
    "approved",
    "manual_review",
    "conflict",
    "derived",
    "not_applicable",
    "superseded",
)
VARIABLE_STATE_SET: Final = frozenset(VARIABLE_STATES)
VARIABLE_BLOCKING_STATES: Final[tuple[str, ...]] = (
    "missing",
    "manual_review",
    "conflict",
)
VARIABLE_REVIEWED_STATES: Final[tuple[str, ...]] = (
    "resolved",
    "approved",
    "derived",
    "not_applicable",
)

SOURCE_TYPES: Final[tuple[str, ...]] = (
    "document",
    "system",
    "geometry",
    "derived",
    "manual",
    "legal_review",
    "post_minuta",
)
SOURCE_TYPE_SET: Final = frozenset(SOURCE_TYPES)

VARIABLE_GROUPS: Final[tuple[str, ...]] = (
    "documento",
    "revision_juridica",
    "vendedor",
    "comprador",
    "personeria",
    "matriz",
    "sag",
    "sii",
    "lote",
    "servidumbre",
    "transaccion",
    "clausulas",
    "mandato",
    "evidencia",
)
VARIABLE_GROUP_SET: Final = frozenset(VARIABLE_GROUPS)

VARIABLE_KEYS_BY_GROUP: Final[dict[str, tuple[str, ...]]] = {
    "documento": (
        "documento.tipo",
        "documento.ciudad_otorgamiento",
        "documento.fecha_otorgamiento",
        "documento.repertorio_numero",
        "documento.notario.nombre",
        "documento.notaria.direccion",
        "documento.abogado_redactor.nombre",
        "documento.abogado_redactor.rut",
        "documento.abogado_redactor.email",
    ),
    "revision_juridica": (
        "revision_juridica.estado",
        "revision_juridica.aprobada_por",
        "revision_juridica.aprobada_at",
    ),
    "vendedor": (
        "vendedor.tipo",
        "vendedor.nombre",
        "vendedor.rut",
        "vendedor.domicilio",
        "vendedor.profesion_giro",
        "vendedor.representantes[]",
    ),
    "comprador": (
        "comprador.nombre",
        "comprador.rut",
        "comprador.domicilio",
        "comprador.estado_civil",
        "comprador.profesion_giro",
    ),
    "personeria": (
        "personeria.aplica",
        "personeria.constitucion_texto",
        "personeria.poder_texto",
        "personeria.estado_revision",
    ),
    "matriz": (
        "matriz.nombre_predio",
        "matriz.ubicacion",
        "matriz.comuna",
        "matriz.provincia",
        "matriz.region",
        "matriz.superficie_total",
        "matriz.deslindes.*",
        "matriz.adquisicion_modo",
        "matriz.adquisicion_notaria",
        "matriz.adquisicion_fecha",
        "matriz.adquisicion_repertorio",
        "matriz.inscripcion_fojas",
        "matriz.inscripcion_numero",
        "matriz.inscripcion_anio",
        "matriz.inscripcion_cbr",
        "matriz.rol_avaluo",
    ),
    "sag": (
        "sag.certificado_numero",
        "sag.certificado_fecha",
        "sag.region_oficina",
        "sag.oficina_sectorial",
        "sag.plano_cbr_numero",
        "sag.plano_cbr_anio",
        "sag.plano_cbr_registro",
    ),
    "sii": (
        "sii.certificado_asignacion_roles_numero",
        "sii.certificado_fecha_emision",
        "sii.solicitud_numero",
        "sii.rol_matriz",
        "sii.pre_rol_lote",
        "sii.rol_avaluo_en_tramite_texto",
        "sii.rol_avaluo_definitivo",
        "sii.unidad_nombre",
    ),
    "lote": (
        "lote.numero",
        "lote.numero_nombre",
        "lote.superficie_m2",
        "lote.superficie_texto",
        "lote.superficie_ha_texto",
        "lote.boundaries_official",
        "lote.deslindes",
        "lote.rol_tramite",
    ),
    "servidumbre": (
        "servidumbre.aplica",
        "servidumbre.superficie_m2",
        "servidumbre.superficie_texto",
        "servidumbre.deslindes_tramo",
        "servidumbre.predio_sirviente",
        "servidumbre.predios_dominantes",
    ),
    "transaccion": (
        "transaccion.precio_numeros",
        "transaccion.precio_letras",
        "transaccion.moneda",
        "transaccion.forma_pago",
        "transaccion.detalle_pago[]",
        "transaccion.saldo_pendiente",
    ),
    "clausulas": (
        "clausulas.cuerpo_cierto",
        "clausulas.saneamiento_eviccion",
        "clausulas.exencion_eviccion_aprobada",
        "clausulas.entrega_material",
        "clausulas.gastos_cargo",
        "clausulas.domicilio_contractual",
        "clausulas.tribunales_competentes",
        "clausulas.promesa_finiquito",
        "clausulas.factibilidad_servicios",
        "clausulas.lguc_destino_suelo",
        "clausulas.rnda_declaracion",
    ),
    "mandato": (
        "mandato.rectificacion_nombre",
        "mandato.rectificacion_rut",
        "mandato.facultades",
    ),
    "evidencia": (
        "evidencia.documentos_fuente[]",
        "evidencia.estado",
    ),
}
VARIABLE_KEYS: Final[tuple[str, ...]] = tuple(
    key for keys in VARIABLE_KEYS_BY_GROUP.values() for key in keys
)
VARIABLE_KEY_SET: Final = frozenset(VARIABLE_KEYS)
VARIABLE_GROUP_BY_KEY: Final[dict[str, str]] = {
    key: group for group, keys in VARIABLE_KEYS_BY_GROUP.items() for key in keys
}

ROLE_STATUSES: Final[tuple[str, ...]] = (
    "missing",
    "rol_en_tramite",
    "definitive",
    "not_applicable",
)
ROLE_STATUS_SET: Final = frozenset(ROLE_STATUSES)

ROLE_MATCHING_STATUSES: Final[tuple[str, ...]] = (
    "matched",
    "ambiguous",
    "missing",
    "manual_override",
)
ROLE_MATCHING_STATUS_SET: Final = frozenset(ROLE_MATCHING_STATUSES)

ESCRITURA_CASE_STATUSES: Final[tuple[str, ...]] = (
    "draft",
    "variables_pending",
    "ready_for_minuta",
    "minuta_generated",
    "legal_review_pending",
    "minuta_approved",
    "sent_to_external",
    "cancelled",
)
ESCRITURA_CASE_STATUS_SET: Final = frozenset(ESCRITURA_CASE_STATUSES)

READINESS_STATUSES: Final[tuple[str, ...]] = ("blocked", "needs_review", "ready")
READINESS_STATUS_SET: Final = frozenset(READINESS_STATUSES)
READINESS_GATE_STATUSES: Final[tuple[str, ...]] = READINESS_STATUSES
READINESS_GATE_STATUS_SET: Final = READINESS_STATUS_SET

READINESS_GATES: Final[tuple[str, ...]] = (
    "title_verified",
    "sii_verified",
    "sag_plano_verified",
    "geometry_verified",
    "party_verified",
    "price_verified",
    "legal_review_ready",
    "warning_acknowledged",
)
READINESS_GATE_SET: Final = frozenset(READINESS_GATES)

READINESS_REQUIRED_VARIABLES_BY_GATE: Final[dict[str, tuple[str, ...]]] = {
    "title_verified": (
        "matriz.nombre_predio",
        "matriz.ubicacion",
        "matriz.inscripcion_fojas",
        "matriz.inscripcion_numero",
        "matriz.inscripcion_anio",
        "matriz.inscripcion_cbr",
    ),
    "sii_verified": (
        "matriz.rol_avaluo",
        "sii.rol_matriz",
        "sii.pre_rol_lote",
        "sii.rol_avaluo_en_tramite_texto",
        "sii.unidad_nombre",
        "lote.rol_tramite",
    ),
    "sag_plano_verified": (
        "sag.certificado_numero",
        "sag.certificado_fecha",
        "sag.region_oficina",
        "sag.plano_cbr_numero",
        "sag.plano_cbr_anio",
    ),
    "geometry_verified": (
        "lote.superficie_m2",
        "lote.boundaries_official",
        "lote.deslindes",
    ),
    "party_verified": (
        "vendedor.nombre",
        "vendedor.rut",
        "comprador.nombre",
        "comprador.rut",
    ),
    "price_verified": (
        "transaccion.precio_numeros",
        "transaccion.moneda",
        "transaccion.forma_pago",
    ),
    "legal_review_ready": (
        "documento.abogado_redactor.nombre",
        "documento.abogado_redactor.rut",
        "revision_juridica.estado",
    ),
    "warning_acknowledged": (),
}


def is_legal_document_type(value: str) -> bool:
    return value in LEGAL_DOCUMENT_TYPE_SET


def is_extraction_status(value: str) -> bool:
    return value in EXTRACTION_STATUS_SET


def is_legal_document_extraction_status(value: str) -> bool:
    return value in LEGAL_DOCUMENT_EXTRACTION_STATUS_SET


def is_ingestion_job_status(value: str) -> bool:
    return value in DOCUMENT_INGESTION_JOB_STATUS_SET


def is_variable_state(value: str) -> bool:
    return value in VARIABLE_STATE_SET


def is_source_type(value: str) -> bool:
    return value in SOURCE_TYPE_SET


def is_variable_group(value: str) -> bool:
    return value in VARIABLE_GROUP_SET


def is_variable_key(value: str) -> bool:
    return value in VARIABLE_KEY_SET


def is_role_status(value: str) -> bool:
    return value in ROLE_STATUS_SET


def is_role_matching_status(value: str) -> bool:
    return value in ROLE_MATCHING_STATUS_SET


def is_escritura_case_status(value: str) -> bool:
    return value in ESCRITURA_CASE_STATUS_SET


def is_readiness_status(value: str) -> bool:
    return value in READINESS_STATUS_SET


def is_readiness_gate(value: str) -> bool:
    return value in READINESS_GATE_SET


def variable_keys_for_group(group: str) -> tuple[str, ...]:
    return VARIABLE_KEYS_BY_GROUP.get(group, ())


def variable_group_for_key(variable_key: str) -> str | None:
    return VARIABLE_GROUP_BY_KEY.get(variable_key)
