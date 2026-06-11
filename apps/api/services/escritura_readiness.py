"""Escritura readiness service skeleton for SDD 007.

The pure helpers in this module are intentionally deterministic and have no
Supabase side effects. Persistence helpers are async wrappers around the
currently synchronous Supabase client.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Literal

from core.logger import get_logger
from services import legal_variable_catalog as catalog
from services.legal_title_analysis import (
    ACTIVE_TITLE_DOCUMENT_STATUSES as ACTIVE_TITLE_DOCUMENT_EXTRACTION_STATUSES,
    TITLE_DOCUMENT_TYPES,
)


logger = get_logger(__name__)

ReadinessStatus = Literal["blocked", "needs_review", "ready"]

READY_VARIABLE_STATES = frozenset(("approved", "resolved", "derived", "not_applicable"))
REVIEW_VARIABLE_STATES = frozenset(("proposed",))
BLOCKING_VARIABLE_STATES = frozenset(catalog.VARIABLE_BLOCKING_STATES)
VALID_ROLE_STATUSES = frozenset(("definitive", "rol_en_tramite", "not_applicable"))
VALID_MATCHING_STATUSES = frozenset(("matched", "manual_override"))
ACTIVE_SII_DOCUMENT_STATUSES = frozenset(
    (
        "pending",
        "queued",
        "processing",
        "text_extracted",
        "variables_proposed",
        "needs_review",
        "failed",
    )
)
PROJECT_SII_COMMON_COLUMNS = "sii_comuna, sii_role_matrix"
TITLE_ANALYSIS_READINESS_COLUMNS = (
    "id, status, structure_type, analysis_json, alerts, "
    "narrative_comparecencia_generated, narrative_comparecencia_edited, "
    "narrative_primero_generated, narrative_primero_edited, created_at"
)
# SDD 009 blocking causes for the title_verified gate (data-model.md).
TITLE_ANALYSIS_STATUS_BLOCKING_CAUSES = {
    "processing": "analysis_processing",
    "proposed": "analysis_needs_review",
    "needs_review": "analysis_needs_review",
    "failed": "analysis_failed",
    "llm_disabled": "llm_disabled",
    "superseded": "analysis_superseded",
}
TITLE_VARIABLE_PREFIX = "titulo."
PENDING_TITLE_VARIABLE_STATES = frozenset(("manual_review", "conflict"))
LEGAL_REVIEW_WARNING = (
    "La minuta generada automaticamente debe ser revisada y aprobada por "
    "abogado antes de usarse en notaria o como instrumento final."
)


class EscrituraReadinessError(Exception):
    """Base error for escritura readiness service failures."""


class EscrituraReadinessScopeError(EscrituraReadinessError):
    """Raised when a lot/project/organization scope cannot be proven."""


@dataclass(frozen=True)
class ReadinessGate:
    gate: str
    status: ReadinessStatus
    blocking_variables: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "gate": self.gate,
            "status": self.status,
            "blocking_variables": list(self.blocking_variables),
            "warnings": list(self.warnings),
        }


@dataclass(frozen=True)
class EscrituraReadiness:
    organization_id: str
    project_id: str
    lot_id: str
    readiness_status: ReadinessStatus
    gates: tuple[ReadinessGate, ...]
    variable_snapshot: dict[str, Any] = field(default_factory=dict)
    evidence_snapshot: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "organization_id": self.organization_id,
            "project_id": self.project_id,
            "lot_id": self.lot_id,
            "readiness_status": self.readiness_status,
            "gates": [gate.to_dict() for gate in self.gates],
            "variable_snapshot": self.variable_snapshot,
            "evidence_snapshot": self.evidence_snapshot,
        }


def _first_row(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        return data[0] if data else None
    return data if isinstance(data, dict) else None


async def _assert_lot_scope(
    *,
    client: Any,
    organization_id: str,
    project_id: str,
    lot_id: str,
) -> None:
    result = await asyncio.to_thread(
        lambda: (
            client.table("lots")
            .select("id, project_id, projects!inner(organization_id)")
            .eq("id", lot_id)
            .eq("project_id", project_id)
            .eq("projects.organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    if not result.data:
        raise EscrituraReadinessScopeError(
            "lot_id does not belong to the requested organization/project."
        )


def _has_value(variable: dict[str, Any]) -> bool:
    value_text = variable.get("value_text")
    value_json = variable.get("value_json")
    return (
        variable.get("state") == "not_applicable"
        or (isinstance(value_text, str) and bool(value_text.strip()))
        or value_json is not None
    )


def _index_variables(
    variables: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for variable in variables:
        key = variable.get("variable_key")
        if isinstance(key, str) and key and variable.get("state") != "superseded":
            indexed[key] = variable
    return indexed


def _evaluate_variable_gate(
    gate: str,
    variables_by_key: dict[str, dict[str, Any]],
) -> ReadinessGate:
    blocking: list[str] = []
    warnings: list[str] = []

    for key in catalog.READINESS_REQUIRED_VARIABLES_BY_GATE.get(gate, ()):
        variable = variables_by_key.get(key)
        if not variable:
            blocking.append(key)
            continue

        state = variable.get("state")
        if state in BLOCKING_VARIABLE_STATES or not _has_value(variable):
            blocking.append(key)
            continue
        if state in REVIEW_VARIABLE_STATES:
            warnings.append(key)
            continue
        if variable.get("approval_required") and state != "approved":
            warnings.append(key)
            continue
        if state not in READY_VARIABLE_STATES:
            warnings.append(key)

    if blocking:
        return ReadinessGate(gate=gate, status="blocked", blocking_variables=tuple(blocking))
    if warnings:
        return ReadinessGate(gate=gate, status="needs_review", warnings=tuple(warnings))
    return ReadinessGate(gate=gate, status="ready")


def _title_analysis_blocking_causes(
    title_analysis: dict[str, Any] | None,
    has_title_documents: bool,
    variables: list[dict[str, Any]],
) -> list[str]:
    causes: list[str] = []
    if title_analysis is None:
        if has_title_documents:
            # Title documents exist but no run was recorded; the lawyer must
            # (re)launch the analysis from the title panel.
            causes.append("analysis_needs_review")
        else:
            causes.append("no_title_documents")
        return causes

    status = str(title_analysis.get("status") or "")
    status_cause = TITLE_ANALYSIS_STATUS_BLOCKING_CAUSES.get(status)
    if status_cause:
        causes.append(status_cause)
    elif status != "approved":
        causes.append("analysis_needs_review")

    alerts = title_analysis.get("alerts")
    if isinstance(alerts, list) and any(
        isinstance(alert, dict) and alert.get("resolution", "pending") == "pending"
        for alert in alerts
    ):
        causes.append("unresolved_alerts")

    if any(
        str(variable.get("variable_key") or "").startswith(TITLE_VARIABLE_PREFIX)
        and variable.get("state") in PENDING_TITLE_VARIABLE_STATES
        for variable in variables
    ):
        causes.append("pending_manual_review")
    return causes


def _evaluate_title_gate(
    variables: list[dict[str, Any]],
    variables_by_key: dict[str, dict[str, Any]],
    title_analysis: dict[str, Any] | None,
    has_title_documents: bool,
) -> ReadinessGate:
    base_gate = _evaluate_variable_gate("title_verified", variables_by_key)
    causes = _title_analysis_blocking_causes(
        title_analysis, has_title_documents, variables
    )
    blocking = tuple(dict.fromkeys([*causes, *base_gate.blocking_variables]))
    if blocking:
        return ReadinessGate(
            gate="title_verified",
            status="blocked",
            blocking_variables=blocking,
            warnings=base_gate.warnings,
        )
    if base_gate.warnings:
        return ReadinessGate(
            gate="title_verified",
            status="needs_review",
            warnings=base_gate.warnings,
        )
    return ReadinessGate(gate="title_verified", status="ready")


def _evaluate_sii_gate(
    variables_by_key: dict[str, dict[str, Any]],
    lot_legal_data: dict[str, Any] | None,
) -> ReadinessGate:
    base_gate = _evaluate_variable_gate("sii_verified", variables_by_key)
    blocking = list(base_gate.blocking_variables)
    warnings = list(base_gate.warnings)

    if not lot_legal_data:
        blocking.append("lot_legal_data")
    else:
        role_status = lot_legal_data.get("role_status")
        matching_status = lot_legal_data.get("matching_status")
        source_legal_document_id = lot_legal_data.get("source_legal_document_id")
        if role_status not in VALID_ROLE_STATUSES:
            blocking.append("lot_legal_data.role_status")
        if matching_status not in VALID_MATCHING_STATUSES:
            blocking.append("lot_legal_data.matching_status")

        active_certificate_ids = lot_legal_data.get("_active_sii_certificate_ids")
        if (
            matching_status == "matched"
            and source_legal_document_id
            and isinstance(active_certificate_ids, set)
            and source_legal_document_id not in active_certificate_ids
        ):
            blocking.append("lot_legal_data.no_active_certificate")

        has_active_document_support = bool(source_legal_document_id)
        if isinstance(active_certificate_ids, set) and source_legal_document_id:
            has_active_document_support = source_legal_document_id in active_certificate_ids

        has_legal_support = bool(
            has_active_document_support
            or (lot_legal_data.get("reviewed_by") and lot_legal_data.get("reviewed_at"))
        )
        if role_status == "rol_en_tramite" and not has_legal_support:
            warnings.append("lot_legal_data.rol_en_tramite_support")
        if matching_status == "manual_override" and not lot_legal_data.get("reviewed_by"):
            warnings.append("lot_legal_data.manual_override_review")

    if blocking:
        return ReadinessGate(
            gate="sii_verified",
            status="blocked",
            blocking_variables=tuple(dict.fromkeys(blocking)),
            warnings=tuple(dict.fromkeys(warnings)),
        )
    if warnings:
        return ReadinessGate(
            gate="sii_verified",
            status="needs_review",
            warnings=tuple(dict.fromkeys(warnings)),
        )
    return ReadinessGate(gate="sii_verified", status="ready")


def _evaluate_warning_gate(warning_acknowledged: bool) -> ReadinessGate:
    if warning_acknowledged:
        return ReadinessGate(gate="warning_acknowledged", status="ready")
    return ReadinessGate(
        gate="warning_acknowledged",
        status="needs_review",
        warnings=(LEGAL_REVIEW_WARNING,),
    )


def _overall_status(gates: tuple[ReadinessGate, ...]) -> ReadinessStatus:
    statuses = {gate.status for gate in gates}
    if "blocked" in statuses:
        return "blocked"
    if "needs_review" in statuses:
        return "needs_review"
    return "ready"


def _plain_value(evidenced: Any) -> Any:
    """Unwrap an EvidencedValue payload to its bare domain value."""
    if isinstance(evidenced, dict):
        return evidenced.get("value")
    return evidenced


def _plain_title_inscription(inscription: dict[str, Any]) -> dict[str, Any]:
    escritura = inscription.get("escritura") or {}
    detalle = inscription.get("inscripcion") or {}
    antecesor = inscription.get("antecesor") or {}
    return {
        "orden": inscription.get("orden"),
        "tipo_adquisicion": inscription.get("tipo_adquisicion"),
        "fojas": _plain_value(detalle.get("fojas")),
        "numero": _plain_value(detalle.get("numero")),
        "anio": _plain_value(detalle.get("anio")),
        "cbr": _plain_value(detalle.get("cbr")),
        "escritura_fecha": _plain_value(escritura.get("fecha")),
        "notario": _plain_value(escritura.get("notario")),
        "repertorio": _plain_value(escritura.get("repertorio")),
        "adquirentes": [
            {
                "nombre": _plain_value(adquirente.get("nombre")),
                "cuota": adquirente.get("cuota"),
            }
            for adquirente in inscription.get("adquirentes") or []
            if isinstance(adquirente, dict)
        ],
        "antecesor": _plain_value(antecesor.get("nombre")),
    }


def _plain_title_owner(owner: dict[str, Any]) -> dict[str, Any]:
    return {
        "nombre": _plain_value(owner.get("nombre")),
        "rut": _plain_value(owner.get("rut")),
        "estado_civil": _plain_value(owner.get("estado_civil")),
        "profesion": _plain_value(owner.get("profesion")),
        "domicilio": _plain_value(owner.get("domicilio")),
        "cuota": owner.get("cuota"),
        "requiere_personeria": owner.get("requiere_personeria"),
    }


def build_title_snapshot_values(
    title_analysis: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """SDD 009 contract: an approved title contributes domain values only —
    no evidence/verified/parser metadata inside the snapshot values."""
    if not title_analysis or str(title_analysis.get("status")) != "approved":
        return None
    analysis_json = title_analysis.get("analysis_json")
    analysis_json = analysis_json if isinstance(analysis_json, dict) else {}
    alerts = title_analysis.get("alerts")
    alerts = alerts if isinstance(alerts, list) else []
    return {
        "estructura": (
            title_analysis.get("structure_type") or analysis_json.get("structure_type")
        ),
        "inscripciones": [
            _plain_title_inscription(inscription)
            for inscription in analysis_json.get("inscripciones") or []
            if isinstance(inscription, dict)
        ],
        "propietarios": [
            _plain_title_owner(owner)
            for owner in analysis_json.get("propietarios_actuales") or []
            if isinstance(owner, dict)
        ],
        "comparecencia_vendedor_texto": (
            title_analysis.get("narrative_comparecencia_edited")
            or title_analysis.get("narrative_comparecencia_generated")
        ),
        "clausula_primero_texto": (
            title_analysis.get("narrative_primero_edited")
            or title_analysis.get("narrative_primero_generated")
        ),
        "alertas_resueltas": [
            {"tipo": alert.get("tipo"), "resolution": alert.get("resolution")}
            for alert in alerts
            if isinstance(alert, dict) and alert.get("resolution", "pending") != "pending"
        ],
    }


def build_variable_snapshot(
    variables: list[dict[str, Any]],
    lot_legal_data: dict[str, Any] | None = None,
    project_legal_data: dict[str, Any] | None = None,
    title_analysis: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the stable placeholder snapshot consumed by future minuta builders."""
    snapshot: dict[str, Any] = {}
    for variable in variables:
        key = variable.get("variable_key")
        state = variable.get("state")
        if not isinstance(key, str) or state in BLOCKING_VARIABLE_STATES:
            continue
        if state == "superseded":
            continue
        if key.startswith(TITLE_VARIABLE_PREFIX):
            # Raw titulo.* rows carry EvidencedValue payloads (evidence,
            # verified, confidence); the approved analysis contributes the
            # cleaned "titulo" domain group below instead.
            continue
        snapshot[key] = {
            "value_text": variable.get("value_text"),
            "value_json": variable.get("value_json"),
            "state": state,
            "source_type": variable.get("source_type"),
            "source_ref": variable.get("source_ref") or {},
            "confidence": variable.get("confidence"),
            "reviewed_at": variable.get("reviewed_at"),
        }

    # Inject stable official SII lot and matrix variables from domain tables
    if lot_legal_data and lot_legal_data.get("matching_status") in {"matched", "manual_override"}:
        matching_status = lot_legal_data.get("matching_status")
        # sii.rol_matriz (from project level project_legal_data)
        rol_matriz = (project_legal_data or {}).get(
            "sii_role_matrix"
        ) or lot_legal_data.get("sii_role_matrix")
        if rol_matriz:
            snapshot["sii.rol_matriz"] = {
                "value_text": rol_matriz,
                "value_json": None,
                "state": "approved",
                "source_type": "document",
                "source_ref": {"source": "project_legal_data"},
                "confidence": 1.0,
            }
        # sii.comuna (from project level project_legal_data)
        comuna = (project_legal_data or {}).get("sii_comuna") or lot_legal_data.get(
            "sii_comuna"
        )
        if comuna:
            snapshot["sii.comuna"] = {
                "value_text": comuna,
                "value_json": None,
                "state": "approved",
                "source_type": "document",
                "source_ref": {"source": "project_legal_data"},
                "confidence": 1.0,
            }
        # sii.pre_rol_lote
        pre_rol = lot_legal_data.get("sii_pre_role")
        if pre_rol:
            snapshot["sii.pre_rol_lote"] = {
                "value_text": pre_rol,
                "value_json": None,
                "state": "approved",
                "source_type": "document" if matching_status == "matched" else "manual",
                "source_ref": {
                    "source": "lot_legal_data",
                    "lot_id": lot_legal_data.get("lot_id"),
                },
                "confidence": 1.0,
            }
        # sii.unidad_nombre
        unidad = lot_legal_data.get("sii_unit_name")
        if unidad:
            snapshot["sii.unidad_nombre"] = {
                "value_text": unidad,
                "value_json": None,
                "state": "approved",
                "source_type": "document" if matching_status == "matched" else "manual",
                "source_ref": {
                    "source": "lot_legal_data",
                    "lot_id": lot_legal_data.get("lot_id"),
                },
                "confidence": 1.0,
            }
        # sii.rol_avaluo_en_tramite_texto
        rol_texto = lot_legal_data.get("sii_role_in_process_text")
        if rol_texto:
            snapshot["sii.rol_avaluo_en_tramite_texto"] = {
                "value_text": rol_texto,
                "value_json": None,
                "state": "approved",
                "source_type": "document" if matching_status == "matched" else "manual",
                "source_ref": {
                    "source": "lot_legal_data",
                    "lot_id": lot_legal_data.get("lot_id"),
                },
                "confidence": 1.0,
            }
        # lote.rol_tramite and lote.rol_avaluo
        role_status = lot_legal_data.get("role_status")
        role_value = (
            lot_legal_data.get("sii_definitive_role")
            or lot_legal_data.get("sii_pre_role")
            or lot_legal_data.get("sii_role_in_process_text")
            or ""
        )
        if role_status == "rol_en_tramite" and role_value:
            snapshot["lote.rol_tramite"] = {
                "value_text": role_value,
                "value_json": None,
                "state": "approved",
                "source_type": "document" if matching_status == "matched" else "manual",
                "source_ref": {"source": "lot_legal_data"},
                "confidence": 1.0,
            }
        if role_value:
            snapshot["lote.rol_avaluo"] = {
                "value_text": role_value,
                "value_json": None,
                "state": "approved",
                "source_type": "document" if matching_status == "matched" else "manual",
                "source_ref": {"source": "lot_legal_data"},
                "confidence": 1.0,
            }

    titulo_values = build_title_snapshot_values(title_analysis)
    if titulo_values is not None:
        snapshot["titulo"] = titulo_values

    return snapshot


