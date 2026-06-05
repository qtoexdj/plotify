"""SII role matching service for SDD 007.

This module intentionally keeps matching pure and deterministic. Supabase access
is isolated behind async functions so imports do not initialize external clients.
"""

from __future__ import annotations

import asyncio
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from services.legal_variable_catalog import ROLE_MATCHING_STATUS_SET, ROLE_STATUS_SET


MATCH_SCORE_THRESHOLD = 0.70
AMBIGUOUS_SCORE_DELTA = 0.03
SII_UNIT_VARIABLE_KEYS = frozenset(
    {
        "sii.unidad_nombre",
        "sii.rol_matriz",
        "sii.pre_rol_lote",
        "sii.rol_avaluo_en_tramite_texto",
    }
)


class LegalRoleMatchingError(ValueError):
    """Base error for SII lot role matching."""


class LegalRoleMatchingScopeError(LegalRoleMatchingError):
    """Raised when a lot or project is outside the requested organization scope."""


class LegalRoleMatchingNotFoundError(LegalRoleMatchingError):
    """Raised when a role matching resource cannot be found."""

_LOT_WORDS = frozenset(
    {
        "LOTE",
        "LOT",
        "UNIDAD",
        "UNID",
        "PARCELA",
        "PARC",
        "SITIO",
        "N",
        "NO",
        "NUMERO",
    }
)


@dataclass(frozen=True, slots=True)
class ProjectLot:
    id: str
    project_id: str
    organization_id: str
    lot_number: str


@dataclass(frozen=True, slots=True)
class SiiRoleUnit:
    unit_name: str
    role_matrix: str | None = None
    pre_role: str | None = None
    role_in_process_text: str | None = None
    definitive_role: str | None = None
    source_legal_document_id: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class RoleMatchCandidate:
    lot_id: str
    unit: SiiRoleUnit
    score: float
    reasons: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class LotRoleMatchResult:
    organization_id: str
    project_id: str
    lot_id: str
    lot_number: str
    sii_unit_name: str | None
    sii_role_matrix: str | None
    sii_pre_role: str | None
    sii_role_in_process_text: str | None
    sii_definitive_role: str | None
    role_status: str
    matching_status: str
    matching_score: float | None
    source_legal_document_id: str | None
    candidates: tuple[RoleMatchCandidate, ...] = ()

    def to_lot_legal_data_record(self) -> dict[str, Any]:
        validate_role_status(self.role_status)
        validate_matching_status(self.matching_status)
        return {
            "organization_id": self.organization_id,
            "project_id": self.project_id,
            "lot_id": self.lot_id,
            "sii_unit_name": self.sii_unit_name,
            "sii_role_matrix": self.sii_role_matrix,
            "sii_pre_role": self.sii_pre_role,
            "sii_role_in_process_text": self.sii_role_in_process_text,
            "sii_definitive_role": self.sii_definitive_role,
            "role_status": self.role_status,
            "matching_status": self.matching_status,
            "matching_score": self.matching_score,
            "source_legal_document_id": self.source_legal_document_id,
        }


def normalize_lot_name(value: str | None) -> str:
    """Normalize lot/unit names for stable Chilean SII certificate matching."""
    if not value:
        return ""

    text = unicodedata.normalize("NFKD", value)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.upper()
    text = text.replace("N°", " ").replace("Nº", " ").replace("°", " ")
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    tokens = [token for token in text.split() if token not in _LOT_WORDS]
    return " ".join(tokens)


def lot_identity_tokens(value: str | None) -> tuple[str, ...]:
    normalized = normalize_lot_name(value)
    if not normalized:
        return ()
    tokens = normalized.split()
    numbers = re.findall(r"\d+", normalized)
    return tuple(dict.fromkeys(numbers + tokens))


def validate_role_status(status: str) -> str:
    if status not in ROLE_STATUS_SET:
        raise ValueError(f"Invalid SII role_status: {status}")
    return status


def validate_matching_status(status: str) -> str:
    if status not in ROLE_MATCHING_STATUS_SET:
        raise ValueError(f"Invalid SII matching_status: {status}")
    return status


