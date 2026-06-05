"""Escritura readiness service skeleton for SDD 007.

The pure helpers in this module are intentionally deterministic and have no
Supabase side effects. Persistence helpers are async wrappers around the
currently synchronous Supabase client.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Literal

from services import legal_variable_catalog as catalog


ReadinessStatus = Literal["blocked", "needs_review", "ready"]

READY_VARIABLE_STATES = frozenset(("approved", "resolved", "derived", "not_applicable"))
REVIEW_VARIABLE_STATES = frozenset(("proposed",))
BLOCKING_VARIABLE_STATES = frozenset(catalog.VARIABLE_BLOCKING_STATES)
VALID_ROLE_STATUSES = frozenset(("definitive", "rol_en_tramite", "not_applicable"))
VALID_MATCHING_STATUSES = frozenset(("matched", "manual_override"))
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
        if role_status not in VALID_ROLE_STATUSES:
            blocking.append("lot_legal_data.role_status")
        if matching_status not in VALID_MATCHING_STATUSES:
            blocking.append("lot_legal_data.matching_status")

        has_legal_support = bool(
            lot_legal_data.get("source_legal_document_id")
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


def build_variable_snapshot(variables: list[dict[str, Any]]) -> dict[str, Any]:
    """Build the stable placeholder snapshot consumed by future minuta builders."""
    snapshot: dict[str, Any] = {}
    for variable in variables:
        key = variable.get("variable_key")
        state = variable.get("state")
        if not isinstance(key, str) or state in BLOCKING_VARIABLE_STATES:
            continue
        if state == "superseded":
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
    return snapshot


def build_evidence_snapshot(variables: list[dict[str, Any]]) -> dict[str, Any]:
    """Collect evidence already embedded on variable rows without querying OCR text."""
    snapshot: dict[str, Any] = {}
    for variable in variables:
        key = variable.get("variable_key")
        evidence = variable.get("evidence")
        if isinstance(key, str) and isinstance(evidence, list):
            snapshot[key] = evidence
    return snapshot


def calculate_escritura_readiness(
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    variables: list[dict[str, Any]],
    lot_legal_data: dict[str, Any] | None = None,
    warning_acknowledged: bool = False,
) -> EscrituraReadiness:
    """Evaluate SDD 007 readiness gates from canonical variables and lot legal data."""
    variables_by_key = _index_variables(variables)
    gates: list[ReadinessGate] = []

    for gate in catalog.READINESS_GATES:
        if gate == "sii_verified":
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
        variable_snapshot=build_variable_snapshot(variables),
        evidence_snapshot=build_evidence_snapshot(variables),
    )


async def fetch_readiness_inputs(
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    supabase: Any | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Load active variable rows and lot legal data needed by readiness calculation."""
    if supabase is None:
        from core.database import get_supabase_client

        supabase = get_supabase_client()

    await _assert_lot_scope(
        client=supabase,
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
    )

    variables_result, lot_legal_result = await asyncio.gather(
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
    )
    variables = variables_result.data if isinstance(variables_result.data, list) else []
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
    return variables, _first_row(lot_legal_result.data)


async def get_escritura_readiness(
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    warning_acknowledged: bool = False,
    supabase: Any | None = None,
) -> EscrituraReadiness:
    variables, lot_legal_data = await fetch_readiness_inputs(
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        supabase=supabase,
    )
    return calculate_escritura_readiness(
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        variables=variables,
        lot_legal_data=lot_legal_data,
        warning_acknowledged=warning_acknowledged,
    )


async def create_escritura_case_snapshot(
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    created_by: str | None = None,
    warning_acknowledged: bool = False,
    supabase: Any | None = None,
) -> dict[str, Any]:
    """Create a draft escritura case row with deterministic readiness snapshots."""
    if supabase is None:
        from core.database import get_supabase_client

        supabase = get_supabase_client()

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
    if not row:
        return {**existing_row, **payload} if existing_row else payload
    return row