async def _fetch_project_sii_common_data(
    *,
    supabase: Any,
    organization_id: str,
    project_id: str,
) -> dict[str, Any] | None:
    try:
        result = await asyncio.to_thread(
            lambda: (
                supabase.table("project_legal_data")
                .select(PROJECT_SII_COMMON_COLUMNS)
                .eq("project_id", project_id)
                .eq("organization_id", organization_id)
                .maybe_single()
                .execute()
            )
        )
    except Exception as exc:
        if _is_missing_project_sii_columns_error(exc):
            logger.warning(
                "project_legal_data_sii_columns_missing_for_readiness",
                organization_id=organization_id,
                project_id=project_id,
            )
            return None
        raise
    return _first_row(result.data)


async def _fetch_active_sii_certificate_ids(
    *,
    supabase: Any,
    organization_id: str,
    project_id: str,
) -> set[str]:
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("legal_documents")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .eq("document_type", "certificado_roles_sii")
            .in_("extraction_status", sorted(ACTIVE_SII_DOCUMENT_STATUSES))
            .execute()
        )
    )
    rows = result.data if isinstance(result.data, list) else []
    return {str(row.get("id")) for row in rows if row.get("id")}


def _is_missing_project_sii_columns_error(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    message = getattr(exc, "message", None) or str(exc)
    if not code and getattr(exc, "args", None):
        first_arg = exc.args[0]
        if isinstance(first_arg, dict):
            code = first_arg.get("code")
            message = str(first_arg.get("message") or message)
    message = str(message)
    return (
        code == "42703"
        or "project_legal_data.sii_comuna" in message
        or "project_legal_data.sii_role_matrix" in message
    )


async def _fetch_current_title_analysis(
    *,
    supabase: Any,
    organization_id: str,
    project_id: str,
) -> dict[str, Any] | None:
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("title_analyses")
            .select(TITLE_ANALYSIS_READINESS_COLUMNS)
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    return _first_row(result.data)


async def _fetch_has_title_documents(
    *,
    supabase: Any,
    organization_id: str,
    project_id: str,
) -> bool:
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("legal_documents")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .in_("document_type", sorted(TITLE_DOCUMENT_TYPES))
            .in_("extraction_status", list(ACTIVE_TITLE_DOCUMENT_EXTRACTION_STATUSES))
            .limit(1)
            .execute()
        )
    )
    rows = result.data if isinstance(result.data, list) else []
    return bool(rows)