def infer_role_status(unit: SiiRoleUnit | None) -> str:
    if unit is None:
        return "missing"
    if _has_text(unit.definitive_role):
        return "definitive"
    if _has_text(unit.pre_role) or _has_text(unit.role_in_process_text):
        return "rol_en_tramite"
    return "missing"


def score_lot_unit_match(lot_number: str, unit_name: str) -> tuple[float, tuple[str, ...]]:
    lot_normalized = normalize_lot_name(lot_number)
    unit_normalized = normalize_lot_name(unit_name)
    if not lot_normalized or not unit_normalized:
        return 0.0, ()

    if lot_normalized == unit_normalized:
        return 1.0, ("normalized_exact",)

    lot_tokens = set(lot_identity_tokens(lot_number))
    unit_tokens = set(lot_identity_tokens(unit_name))
    lot_numbers = set(re.findall(r"\d+", lot_normalized))
    unit_numbers = set(re.findall(r"\d+", unit_normalized))
    reasons: list[str] = []
    score = 0.0

    if lot_numbers and lot_numbers == unit_numbers:
        score = max(score, 0.95)
        reasons.append("number_exact")
    elif lot_numbers and lot_numbers & unit_numbers:
        score = max(score, 0.74)
        reasons.append("number_overlap")

    if lot_tokens and lot_tokens <= unit_tokens:
        score = max(score, 0.88)
        reasons.append("lot_tokens_subset")
    elif lot_tokens and unit_tokens:
        overlap = len(lot_tokens & unit_tokens) / len(lot_tokens | unit_tokens)
        if overlap:
            score = max(score, min(0.86, overlap))
            reasons.append("token_overlap")

    if lot_normalized in unit_normalized or unit_normalized in lot_normalized:
        score = max(score, 0.82)
        reasons.append("normalized_contains")

    return round(score, 4), tuple(dict.fromkeys(reasons))


def match_sii_roles_to_lots(
    lots: list[ProjectLot],
    sii_units: list[SiiRoleUnit],
) -> list[LotRoleMatchResult]:
    """Classify every lot as matched, ambiguous or missing without silent fallback."""
    results: list[LotRoleMatchResult] = []

    for lot in lots:
        candidates = sorted(
            (
                RoleMatchCandidate(lot.id, unit, score, reasons)
                for unit in sii_units
                for score, reasons in [score_lot_unit_match(lot.lot_number, unit.unit_name)]
                if score >= MATCH_SCORE_THRESHOLD
            ),
            key=lambda candidate: candidate.score,
            reverse=True,
        )

        top = candidates[0] if candidates else None
        competing = (
            tuple(
                candidate
                for candidate in candidates
                if top is not None
                and top.score - candidate.score <= AMBIGUOUS_SCORE_DELTA
            )
            if top
            else ()
        )

        if top is None:
            results.append(_missing_result(lot))
            continue

        if len(competing) > 1:
            results.append(_result_from_candidate(lot, top, "ambiguous", competing))
            continue

        results.append(_result_from_candidate(lot, top, "matched", tuple(candidates)))

    return results


async def fetch_project_lots(
    project_id: str,
    organization_id: str,
    *,
    supabase: Any | None = None,
) -> list[ProjectLot]:
    client = supabase or _get_supabase_client()
    result = await asyncio.to_thread(
        lambda: (
            client.table("lots")
            .select("id, project_id, numero_lote, projects!inner(organization_id)")
            .eq("project_id", project_id)
            .eq("projects.organization_id", organization_id)
            .execute()
        )
    )
    return [
        ProjectLot(
            id=str(row["id"]),
            project_id=str(row["project_id"]),
            organization_id=organization_id,
            lot_number=str(row.get("numero_lote") or ""),
        )
        for row in (result.data or [])
    ]


