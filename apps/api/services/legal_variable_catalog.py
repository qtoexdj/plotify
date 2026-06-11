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

# FR-031 (SDD 009 correccion 2026-06-10): types where several active
# documents coexist per project. Every other type keeps replace-by-type
# semantics (a new upload supersedes all previous versions).
MULTI_ACTIVE_LEGAL_DOCUMENT_TYPES: Final[tuple[str, ...]] = (
    "dominio_vigente",
    "personeria",
    "hipoteca_gravamen",
    "plano_oficial",
    "otro",
)
MULTI_ACTIVE_LEGAL_DOCUMENT_TYPE_SET: Final = frozenset(
    MULTI_ACTIVE_LEGAL_DOCUMENT_TYPES
)

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
    "titulo",
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
        # SDD 008 (research D11): jurisdiccion de la notaria usada por la
        # clausula de comparecencia del template golden.
        "documento.notaria.jurisdiccion",
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
        # SDD 008 (research D11): hecho juridico independiente; no existe en
        # lot_records, entra manual via CCL. Nunca se infiere del nombre.
        "comprador.nacionalidad",
    ),
    "personeria": (
        "personeria.aplica",
        "personeria.constitucion_texto",
        "personeria.poder_texto",
        "personeria.estado_revision",
        # SDD 008 (research D11): delegacion de facultades citada por la
        # clausula de personeria del template golden.
        "personeria.delegacion_facultades",
    ),
    "matriz": (
        "matriz.nombre_predio",
        "matriz.ubicacion",
        "matriz.comuna",
        "matriz.provincia",
        "matriz.region",
        "matriz.superficie_total",
        "matriz.deslindes.*",
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
        # SDD 008 (research D11): texto aprobado de la exencion de eviccion
        # citado por el template golden cuando la exencion aplica.
        "clausulas.exencion_eviccion_texto",
        "clausulas.entrega_material",
        # SDD 008 (research D11): fecha pactada de entrega material y
        # excepciones de ocupantes declaradas en la clausula de entrega.
        "clausulas.entrega_fecha",
        "clausulas.ocupantes_excepciones",
        "clausulas.gastos_cargo",
        # SDD 008 (research D11): excepciones al reparto de gastos del
        # template golden (p. ej. derechos de inscripcion del comprador).
        "clausulas.gastos_excepciones",
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
        # SDD 008 (research D11): excepciones de gravamenes citadas por la
        # clausula de dominio y referencia al certificado de gravamenes y
        # prohibiciones del template golden.
        "evidencia.gravamenes_excepciones",
        "evidencia.certificado_gp_referencia",
    ),
    "titulo": (
        "titulo.estructura",
        "titulo.inscripciones[]",
        "titulo.propietarios[]",
        "titulo.comparecencia_vendedor_texto",
        "titulo.clausula_primero_texto",
        "titulo.alertas[]",
    ),
}
VARIABLE_KEYS: Final[tuple[str, ...]] = tuple(
    key for keys in VARIABLE_KEYS_BY_GROUP.values() for key in keys
)
VARIABLE_KEY_SET: Final = frozenset(VARIABLE_KEYS)
VARIABLE_GROUP_BY_KEY: Final[dict[str, str]] = {
    key: group for group, keys in VARIABLE_KEYS_BY_GROUP.items() for key in keys
}

# SDD 010 (research D4): fuente unica de etiquetas humanas es-CL. La copia
# web de los grupos (`LEGAL_VARIABLE_GROUP_LABELS`) queda para el CCL hasta
# su rediseno; un test de paridad evita divergencia. Toda clave del catalogo
# DEBE tener etiqueta (test de inventario al 100%).
VARIABLE_GROUP_LABELS: Final[dict[str, str]] = {
    "documento": "Documento",
    "revision_juridica": "Revisión jurídica",
    "vendedor": "Vendedor",
    "comprador": "Comprador",
    "personeria": "Personería",
    "matriz": "Predio matriz",
    "sag": "SAG y plano",
    "sii": "Roles SII",
    "lote": "Lote",
    "servidumbre": "Servidumbre",
    "transaccion": "Precio y pago",
    "clausulas": "Cláusulas",
    "mandato": "Mandato",
    "evidencia": "Evidencia",
    "titulo": "Estudio de título",
}

