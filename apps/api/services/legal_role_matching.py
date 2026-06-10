"""SII role matching service for SDD 007.

This module intentionally keeps matching pure and deterministic. Supabase access
is isolated behind async functions so imports do not initialize external clients.
"""

from __future__ import annotations

import asyncio
import logging
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
PROJECT_SII_COMMON_COLUMNS = (
    "sii_comuna, sii_role_matrix, "
    "sii_roles_source_legal_document_id, sii_roles_status"
)

logger = logging.getLogger(__name__)


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
    sii_lot_number_normalized: str | None
    sii_comuna: str | None
    sii_role_record: dict[str, Any] | None
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
            "sii_role_matrix": None,
            "sii_pre_role": self.sii_pre_role,
            "sii_role_in_process_text": self.sii_role_in_process_text,
            "sii_definitive_role": self.sii_definitive_role,
            "sii_lot_number_normalized": self.sii_lot_number_normalized,
            "sii_comuna": None,
            "sii_role_record": self.sii_role_record,
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
    candidates_by_lot: dict[str, list[RoleMatchCandidate]] = {}
    lot_ids_by_row_key: dict[tuple[object, ...], set[str]] = {}

    for lot in lots:
        candidates: list[RoleMatchCandidate] = []
        for unit in sii_units:
            score_reasons = _score_extracted_lot_number_match(lot.lot_number, unit)
            if score_reasons is None:
                continue
            score, reasons = score_reasons
            candidate = RoleMatchCandidate(lot.id, unit, score, reasons)
            candidates.append(candidate)
            lot_ids_by_row_key.setdefault(_sii_role_row_key(unit), set()).add(lot.id)
        candidates_by_lot[lot.id] = sorted(
            candidates,
            key=lambda candidate: candidate.score,
            reverse=True,
        )

    results: list[LotRoleMatchResult] = []

    for lot in lots:
        candidates = candidates_by_lot.get(lot.id, [])
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

        if (
            len(competing) > 1
            or len(lot_ids_by_row_key.get(_sii_role_row_key(top.unit), set())) > 1
        ):
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

    # 1. Upsert shared matrix/project legal data if an active certificate exists
    project_id = matches[0].project_id
    organization_id = matches[0].organization_id
    source_doc_id = None

    for m in matches:
        if m.source_legal_document_id:
            source_doc_id = m.source_legal_document_id

    sii_comuna, sii_role_matrix = _shared_sii_values_from_matches(matches)
    project_common_persisted = await _upsert_project_sii_common_data(
        client=client,
        organization_id=organization_id,
        project_id=project_id,
        sii_comuna=sii_comuna,
        sii_role_matrix=sii_role_matrix,
        source_legal_document_id=source_doc_id,
        status="variables_proposed",
    )

    # 2. Upsert lot-specific records into lot_legal_data
    records = []
    for match in matches:
        record = match.to_lot_legal_data_record()
        if source_doc_id and not project_common_persisted:
            record["sii_comuna"] = match.sii_comuna
            record["sii_role_matrix"] = match.sii_role_matrix
        records.append(record)
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
    active_legal_document_id = legal_document_id
    if active_legal_document_id is None:
        active_legal_document_id = await _active_sii_certificate_document_id(
            project_id=project_id,
            organization_id=organization_id,
            supabase=client,
        )

    if active_legal_document_id is None:
        return []

    def _query():
        query = (
            client.table("variable_resolutions")
            .select("id, variable_key, value_text, value_json, source_ref, state")
            .eq("project_id", project_id)
            .eq("organization_id", organization_id)
            .neq("state", "superseded")
        )
        if hasattr(query, "in_"):
            query = query.in_("variable_key", sorted(SII_UNIT_VARIABLE_KEYS))
        return query.execute()

    result = await asyncio.to_thread(_query)
    rows = [
        row
        for row in (result.data or [])
        if row.get("variable_key") in SII_UNIT_VARIABLE_KEYS
        and row.get("state") != "superseded"
    ]
    if active_legal_document_id:
        rows = [
            row
            for row in rows
            if _source_legal_document_id(row) == active_legal_document_id
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
                role_matrix=str(
                    data.get("sii.rol_matriz")
                    or (data.get("source_ref") or {}).get("role_matrix")
                    or role_matrix
                    or ""
                )
                or None,
                pre_role=str(data.get("sii.pre_rol_lote") or "") or None,
                role_in_process_text=str(
                    data.get("sii.rol_avaluo_en_tramite_texto")
                    or role_in_process_text
                    or ""
                )
                or None,
                source_legal_document_id=data.get("source_legal_document_id"),
                raw=data.get("source_ref") or {},
            )
        )
    return units