async def persist_lot_role_matches(
    matches: list[LotRoleMatchResult],
    *,
    supabase: Any | None = None,
) -> list[dict[str, Any]]:
    if not matches:
        return []

    client = supabase or _get_supabase_client()
    records = [match.to_lot_legal_data_record() for match in matches]
    result = await asyncio.to_thread(
        lambda: (
            client.table("lot_legal_data")
            .upsert(records, on_conflict="lot_id")
            .execute()
        )
    )
    return list(result.data or [])


async def fetch_sii_role_units_from_variables(
    project_id: str,
    organization_id: str,
    *,
    legal_document_id: str | None = None,
    supabase: Any | None = None,
) -> list[SiiRoleUnit]:
    client = supabase or _get_supabase_client()

    def _query():
        query = (
            client.table("variable_resolutions")
            .select("id, variable_key, value_text, value_json, source_ref")
            .eq("project_id", project_id)
            .eq("organization_id", organization_id)
        )
        if hasattr(query, "in_"):
            query = query.in_("variable_key", sorted(SII_UNIT_VARIABLE_KEYS))
        return query.execute()

    result = await asyncio.to_thread(_query)
    rows = [
        row
        for row in (result.data or [])
        if row.get("variable_key") in SII_UNIT_VARIABLE_KEYS
    ]
    if legal_document_id:
        rows = [
            row
            for row in rows
            if _source_legal_document_id(row) == legal_document_id
        ]

    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        source_ref = row.get("source_ref") or {}
        unit_key = str(source_ref.get("unit_index") or row.get("id"))
        grouped.setdefault(
            unit_key,
            {
                "source_ref": source_ref,
                "source_legal_document_id": _source_legal_document_id(row),
            },
        )
        grouped[unit_key][str(row.get("variable_key"))] = row.get("value_text")

    units: list[SiiRoleUnit] = []
    role_in_process_text = next(
        (
            str(row.get("value_text") or "")
            for row in rows
            if row.get("variable_key") == "sii.rol_avaluo_en_tramite_texto"
            and _has_text(str(row.get("value_text") or ""))
        ),
        None,
    )
    role_matrix = next(
        (
            str(row.get("value_text") or "")
            for row in rows
            if row.get("variable_key") == "sii.rol_matriz"
            and _has_text(str(row.get("value_text") or ""))
        ),
        None,
    )

    for data in grouped.values():
        unit_name = data.get("sii.unidad_nombre")
        if not _has_text(unit_name):
            continue
        units.append(
            SiiRoleUnit(
                unit_name=str(unit_name),
                role_matrix=str(data.get("sii.rol_matriz") or role_matrix or "")
                or None,
                pre_role=str(data.get("sii.pre_rol_lote") or "") or None,
                role_in_process_text=str(
                    data.get("sii.rol_avaluo_en_tramite_texto")
                    or role_in_process_text
                    or ""
                )
                or None,
                source_legal_document_id=data.get("source_legal_document_id"),
                raw={"source_ref": data.get("source_ref") or {}},
            )
        )
    return units


async def list_lot_role_inventory(
    *,
    project_id: str,
    organization_id: str,
    supabase: Any | None = None,
) -> list[dict[str, Any]]:
    client = supabase or _get_supabase_client()
    result = await asyncio.to_thread(
        lambda: (
            client.table("lot_legal_data")
            .select("*")
            .eq("project_id", project_id)
            .eq("organization_id", organization_id)
            .execute()
        )
    )
    return list(result.data or [])