def build_evidence_snapshot(variables: list[dict[str, Any]]) -> dict[str, Any]:
    """Collect evidence already embedded on variable rows without querying OCR text."""
    snapshot: dict[str, Any] = {}
    for variable in variables:
        key = variable.get("variable_key")
        evidence_list = variable.get("evidence")
        if isinstance(key, str) and isinstance(evidence_list, list):
            snapshot[key] = [
                {
                    "legal_document_id": ev.get("legal_document_id"),
                    "legal_document_page_id": ev.get("legal_document_page_id"),
                    "page_number": ev.get("page_number"),
                    "snippet": ev.get("snippet"),
                }
                for ev in evidence_list
                if isinstance(ev, dict)
            ]
    return snapshot


def calculate_escritura_readiness(
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    variables: list[dict[str, Any]],
    lot_legal_data: dict[str, Any] | None = None,
    project_legal_data: dict[str, Any] | None = None,
    title_analysis: dict[str, Any] | None = None,
    has_title_documents: bool = False,
    warning_acknowledged: bool = False,
) -> EscrituraReadiness:
    """Evaluate SDD 007 readiness gates from canonical variables and lot legal data."""
    variables_by_key = _index_variables(variables)
    gates: list[ReadinessGate] = []

    for gate in catalog.READINESS_GATES:
        if gate == "title_verified":
            gates.append(
                _evaluate_title_gate(
                    variables, variables_by_key, title_analysis, has_title_documents
                )
            )
        elif gate == "sii_verified":
            gates.append(_evaluate_sii_gate(variables_by_key, lot_legal_data))
        elif gate == "warning_acknowledged":
            gates.append(_evaluate_warning_gate(warning_acknowledged))
        else:
            gates.append(_evaluate_variable_gate(gate, variables_by_key))

    gate_tuple = tuple(gates)
    return EscrituraReadiness(
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        readiness_status=_overall_status(gate_tuple),
        gates=gate_tuple,
        variable_snapshot=build_variable_snapshot(
            variables, lot_legal_data, project_legal_data, title_analysis
        ),
        evidence_snapshot=build_evidence_snapshot(variables),
    )