VARIABLE_LABELS: Final[dict[str, str]] = {
    "documento.tipo": "Tipo de documento",
    "documento.ciudad_otorgamiento": "Ciudad de otorgamiento",
    "documento.fecha_otorgamiento": "Fecha de otorgamiento",
    "documento.repertorio_numero": "Número de repertorio",
    "documento.notario.nombre": "Nombre del notario",
    "documento.notaria.direccion": "Dirección de la notaría",
    "documento.notaria.jurisdiccion": "Jurisdicción de la notaría",
    "documento.abogado_redactor.nombre": "Nombre del abogado redactor",
    "documento.abogado_redactor.rut": "RUT del abogado redactor",
    "documento.abogado_redactor.email": "Correo del abogado redactor",
    "revision_juridica.estado": "Estado de la revisión jurídica",
    "revision_juridica.aprobada_por": "Revisión aprobada por",
    "revision_juridica.aprobada_at": "Fecha de aprobación de la revisión",
    "vendedor.tipo": "Tipo de vendedor",
    "vendedor.nombre": "Nombre del vendedor",
    "vendedor.rut": "RUT del vendedor",
    "vendedor.domicilio": "Domicilio del vendedor",
    "vendedor.profesion_giro": "Profesión o giro del vendedor",
    "vendedor.representantes[]": "Representantes del vendedor",
    "comprador.nombre": "Nombre del comprador",
    "comprador.rut": "RUT del comprador",
    "comprador.domicilio": "Domicilio del comprador",
    "comprador.estado_civil": "Estado civil del comprador",
    "comprador.profesion_giro": "Profesión o giro del comprador",
    "comprador.nacionalidad": "Nacionalidad del comprador",
    "personeria.aplica": "Aplica personería",
    "personeria.constitucion_texto": "Texto de constitución de la sociedad",
    "personeria.poder_texto": "Texto del poder de representación",
    "personeria.estado_revision": "Estado de revisión de la personería",
    "personeria.delegacion_facultades": "Delegación de facultades",
    "matriz.nombre_predio": "Nombre del predio matriz",
    "matriz.ubicacion": "Ubicación del predio matriz",
    "matriz.comuna": "Comuna del predio matriz",
    "matriz.provincia": "Provincia del predio matriz",
    "matriz.region": "Región del predio matriz",
    "matriz.superficie_total": "Superficie total del predio matriz",
    "matriz.deslindes.*": "Deslindes del predio matriz",
    "matriz.rol_avaluo": "Rol de avalúo del predio matriz",
    "sag.certificado_numero": "Número del certificado SAG",
    "sag.certificado_fecha": "Fecha del certificado SAG",
    "sag.region_oficina": "Región de la oficina SAG",
    "sag.oficina_sectorial": "Oficina sectorial SAG",
    "sag.plano_cbr_numero": "Número del plano en el CBR",
    "sag.plano_cbr_anio": "Año del plano en el CBR",
    "sag.plano_cbr_registro": "Registro del plano en el CBR",
    "sii.certificado_asignacion_roles_numero": (
        "Número del certificado de asignación de roles"
    ),
    "sii.certificado_fecha_emision": "Fecha de emisión del certificado SII",
    "sii.solicitud_numero": "Número de solicitud SII",
    "sii.rol_matriz": "Rol SII de la matriz",
    "sii.pre_rol_lote": "Pre-rol SII del lote",
    "sii.rol_avaluo_en_tramite_texto": "Rol de avalúo en trámite",
    "sii.rol_avaluo_definitivo": "Rol de avalúo definitivo",
    "sii.unidad_nombre": "Nombre de la unidad SII",
    "lote.numero": "Número del lote",
    "lote.numero_nombre": "Número o nombre del lote",
    "lote.superficie_m2": "Superficie del lote en metros cuadrados",
    "lote.superficie_texto": "Superficie del lote en palabras",
    "lote.superficie_ha_texto": "Superficie del lote en hectáreas, en palabras",
    "lote.boundaries_official": "Geometría oficial del lote",
    "lote.deslindes": "Deslindes del lote",
    "lote.rol_tramite": "Rol en trámite del lote",
    "servidumbre.aplica": "Aplica servidumbre",
    "servidumbre.superficie_m2": "Superficie de la servidumbre en metros cuadrados",
    "servidumbre.superficie_texto": "Superficie de la servidumbre en palabras",
    "servidumbre.deslindes_tramo": "Deslindes del tramo de servidumbre",
    "servidumbre.predio_sirviente": "Predio sirviente",
    "servidumbre.predios_dominantes": "Predios dominantes",
    "transaccion.precio_numeros": "Precio de venta en números",
    "transaccion.precio_letras": "Precio de venta en palabras",
    "transaccion.moneda": "Moneda",
    "transaccion.forma_pago": "Forma de pago",
    "transaccion.detalle_pago[]": "Detalle del pago",
    "transaccion.saldo_pendiente": "Saldo pendiente",
    "clausulas.cuerpo_cierto": "Venta como cuerpo cierto",
    "clausulas.saneamiento_eviccion": "Saneamiento de la evicción",
    "clausulas.exencion_eviccion_aprobada": "Exención de evicción aprobada",
    "clausulas.exencion_eviccion_texto": "Texto de la exención de evicción",
    "clausulas.entrega_material": "Entrega material del inmueble",
    "clausulas.entrega_fecha": "Fecha de entrega material",
    "clausulas.ocupantes_excepciones": "Excepciones de ocupantes",
    "clausulas.gastos_cargo": "Gastos a cargo de",
    "clausulas.gastos_excepciones": "Excepciones al reparto de gastos",
    "clausulas.domicilio_contractual": "Domicilio contractual",
    "clausulas.tribunales_competentes": "Tribunales competentes",
    "clausulas.promesa_finiquito": "Finiquito de la promesa",
    "clausulas.factibilidad_servicios": "Factibilidad de servicios",
    "clausulas.lguc_destino_suelo": "Destino de suelo según LGUC",
    "clausulas.rnda_declaracion": "Declaración RNDA",
    "mandato.rectificacion_nombre": "Nombre para el mandato de rectificación",
    "mandato.rectificacion_rut": "RUT para el mandato de rectificación",
    "mandato.facultades": "Facultades del mandato",
    "evidencia.documentos_fuente[]": "Documentos fuente",
    "evidencia.estado": "Estado de la evidencia",
    "evidencia.gravamenes_excepciones": "Excepciones de gravámenes",
    "evidencia.certificado_gp_referencia": (
        "Referencia del certificado de gravámenes y prohibiciones"
    ),
    "titulo.estructura": "Estructura del título",
    "titulo.inscripciones[]": "Inscripciones del título",
    "titulo.propietarios[]": "Propietarios actuales",
    "titulo.comparecencia_vendedor_texto": (
        "Comparecencia del vendedor (texto aprobado)"
    ),
    "titulo.clausula_primero_texto": "Cláusula PRIMERO (texto aprobado)",
    "titulo.alertas[]": "Alertas del estudio de título",
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
        "titulo.estructura",
        "titulo.inscripciones[]",
        "titulo.comparecencia_vendedor_texto",
        "titulo.clausula_primero_texto",
        "matriz.nombre_predio",
        "matriz.ubicacion",
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


def is_multi_active_legal_document_type(value: str) -> bool:
    return value in MULTI_ACTIVE_LEGAL_DOCUMENT_TYPE_SET


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
    if value in VARIABLE_KEY_SET:
        return True
    if value.startswith("matriz.deslindes."):
        return True
    return False


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
    if variable_key.startswith("matriz.deslindes."):
        return "matriz"
    return VARIABLE_GROUP_BY_KEY.get(variable_key)


def variable_label_for_key(variable_key: str) -> str:
    """Etiqueta humana es-CL de una clave del catalogo.

    Sin fallback silencioso: una clave desconocida es un error del llamador
    (la UI jamas debe mostrar una clave cruda). Las claves dinamicas de
    deslindes (`matriz.deslindes.norte`) se componen deterministicamente.
    """
    label = VARIABLE_LABELS.get(variable_key)
    if label is not None:
        return label
    if variable_key.startswith("matriz.deslindes."):
        suffix = variable_key.removeprefix("matriz.deslindes.").replace("_", " ").strip()
        if suffix and suffix != "*":
            return f"Deslinde {suffix} del predio matriz"
        return VARIABLE_LABELS["matriz.deslindes.*"]
    raise KeyError(f"Variable sin etiqueta en el catalogo: {variable_key}")


def variable_group_label(group: str) -> str:
    label = VARIABLE_GROUP_LABELS.get(group)
    if label is None:
        raise KeyError(f"Grupo sin etiqueta en el catalogo: {group}")
    return label