async def get_project_role_matching_inventory(
    *,
    project_id: str,
    organization_id: str,
    legal_document_id: str | None = None,
    force_recompute: bool = False,
    supabase: Any | None = None,
) -> dict[str, Any]:
    lots = await fetch_project_lots(
        project_id,
        organization_id,
        supabase=supabase,
    )
    if not lots:
        raise LegalRoleMatchingNotFoundError("Project has no lots in this organization")

    existing_rows = await list_lot_role_inventory(
        project_id=project_id,
        organization_id=organization_id,
        supabase=supabase,
    )
    existing_by_lot = {str(row.get("lot_id")): row for row in existing_rows}
    manual_lot_ids = {
        lot_id
        for lot_id, row in existing_by_lot.items()
        if row.get("matching_status") == "manual_override" and not force_recompute
    }

    units = await fetch_sii_role_units_from_variables(
        project_id,
        organization_id,
        legal_document_id=legal_document_id,
        supabase=supabase,
    )
    auto_lots = [lot for lot in lots if lot.id not in manual_lot_ids]
    auto_matches = match_sii_roles_to_lots(auto_lots, units)
    persisted_rows = await persist_lot_role_matches(auto_matches, supabase=supabase)
    persisted_by_lot = {str(row.get("lot_id")): row for row in persisted_rows}

    lot_number_by_id = {lot.id: lot.lot_number for lot in lots}
    rows: list[dict[str, Any]] = []
    for lot in lots:
        row = (
            existing_by_lot.get(lot.id)
            if lot.id in manual_lot_ids
            else persisted_by_lot.get(lot.id)
            or existing_by_lot.get(lot.id)
            or _missing_result(lot).to_lot_legal_data_record()
        )
        rows.append(_response_row(row, lot_number_by_id))

    return {
        "project_id": project_id,
        "lots": rows,
        "summary": summarize_role_inventory(rows),
    }


async def build_and_persist_role_matches(
    *,
    project_id: str,
    organization_id: str,
    sii_units: list[SiiRoleUnit],
    supabase: Any | None = None,
) -> list[LotRoleMatchResult]:
    lots = await fetch_project_lots(
        project_id,
        organization_id,
        supabase=supabase,
    )
    matches = match_sii_roles_to_lots(lots, sii_units)
    await persist_lot_role_matches(matches, supabase=supabase)
    return matches


async def apply_manual_role_override(
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    sii_unit_name: str | None,
    role_status: str,
    reason: str,
    sii_role_matrix: str | None = None,
    sii_pre_role: str | None = None,
    sii_role_in_process_text: str | None = None,
    sii_definitive_role: str | None = None,
    source_legal_document_id: str | None = None,
    reviewed_by: str | None = None,
    supabase: Any | None = None,
) -> dict[str, Any]:
    validate_role_status(role_status)
    validate_matching_status("manual_override")
    if not reason.strip():
        raise ValueError("Manual SII role override requires a reason")
    if not _has_text(reviewed_by):
        raise LegalRoleMatchingError("Manual SII role override requires reviewed_by")

    client = supabase or _get_supabase_client()
    await _assert_lot_scope(
        client=client,
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
    )
    record: dict[str, Any] = {
        "organization_id": organization_id,
        "project_id": project_id,
        "lot_id": lot_id,
        "sii_unit_name": sii_unit_name,
        "sii_role_matrix": sii_role_matrix,
        "sii_pre_role": sii_pre_role,
        "sii_role_in_process_text": sii_role_in_process_text,
        "sii_definitive_role": sii_definitive_role,
        "role_status": role_status,
        "matching_status": "manual_override",
        "matching_score": 1.0,
        "source_legal_document_id": source_legal_document_id,
    }
    if reviewed_by:
        record["reviewed_by"] = reviewed_by
        record["reviewed_at"] = datetime.now(timezone.utc).isoformat()

    result = await asyncio.to_thread(
        lambda: (
            client.table("lot_legal_data")
            .upsert(record, on_conflict="lot_id")
            .execute()
        )
    )
    row = (result.data or [record])[0]
    if reviewed_by:
        await _insert_manual_override_decision(
            client=client,
            organization_id=organization_id,
            project_id=project_id,
            lot_id=lot_id,
            reason=reason.strip(),
            reviewed_by=reviewed_by,
        )
    return row


def summarize_role_matches(matches: list[LotRoleMatchResult]) -> dict[str, int]:
    summary = {status: 0 for status in sorted(ROLE_MATCHING_STATUS_SET)}
    for match in matches:
        validate_matching_status(match.matching_status)
        summary[match.matching_status] += 1
    return summary