async def fetch_readiness_inputs(
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    supabase: Any | None = None,
) -> tuple[
    list[dict[str, Any]],
    dict[str, Any] | None,
    dict[str, Any] | None,
    dict[str, Any] | None,
    bool,
]:
    """Load active variable rows, lot legal data and the current title analysis."""
    if supabase is None:
        from core.database import get_supabase_client

        supabase = get_supabase_client()

    await _assert_lot_scope(
        client=supabase,
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
    )

    (
        variables_result,
        lot_legal_result,
        project_legal_data,
        active_sii_certificate_ids,
        title_analysis,
        has_title_documents,
    ) = await asyncio.gather(
        asyncio.to_thread(
            lambda: (
                supabase.table("variable_resolutions")
                .select("*")
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .or_(f"lot_id.is.null,lot_id.eq.{lot_id}")
                .is_("escritura_case_id", "null")
                .neq("state", "superseded")
                .execute()
            )
        ),
        asyncio.to_thread(
            lambda: (
                supabase.table("lot_legal_data")
                .select("*")
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .eq("lot_id", lot_id)
                .maybe_single()
                .execute()
            )
        ),
        _fetch_project_sii_common_data(
            supabase=supabase,
            organization_id=organization_id,
            project_id=project_id,
        ),
        _fetch_active_sii_certificate_ids(
            supabase=supabase,
            organization_id=organization_id,
            project_id=project_id,
        ),
        _fetch_current_title_analysis(
            supabase=supabase,
            organization_id=organization_id,
            project_id=project_id,
        ),
        _fetch_has_title_documents(
            supabase=supabase,
            organization_id=organization_id,
            project_id=project_id,
        ),
    )
    if title_analysis is None and has_title_documents:
        # Mirror get_project_title_case: documents without a recorded run mean
        # the agent is disabled (SC-007) when the feature flag is off.
        from core.config import get_settings

        if not get_settings().LEGAL_TITLE_AGENT_ENABLED:
            title_analysis = {"status": "llm_disabled"}

    variables = variables_result.data if isinstance(variables_result.data, list) else []
    lot_legal_data = _first_row(lot_legal_result.data)
    if lot_legal_data:
        lot_legal_data = dict(lot_legal_data)
        lot_legal_data["_active_sii_certificate_ids"] = active_sii_certificate_ids

    # Blend shared matrix/comuna fields into lot_legal_data for API contract consistency
    if lot_legal_data and project_legal_data:
        shared_comuna = project_legal_data.get("sii_comuna")
        shared_matrix = project_legal_data.get("sii_role_matrix")
        if shared_comuna:
            lot_legal_data["sii_comuna"] = shared_comuna
        if shared_matrix:
            lot_legal_data["sii_role_matrix"] = shared_matrix

    variable_ids = [
        variable["id"]
        for variable in variables
        if isinstance(variable.get("id"), str) and variable.get("id")
    ]
    evidence_by_variable: dict[str, list[dict[str, Any]]] = {}
    if variable_ids:
        evidence_result = await asyncio.to_thread(
            lambda: (
                supabase.table("document_evidence")
                .select("*")
                .eq("organization_id", organization_id)
                .eq("project_id", project_id)
                .in_("variable_resolution_id", variable_ids)
                .execute()
            )
        )
        if isinstance(evidence_result.data, list):
            for evidence in evidence_result.data:
                variable_id = evidence.get("variable_resolution_id")
                if isinstance(variable_id, str):
                    evidence_by_variable.setdefault(variable_id, []).append(evidence)

    for variable in variables:
        variable_id = variable.get("id")
        if isinstance(variable_id, str):
            variable["evidence"] = evidence_by_variable.get(
                variable_id,
                variable.get("evidence") if isinstance(variable.get("evidence"), list) else [],
            )
    return variables, lot_legal_data, project_legal_data, title_analysis, has_title_documents