async def _active_sii_certificate_document_id(
    *,
    project_id: str,
    organization_id: str,
    supabase: Any,
) -> str | None:
    from services.legal_document_ingestion import (
        LegalDocumentNotFoundError,
        get_active_legal_document_for_type,
    )

    try:
        document = await get_active_legal_document_for_type(
            project_id=project_id,
            organization_id=organization_id,
            document_type="certificado_roles_sii",
            supabase=supabase,
        )
    except LegalDocumentNotFoundError:
        return None
    return document.id


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


async def _fetch_project_sii_common_data(
    *,
    client: Any,
    organization_id: str,
    project_id: str,
) -> dict[str, Any]:
    try:
        result = await asyncio.to_thread(
            lambda: (
                client.table("project_legal_data")
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
                "project_legal_data_sii_columns_missing",
                extra={
                    "organization_id": organization_id,
                    "project_id": project_id,
                },
            )
            return {}
        raise

    data = getattr(result, "data", None) or {}
    return data if isinstance(data, dict) else {}


async def _upsert_project_sii_common_data(
    *,
    client: Any,
    organization_id: str,
    project_id: str,
    sii_comuna: str | None,
    sii_role_matrix: str | None,
    source_legal_document_id: str | None,
    status: str | None,
) -> bool:
    project_record: dict[str, Any] = {
        "project_id": project_id,
        "organization_id": organization_id,
    }
    if _has_text(sii_comuna):
        project_record["sii_comuna"] = sii_comuna
    if _has_text(sii_role_matrix):
        project_record["sii_role_matrix"] = sii_role_matrix
    if _has_text(source_legal_document_id):
        project_record["sii_roles_source_legal_document_id"] = source_legal_document_id
    if _has_text(status):
        project_record["sii_roles_status"] = status

    if len(project_record) <= 2:
        return False

    try:
        await asyncio.to_thread(
            lambda: (
                client.table("project_legal_data")
                .upsert(project_record, on_conflict="project_id")
                .execute()
            )
        )
    except Exception as exc:
        if _is_missing_project_sii_columns_error(exc):
            logger.warning(
                "project_legal_data_sii_upsert_skipped_missing_columns",
                extra={
                    "organization_id": organization_id,
                    "project_id": project_id,
                },
            )
            return False
        raise
    return True


def _shared_sii_values_from_matches(
    matches: list[LotRoleMatchResult],
) -> tuple[str | None, str | None]:
    comunas = _single_text_value(match.sii_comuna for match in matches)
    role_matrices = _single_text_value(match.sii_role_matrix for match in matches)
    return comunas, role_matrices


def _single_text_value(values: Any) -> str | None:
    unique = {
        str(value).strip()
        for value in values
        if isinstance(value, str) and _has_text(value)
    }
    if len(unique) == 1:
        return next(iter(unique))
    return None


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
        or "project_legal_data.sii_roles_source_legal_document_id" in message
        or "project_legal_data.sii_roles_status" in message
    )


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

    client = supabase or _get_supabase_client()

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
    p_legal = await _fetch_project_sii_common_data(
        client=client,
        organization_id=organization_id,
        project_id=project_id,
    )
    shared_comuna = p_legal.get("sii_comuna")
    shared_matrix = p_legal.get("sii_role_matrix")
    derived_comuna, derived_matrix = _shared_sii_values_from_matches(auto_matches)
    shared_comuna = shared_comuna or derived_comuna
    shared_matrix = shared_matrix or derived_matrix

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
        row_copy = dict(row)
        if shared_comuna and not row_copy.get("sii_comuna"):
            row_copy["sii_comuna"] = shared_comuna
        if shared_matrix and not row_copy.get("sii_role_matrix"):
            row_copy["sii_role_matrix"] = shared_matrix
        rows.append(_response_row(row_copy, lot_number_by_id))
    summary = summarize_role_inventory(rows)

    client = supabase or _get_supabase_client()
    active_certificate_count = 0
    superseded_certificate_count = 0
    try:
        docs_res = await asyncio.to_thread(
            lambda: (
                client.table("legal_documents")
                .select("id, extraction_status, superseded_by")
                .eq("project_id", project_id)
                .eq("organization_id", organization_id)
                .eq("document_type", "certificado_roles_sii")
                .execute()
            )
        )
        for doc in (docs_res.data or []):
            if doc.get("extraction_status") == "superseded" or doc.get("superseded_by") is not None:
                superseded_certificate_count += 1
            else:
                active_certificate_count += 1
    except Exception:
        if units:
            active_certificate_count = 1

    return {
        "project_id": project_id,
        "lots": rows,
        "summary": summary,
        "certificate_summary": summarize_sii_certificate_units(
            units,
            summary,
            active_certificate_count=active_certificate_count,
            superseded_certificate_count=superseded_certificate_count,
        ),
        "review_counts": {
            "matched": summary["matched"],
            "ambiguous": summary["ambiguous"],
            "missing": summary["missing"],
            "manual_override": summary["manual_override"],
        },
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
    sii_lot_number_normalized: str | None = None,
    sii_comuna: str | None = None,
    sii_role_record: dict[str, Any] | None = None,
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

    if role_status == "rol_en_tramite" and sii_pre_role and sii_comuna:
        expected_text = f"Rol de avaluo en tramite numero {sii_pre_role} de la comuna de {sii_comuna}"
        if sii_role_in_process_text is None or sii_role_in_process_text == "":
            sii_role_in_process_text = expected_text
        elif sii_role_in_process_text.strip() != expected_text:
            raise LegalRoleMatchingError(
                f"Stale client sii_role_in_process_text mismatch. Expected: '{expected_text}', got: '{sii_role_in_process_text}'"
            )

        if not sii_lot_number_normalized:
            lot_res = await asyncio.to_thread(
                lambda: client.table("lots")
                .select("numero_lote")
                .eq("id", lot_id)
                .eq("project_id", project_id)
                .maybe_single()
                .execute()
            )
            if lot_res.data:
                sii_lot_number_normalized = str(lot_res.data.get("numero_lote") or "")

        if not sii_role_record:
            sii_role_record = {
                "lot_number": sii_lot_number_normalized,
                "role": sii_pre_role,
                "comuna": sii_comuna,
                "role_matrix": sii_role_matrix,
                "parser": "manual_override"
            }

    project_common_persisted = await _upsert_project_sii_common_data(
        client=client,
        organization_id=organization_id,
        project_id=project_id,
        sii_comuna=sii_comuna,
        sii_role_matrix=sii_role_matrix,
        source_legal_document_id=source_legal_document_id,
        status=None,
    )

    # 2. Upsert lot-specific fields into lot_legal_data (leaving comuna and role matrix as None)
    record: dict[str, Any] = {
        "organization_id": organization_id,
        "project_id": project_id,
        "lot_id": lot_id,
        "sii_unit_name": sii_unit_name,
        "sii_role_matrix": None if project_common_persisted else sii_role_matrix,
        "sii_pre_role": sii_pre_role,
        "sii_role_in_process_text": sii_role_in_process_text,
        "sii_definitive_role": sii_definitive_role,
        "sii_lot_number_normalized": sii_lot_number_normalized,
        "sii_comuna": None if project_common_persisted else sii_comuna,
        "sii_role_record": sii_role_record,
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
    
    # 3. Populate response dictionary with matrix/comuna fields for API contract compatibility
    row_copy = dict(row)
    if sii_comuna:
        row_copy["sii_comuna"] = sii_comuna
    if sii_role_matrix:
        row_copy["sii_role_matrix"] = sii_role_matrix

    if reviewed_by:
        await _insert_manual_override_decision(
            client=client,
            organization_id=organization_id,
            project_id=project_id,
            lot_id=lot_id,
            reason=reason.strip(),
            reviewed_by=reviewed_by,
        )
    return row_copy


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


def summarize_sii_certificate_units(
    units: list[SiiRoleUnit],
    summary: dict[str, int],
    *,
    active_certificate_count: int = 0,
    superseded_certificate_count: int = 0,
) -> dict[str, Any]:
    source_legal_document_ids = sorted(
        {
            unit.source_legal_document_id
            for unit in units
            if _has_text(unit.source_legal_document_id)
        }
    )
    comunas = sorted(
        {
            _raw_string(_unit_raw(unit), "comuna")
            for unit in units
            if _has_text(_raw_string(_unit_raw(unit), "comuna"))
        }
    )
    role_matrices = sorted(
        {
            _raw_string(_unit_raw(unit), "role_matrix") or unit.role_matrix
            for unit in units
            if _has_text(_raw_string(_unit_raw(unit), "role_matrix") or unit.role_matrix)
        }
    )

    ambiguous_matrix_role_count = 0
    for unit in units:
        raw_data = _unit_raw(unit)
        m_roles = raw_data.get("matrix_roles") or []
        if isinstance(m_roles, list) and len(m_roles) > 1:
            ambiguous_matrix_role_count += 1

    return {
        "source_legal_document_ids": source_legal_document_ids,
        "comunas": comunas,
        "role_matrices": role_matrices,
        "extracted_unit_count": len(units),
        "matched_count": int(summary.get("matched") or 0),
        "manual_review_count": int(summary.get("ambiguous") or 0),
        "missing_count": int(summary.get("missing") or 0),
        "active_certificate_count": active_certificate_count,
        "superseded_certificate_count": superseded_certificate_count,
        "ambiguous_matrix_role_count": ambiguous_matrix_role_count,
        "ocr_required": None,
        "text_source": "ocr_or_text_pages",
    }


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
    role_record = _sii_role_record(unit)
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
        sii_lot_number_normalized=role_record.get("lot_number") if role_record else None,
        sii_comuna=role_record.get("comuna") if role_record else None,
        sii_role_record=role_record,
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
        sii_lot_number_normalized=None,
        sii_comuna=None,
        sii_role_record=None,
        role_status="missing",
        matching_status="missing",
        matching_score=None,
        source_legal_document_id=None,
    )


def _unit_is_auto_matchable(unit: SiiRoleUnit) -> bool:
    return _sii_role_record(unit) is not None


def _score_extracted_lot_number_match(
    lot_number: str,
    unit: SiiRoleUnit,
) -> tuple[float, tuple[str, ...]] | None:
    role_record = _sii_role_record(unit)
    if role_record is None:
        return None

    lot_key = _normalized_lot_number_key(lot_number)
    extracted_key = _normalized_lot_number_key(str(role_record.get("lot_number") or ""))
    if not lot_key or lot_key != extracted_key:
        return None

    return 1.0, ("sii_lot_number_exact",)


def _sii_role_record(unit: SiiRoleUnit) -> dict[str, Any] | None:
    raw = _unit_raw(unit)
    if raw.get("parser") not in {
        "sii_role_certificate_tuple_v1",
        "sii_role_certificate_real_v1",
    }:
        return None
    lot_number = _raw_string(raw, "lot_number_normalized") or _raw_string(
        raw,
        "sii_lot_number_normalized",
    )
    comuna = _raw_string(raw, "comuna")
    if not lot_number or not comuna or not _has_text(unit.pre_role):
        return None
    record: dict[str, Any] = {
        "lot_number": lot_number,
        "role": unit.pre_role,
        "comuna": comuna,
    }
    role_matrix = _raw_string(raw, "role_matrix") or unit.role_matrix
    if role_matrix:
        record["role_matrix"] = role_matrix
    if raw.get("row_index") is not None:
        record["row_index"] = raw["row_index"]
    if raw.get("parser"):
        record["parser"] = raw["parser"]
    return record


def _sii_role_row_key(unit: SiiRoleUnit) -> tuple[object, ...]:
    role_record = _sii_role_record(unit) or {}
    return (
        unit.source_legal_document_id,
        role_record.get("parser"),
        role_record.get("row_index"),
        _normalized_lot_number_key(str(role_record.get("lot_number") or "")),
        role_record.get("role"),
        role_record.get("comuna"),
        unit.unit_name,
    )


def _normalized_lot_number_key(value: str | None) -> str:
    normalized = normalize_lot_name(value)
    if not normalized:
        return ""
    if re.fullmatch(r"\d+", normalized):
        return str(int(normalized))
    return normalized


def _unit_raw(unit: SiiRoleUnit) -> dict[str, Any]:
    raw = unit.raw or {}
    source_ref = raw.get("source_ref")
    if isinstance(source_ref, dict):
        return source_ref
    return raw


def _raw_string(raw: dict[str, Any], key: str) -> str | None:
    value = raw.get(key)
    return str(value) if value not in (None, "") else None


def _lot_number_from_unit_name(value: str | None) -> str | None:
    tokens = lot_identity_tokens(value)
    return tokens[0] if tokens else None


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
    matching_status = row.get("matching_status")
    doc_id = _source_legal_document_id(row) or row.get("source_legal_document_id")

    if matching_status == "manual_override":
        source_type = "manual"
        source_document_label = "Ajuste manual"
        source_status = "manual"
    elif doc_id:
        source_type = "document"
        source_document_label = "Certificado de roles SII"
        source_status = "active"
    else:
        source_type = "none"
        source_document_label = "Sin evidencia"
        source_status = "none"

    return {
        **row,
        "id": str(row.get("id") or lot_id),
        "lot_id": lot_id,
        "lot_number": lot_number_by_id.get(lot_id),
        "source_type": source_type,
        "source_document_label": source_document_label,
        "source_status": source_status,
        "source_legal_document_id": doc_id,
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