def summarize_role_inventory(rows: list[dict[str, Any]]) -> dict[str, int]:
    summary = {status: 0 for status in sorted(ROLE_MATCHING_STATUS_SET)}
    summary["total"] = len(rows)
    for row in rows:
        status = str(row.get("matching_status") or "missing")
        validate_matching_status(status)
        summary[status] += 1
    return summary


def _result_from_candidate(
    lot: ProjectLot,
    candidate: RoleMatchCandidate,
    matching_status: str,
    candidates: tuple[RoleMatchCandidate, ...],
) -> LotRoleMatchResult:
    validate_matching_status(matching_status)
    unit = candidate.unit
    role_status = infer_role_status(unit)
    validate_role_status(role_status)
    return LotRoleMatchResult(
        organization_id=lot.organization_id,
        project_id=lot.project_id,
        lot_id=lot.id,
        lot_number=lot.lot_number,
        sii_unit_name=unit.unit_name,
        sii_role_matrix=unit.role_matrix,
        sii_pre_role=unit.pre_role,
        sii_role_in_process_text=unit.role_in_process_text,
        sii_definitive_role=unit.definitive_role,
        role_status=role_status,
        matching_status=matching_status,
        matching_score=candidate.score,
        source_legal_document_id=unit.source_legal_document_id,
        candidates=candidates,
    )


def _missing_result(lot: ProjectLot) -> LotRoleMatchResult:
    return LotRoleMatchResult(
        organization_id=lot.organization_id,
        project_id=lot.project_id,
        lot_id=lot.id,
        lot_number=lot.lot_number,
        sii_unit_name=None,
        sii_role_matrix=None,
        sii_pre_role=None,
        sii_role_in_process_text=None,
        sii_definitive_role=None,
        role_status="missing",
        matching_status="missing",
        matching_score=None,
        source_legal_document_id=None,
    )


def _has_text(value: str | None) -> bool:
    return bool(value and value.strip())


def _source_legal_document_id(row: dict[str, Any]) -> str | None:
    source_ref = row.get("source_ref") or {}
    value = source_ref.get("legal_document_id") or source_ref.get("document_id")
    return str(value) if value else None


def _response_row(
    row: dict[str, Any],
    lot_number_by_id: dict[str, str],
) -> dict[str, Any]:
    lot_id = str(row.get("lot_id") or "")
    return {
        **row,
        "id": str(row.get("id") or lot_id),
        "lot_id": lot_id,
        "lot_number": lot_number_by_id.get(lot_id),
    }


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
        raise LegalRoleMatchingScopeError("Lot is outside the requested organization/project")


async def _insert_manual_override_decision(
    *,
    client: Any,
    organization_id: str,
    project_id: str,
    lot_id: str,
    reason: str,
    reviewed_by: str,
) -> None:
    payload = {
        "organization_id": organization_id,
        "project_id": project_id,
        "lot_id": lot_id,
        "decision_type": "manual_override",
        "decision_status": "approved",
        "reason": reason,
        "decided_by": reviewed_by,
        "decided_at": datetime.now(timezone.utc).isoformat(),
    }
    await asyncio.to_thread(
        lambda: client.table("legal_review_decisions").insert(payload).execute()
    )


def _get_supabase_client() -> Any:
    from core.database import get_supabase_client

    return get_supabase_client()


__all__ = [
    "LotRoleMatchResult",
    "ProjectLot",
    "RoleMatchCandidate",
    "SiiRoleUnit",
    "apply_manual_role_override",
    "build_and_persist_role_matches",
    "fetch_project_lots",
    "fetch_sii_role_units_from_variables",
    "get_project_role_matching_inventory",
    "infer_role_status",
    "LegalRoleMatchingError",
    "LegalRoleMatchingNotFoundError",
    "LegalRoleMatchingScopeError",
    "list_lot_role_inventory",
    "lot_identity_tokens",
    "match_sii_roles_to_lots",
    "normalize_lot_name",
    "persist_lot_role_matches",
    "score_lot_unit_match",
    "summarize_role_matches",
    "summarize_role_inventory",
    "validate_matching_status",
    "validate_role_status",
]
