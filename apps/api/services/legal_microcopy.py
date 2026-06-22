"""SDD 010 (research D5): diccionario de microcopy server-side.

Fuente unica del vocabulario es-CL que nace en el API: verificaciones de
readiness, causas de bloqueo, tipos de alerta del estudio de titulo,
acciones y estados de workflow. Todo texto compuesto (depende de datos del
caso) se redacta aqui; la web jamas traduce codigos compuestos
(contracts/api-contracts.md de specs/010-mesa-escritura).

Regla de redaccion: oraciones completas, voz directa, es-CL; decir que
paso y que hacer ahora. Prohibido que un texto producido aqui contenga
claves crudas, underscores o jerga tecnica (token/blocker/snapshot/gate).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from services.legal_variable_catalog import variable_label_for_key


# ─── Verificaciones de readiness ─────────────────────────────────────────────

READINESS_GATE_LABELS: Final[dict[str, str]] = {
    "title_verified": "Estudio de título aprobado",
    "sii_verified": "Roles SII verificados",
    "sag_plano_verified": "Certificado SAG y plano verificados",
    "geometry_verified": "Geometría y deslindes verificados",
    "party_verified": "Datos de las partes verificados",
    "price_verified": "Precio y forma de pago verificados",
    "legal_review_ready": "Revisión jurídica lista",
    "warning_acknowledged": "Advertencia legal aceptada",
    "project_matriz_approved": "Matriz del proyecto aprobada",
}

READINESS_GATE_PENDING_DESCRIPTIONS: Final[dict[str, str]] = {
    "title_verified": (
        "El estudio de título aún no está aprobado. "
        "Se revisa en el panel de título del proyecto."
    ),
    "sii_verified": (
        "Faltan datos de los roles SII. Se corrigen en el Centro de Control Legal."
    ),
    "sag_plano_verified": (
        "Faltan datos del certificado SAG o del plano. "
        "Se corrigen en el Centro de Control Legal."
    ),
    "geometry_verified": (
        "Faltan la superficie o los deslindes oficiales del lote. "
        "Se corrigen en la geometría del lote."
    ),
    "party_verified": (
        "Faltan datos del comprador o del vendedor. "
        "Se completan en el registro de venta o en el Centro de Control Legal."
    ),
    "price_verified": (
        "Faltan datos del precio o de la forma de pago. "
        "Se completan en el registro de venta del lote."
    ),
    "legal_review_ready": "Falta completar la revisión jurídica del caso.",
    "warning_acknowledged": (
        "Falta aceptar la advertencia de revisión legal obligatoria."
    ),
    "project_matriz_approved": (
        "Falta aprobar la matriz del proyecto. El abogado la prepara en "
        "Documentos; el borrador del lote se genera apenas quede aprobada."
    ),
}

READINESS_GATE_ACTION_LABELS: Final[dict[str, str]] = {
    "title_verified": "Revisar estudio de título",
    "sii_verified": "Completar dato",
    "sag_plano_verified": "Completar dato",
    "geometry_verified": "Revisar geometría del lote",
    "party_verified": "Completar dato",
    "price_verified": "Completar dato",
    "legal_review_ready": "Completar revisión",
    "warning_acknowledged": "Aceptar advertencia",
    "project_matriz_approved": "Abrir matriz del proyecto",
}


# ─── Alertas del estudio de titulo ───────────────────────────────────────────

ALERT_TIPO_LABELS: Final[dict[str, str]] = {
    "dl_3516": "Declaración DL 3.516",
    "derechos_aguas": "Derechos de aguas",
    "vigente_en_el_resto": "Vigencia en el resto del predio",
    "multi_inmueble": "Título con múltiples inmuebles",
    "gravamen": "Gravamen o hipoteca vigente",
    "personeria_requerida": "Personería requerida",
    "discrepancia_declaracion": "Discrepancia en declaraciones",
    "otro": "Otra alerta del estudio de título",
}

# Reemplaza es-CL del mapa ingles ALERT_REQUIRED_CLAUSE_LABELS del endpoint
# (la clausula comprometida cuando la alerta se resolvio como clause_added).
ALERT_REQUIRED_CLAUSE_TEXTS: Final[dict[str, str]] = {
    "dl_3516": (
        "Cláusula de prohibición de cambio de destino del suelo "
        "(LGUC 55/56 y DL 3.516)."
    ),
    "derechos_aguas": (
        "Cláusula de derechos de aguas, incluidos o expresamente reservados."
    ),
    "vigente_en_el_resto": (
        "Redacción de antecedentes que reconozca la transferencia parcial "
        "del predio."
    ),
    "multi_inmueble": (
        "Cláusula de singularización que limite la venta al inmueble objeto "
        "del contrato."
    ),
    "gravamen": (
        "Cláusula que reconozca o alce la hipoteca o el gravamen vigente."
    ),
    "personeria_requerida": (
        "Comparecencia con cita de la personería del representante."
    ),
    "discrepancia_declaracion": (
        "Declaración aclaratoria acordada por el abogado."
    ),
    "otro": "Cláusula definida por el abogado según la razón de la alerta.",
}


# ─── Origen operacional de un dato (cuando no hay evidencia documental) ─────

SOURCE_TYPE_ORIGIN_LABELS: Final[dict[str, str]] = {
    "system": "Registro de venta del lote",
    "geometry": "Geometría oficial del lote",
    "derived": "Calculado automáticamente desde el expediente",
    "manual": "Ingresado en el Centro de Control Legal",
    "legal_review": "Definido en la revisión jurídica",
    "post_minuta": "Definido después de la minuta",
}


def source_origin_label(source_type: str | None) -> str | None:
    """Descripcion humana del origen de un dato sin evidencia documental.

    ``document`` (y desconocidos) devuelven None: su respaldo se muestra via
    las referencias de evidencia, no como texto de origen.
    """
    if not source_type:
        return None
    return SOURCE_TYPE_ORIGIN_LABELS.get(source_type)


# ─── Estados de workflow ─────────────────────────────────────────────────────

MATRIZ_STATUS_LABELS: Final[dict[str, str]] = {
    "draft": "Borrador",
    "legal_review_pending": "En revisión legal",
    "approved": "Aprobada",
    "superseded": "Reemplazada",
}

ESCRITURA_CASE_STATUS_LABELS: Final[dict[str, str]] = {
    "draft": "Borrador",
    "variables_pending": "Datos pendientes",
    "ready_for_minuta": "Lista para minuta",
    "minuta_generated": "Minuta generada",
    "legal_review_pending": "En revisión legal",
    "minuta_approved": "Minuta aprobada",
    "sent_to_external": "Enviada a uso externo",
    "cancelled": "Cancelada",
}


# ─── Estados del flujo venta → escritura (SDD 011, data-model §5, FR-014) ─────
# Frases humanas UNICAS del ciclo proyecto → matriz aprobada → venta → borrador
# → entrega. Identicas en notificaciones, Centro de Control Legal, mesa y "mis
# documentos del vendedor": un solo vocabulario en todas las superficies. Se
# derivan de case_status + estado de la matriz + entregas; aqui vive el texto.

FLOW_STATES: Final[tuple[str, ...]] = (
    "waiting_project_matriz",
    "in_preparation",
    "draft_for_review",
    "accepted",
    "delivered",
)

FLOW_STATE_LABELS: Final[dict[str, str]] = {
    "waiting_project_matriz": "Esperando matriz del proyecto",
    "in_preparation": "En preparación",
    "draft_for_review": "Borrador por revisar",
    "accepted": "Aceptada",
    "delivered": "Entregada",
}

FLOW_STATE_DESCRIPTIONS: Final[dict[str, str]] = {
    "waiting_project_matriz": (
        "La venta está validada, pero el abogado aún no aprueba la matriz de "
        "la escritura del proyecto. El borrador se genera apenas se apruebe."
    ),
    "in_preparation": (
        "La escritura se está preparando: faltan datos de la venta para "
        "completar el borrador."
    ),
    "draft_for_review": (
        "El borrador está listo y espera la revisión del administrador antes "
        "de aceptarlo."
    ),
    "accepted": (
        "El administrador aceptó el borrador; el documento se generó con la "
        "marca de borrador sujeto a revisión legal."
    ),
    "delivered": (
        "El borrador se entregó al vendedor; ya puede descargarlo o "
        "compartirlo."
    ),
}

# SDD 011 (FR-008, ADR-009): marca visible que TODO entregable del flujo de
# escrituras lleva embebida en el DOCX. Ningun envio externo la esquiva.
ESCRITURA_BORRADOR_NOTICE: Final[str] = "Borrador sujeto a revisión legal"


# ─── Notificaciones administrativas (SDD 011, FR-009) ───────────────────────

ADMIN_NOTIFICATION_LABELS: Final[dict[str, str]] = {
    "sale_pending_validation": "Venta por validar",
    "draft_ready_for_review": FLOW_STATE_LABELS["draft_for_review"],
    "waiting_project_matriz": FLOW_STATE_LABELS["waiting_project_matriz"],
    # SDD 011 T018: aviso al vendedor cuando su borrador queda entregado.
    "draft_delivered_to_vendor": FLOW_STATE_LABELS["delivered"],
}


# ─── Composicion de pendientes (blockers humanizados) ────────────────────────


@dataclass(frozen=True)
class BlockerMicrocopy:
    title: str
    description: str
    action_label: str


def _lower_first(label: str) -> str:
    """Baja la primera letra salvo siglas iniciales (RUT, SAG, SII...)."""
    first_word = label.split(" ", 1)[0]
    if len(first_word) > 1 and first_word.isupper():
        return label
    return label[0].lower() + label[1:] if label else label


def alert_tipo_label(tipo: str) -> str:
    """Nombre humano de un tipo de alerta.

    La taxonomia es abierta (extracciones fuera de ella se conservan), asi
    que un tipo desconocido se humaniza de forma determinista en vez de
    mostrarse como codigo crudo.
    """
    label = ALERT_TIPO_LABELS.get(tipo)
    if label is not None:
        return label
    humanized = tipo.replace("_", " ").strip()
    return humanized[:1].upper() + humanized[1:] if humanized else ALERT_TIPO_LABELS["otro"]


def readiness_gate_label(gate: str) -> str:
    label = READINESS_GATE_LABELS.get(gate)
    if label is None:
        raise KeyError(f"Verificación sin texto en el diccionario: {gate}")
    return label


def matriz_status_label(status: str) -> str:
    label = MATRIZ_STATUS_LABELS.get(status)
    if label is None:
        raise KeyError(f"Estado de matriz sin texto en el diccionario: {status}")
    return label


def escritura_case_status_label(status: str) -> str:
    label = ESCRITURA_CASE_STATUS_LABELS.get(status)
    if label is None:
        raise KeyError(f"Estado de caso sin texto en el diccionario: {status}")
    return label


def flow_state_label(state: str) -> str:
    """Frase humana de un estado del flujo venta → escritura (FR-014)."""
    label = FLOW_STATE_LABELS.get(state)
    if label is None:
        raise KeyError(f"Estado del flujo sin texto en el diccionario: {state}")
    return label


def flow_state_description(state: str) -> str:
    """Explicacion humana de un estado del flujo venta → escritura."""
    description = FLOW_STATE_DESCRIPTIONS.get(state)
    if description is None:
        raise KeyError(f"Estado del flujo sin descripción en el diccionario: {state}")
    return description


def admin_notification_label(event: str) -> str:
    """Frase humana canonica para notificaciones del flujo venta → escritura."""
    label = ADMIN_NOTIFICATION_LABELS.get(event)
    if label is None:
        raise KeyError(f"Notificación administrativa sin texto: {event}")
    return label


def token_missing_microcopy(
    variable_key: str, label: str | None = None
) -> BlockerMicrocopy:
    """``label`` permite pasar una etiqueta ya resuelta (claves dinamicas
    de secciones repetidas que el catalogo no conoce de forma exacta)."""
    resolved_label = label or variable_label_for_key(variable_key)
    return BlockerMicrocopy(
        title=f"Falta {_lower_first(resolved_label)}",
        description=(
            "Completa este dato en el Centro de Control Legal; la escritura "
            "lo tomará del expediente actualizado."
        ),
        action_label="Completar dato",
    )


def token_blocked_microcopy(
    variable_key: str, label: str | None = None
) -> BlockerMicrocopy:
    resolved_label = label or variable_label_for_key(variable_key)
    return BlockerMicrocopy(
        title=f"Dato por revisar: {_lower_first(resolved_label)}",
        description=(
            "El dato tiene un valor propuesto que aún no se aprueba. "
            "Revísalo en el Centro de Control Legal."
        ),
        action_label="Revisar dato",
    )


def clause_omitted_reason(condition_key: str) -> str:
    """Explicacion humana de una clausula condicional que no aplica."""
    try:
        condition_label = variable_label_for_key(condition_key)
    except KeyError:
        return "No aplica en este caso: la condición declarada no se cumple."
    return (
        f"No aplica en este caso: {_lower_first(condition_label)} "
        "no se cumple."
    )


def readiness_gate_microcopy(gate: str, cause: str | None = None) -> BlockerMicrocopy:
    """Pendiente por verificacion bloqueada.

    Si la causa es una clave conocida del catalogo se traduce a su etiqueta;
    cualquier otra causa tecnica se omite (la descripcion generica de la
    verificacion ya dice donde se corrige) — jamas se muestra un codigo.
    """
    title = f"Verificación pendiente: {_lower_first(readiness_gate_label(gate))}"
    description = READINESS_GATE_PENDING_DESCRIPTIONS[gate]
    if cause:
        try:
            cause_label = variable_label_for_key(cause)
        except KeyError:
            cause_label = None
        if cause_label is not None:
            description = f"Falta {_lower_first(cause_label)}. {description}"
    return BlockerMicrocopy(
        title=title,
        description=description,
        action_label=READINESS_GATE_ACTION_LABELS[gate],
    )


def alert_clause_missing_microcopy(alert_tipo: str) -> BlockerMicrocopy:
    required = ALERT_REQUIRED_CLAUSE_TEXTS.get(
        alert_tipo, ALERT_REQUIRED_CLAUSE_TEXTS["otro"]
    )
    return BlockerMicrocopy(
        title=f"Falta la cláusula comprometida: {alert_tipo_label(alert_tipo)}",
        description=(
            f"{required} Se comprometió al resolver la alerta del estudio "
            "de título."
        ),
        action_label="Agregar cláusula",
    )


def snapshot_stale_microcopy() -> BlockerMicrocopy:
    return BlockerMicrocopy(
        title="El expediente cambió",
        description=(
            "Recarga la mesa para trabajar sobre la versión vigente del "
            "expediente del caso."
        ),
        action_label="Recargar",
    )


def blocker_microcopy(
    kind: str,
    *,
    key: str | None = None,
    gate: str | None = None,
    cause: str | None = None,
    alert_tipo: str | None = None,
) -> BlockerMicrocopy:
    """Despachador unico para los cuatro kinds de pendiente (T004)."""
    if kind == "token_missing" and key:
        return token_missing_microcopy(key)
    if kind == "readiness_gate" and gate:
        return readiness_gate_microcopy(gate, cause)
    if kind == "alert_clause_missing" and alert_tipo:
        return alert_clause_missing_microcopy(alert_tipo)
    if kind == "snapshot_stale":
        return snapshot_stale_microcopy()
    raise ValueError(f"Pendiente sin redacción definida: kind={kind!r}")