async def get_escritura_readiness(
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    warning_acknowledged: bool = False,
    supabase: Any | None = None,
) -> EscrituraReadiness:
    (
        variables,
        lot_legal_data,
        project_legal_data,
        title_analysis,
        has_title_documents,
    ) = await fetch_readiness_inputs(
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        supabase=supabase,
    )
    readiness = calculate_escritura_readiness(
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        variables=variables,
        lot_legal_data=lot_legal_data,
        project_legal_data=project_legal_data,
        title_analysis=title_analysis,
        has_title_documents=has_title_documents,
        warning_acknowledged=warning_acknowledged,
    )
    logger.info(
        "escritura_readiness_calculated",
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        readiness_status=readiness.readiness_status,
        gate_statuses={gate.gate: gate.status for gate in readiness.gates},
        blocking_gate_count=sum(1 for gate in readiness.gates if gate.status == "blocked"),
        variable_snapshot_count=len(readiness.variable_snapshot),
        evidence_snapshot_count=len(readiness.evidence_snapshot),
    )
    return readiness


async def create_escritura_case_snapshot(
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    created_by: str | None = None,
    warning_acknowledged: bool = False,
    stage_operational: bool = True,
    supabase: Any | None = None,
) -> dict[str, Any]:
    """Create a draft escritura case row with deterministic readiness snapshots."""
    if supabase is None:
        from core.database import get_supabase_client

        supabase = get_supabase_client()

    if stage_operational:
        # SDD 008 US6: stage comprador/transaccion/lote/servidumbre proposals
        # from operational rows before snapshotting, so the party/price/
        # geometry gates see them. A bridge failure must not block the case:
        # the affected keys simply stay missing and the gates surface them.
        from services.escritura_operational_bridge import stage_operational_variables

        try:
            await stage_operational_variables(
                organization_id=organization_id,
                project_id=project_id,
                lot_id=lot_id,
                supabase=supabase,
            )
        except Exception as exc:  # pragma: no cover - defensive logging path
            logger.warning(
                "operational_bridge_staging_failed",
                organization_id=organization_id,
                project_id=project_id,
                lot_id=lot_id,
                error=str(exc),
            )

    readiness = await get_escritura_readiness(
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        warning_acknowledged=warning_acknowledged,
        supabase=supabase,
    )
    case_status = (
        "ready_for_minuta"
        if readiness.readiness_status == "ready"
        else "variables_pending"
    )
    payload = {
        "organization_id": organization_id,
        "project_id": project_id,
        "lot_id": lot_id,
        "case_status": case_status,
        "readiness_status": readiness.readiness_status,
        "readiness_gates": {gate.gate: gate.to_dict() for gate in readiness.gates},
        "variable_snapshot": readiness.variable_snapshot,
        "evidence_snapshot": readiness.evidence_snapshot,
        "created_by": created_by,
    }

    existing_result = await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_cases")
            .select("*")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .eq("lot_id", lot_id)
            .neq("case_status", "cancelled")
            .maybe_single()
            .execute()
        )
    )
    existing_row = _first_row(existing_result.data)
    if existing_row:
        result = await asyncio.to_thread(
            lambda: (
                supabase.table("escritura_cases")
                .update(payload)
                .eq("id", existing_row["id"])
                .execute()
            )
        )
    else:
        result = await asyncio.to_thread(
            lambda: supabase.table("escritura_cases").insert(payload).execute()
        )

    row = _first_row(result.data)
    logger.info(
        "escritura_case_snapshot_persisted",
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        escritura_case_id=(row or existing_row or {}).get("id"),
        case_status=payload["case_status"],
        readiness_status=payload["readiness_status"],
        variable_snapshot_count=len(readiness.variable_snapshot),
        evidence_snapshot_count=len(readiness.evidence_snapshot),
        operation="update" if existing_row else "insert",
    )
    if not row:
        return {**existing_row, **payload} if existing_row else payload
    return row
