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
    if not reason.strip():
        raise ValueError("Manual SII role override requires a reason")

    client = supabase or _get_supabase_client()
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
    return (result.data or [record])[0]


def summarize_role_matches(matches: list[LotRoleMatchResult]) -> dict[str, int]:
    summary = {status: 0 for status in sorted(ROLE_MATCHING_STATUS_SET)}
    for match in matches:
        validate_matching_status(match.matching_status)
        summary[match.matching_status] += 1
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
    "infer_role_status",
    "lot_identity_tokens",
    "match_sii_roles_to_lots",
    "normalize_lot_name",
    "persist_lot_role_matches",
    "score_lot_unit_match",
    "summarize_role_matches",
    "validate_matching_status",
    "validate_role_status",
]
