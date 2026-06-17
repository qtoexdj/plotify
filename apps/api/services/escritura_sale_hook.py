"""Hook SDD 011: sale approval creates the escritura draft.

The commercial approval remains owned by the database RPC. This service runs
after that transition and builds the legal side idempotently: active case,
operational staging through the case snapshot, and a lot draft copied from the
approved project matrix.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from dataclasses import asdict, dataclass
from typing import Any

from core.logger import get_logger
from services.escritura_readiness import create_escritura_case_snapshot

logger = get_logger(__name__)

MATRIX_COLUMNS = (
    "id, organization_id, project_id, escritura_case_id, template_id, "
    "snapshot_case_status, snapshot_hash, clause_order, clause_overrides, "
    "source_project_matriz_id, status, version, submitted_by, submitted_at, "
    "approved_by, approved_at, created_at, updated_at"
)
PROJECT_MATRIZ_GATE = "project_matriz_approved"


@dataclass(frozen=True)
class SaleEscrituraHookResult:
    organization_id: str
    project_id: str | None
    lot_id: str
    escritura_case_id: str | None
    project_matriz_id: str | None
    borrador_matriz_id: str | None
    created_borrador: bool
    ready_for_borrador: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _first_row(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        return data[0] if data else None
    return data if isinstance(data, dict) else None


def _json_hash(value: Any) -> str:
    payload = json.dumps(
        value or {},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _json_copy(value: Any, fallback: Any) -> Any:
    source = fallback if value is None else value
    return json.loads(json.dumps(source, ensure_ascii=False))


def _uuid_or_none(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError):
        return None


async def _fetch_lot_project(
    *, client: Any, organization_id: str, lot_id: str
) -> str | None:
    lot_result = await asyncio.to_thread(
        lambda: (
            client.table("lots")
            .select("id, project_id")
            .eq("id", lot_id)
            .maybe_single()
            .execute()
        )
    )
    lot_row = _first_row(lot_result.data) if lot_result is not None else None
    if not lot_row or not lot_row.get("project_id"):
        return None

    project_id = str(lot_row["project_id"])
    project_result = await asyncio.to_thread(
        lambda: (
            client.table("projects")
            .select("id, organization_id")
            .eq("id", project_id)
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    project_row = (
        _first_row(project_result.data) if project_result is not None else None
    )
    if not project_row:
        return None
    return project_id


async def _fetch_active_lot_matrix(
    *,
    client: Any,
    organization_id: str,
    project_id: str,
    escritura_case_id: str,
) -> dict[str, Any] | None:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .select(MATRIX_COLUMNS)
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .eq("escritura_case_id", escritura_case_id)
            .neq("status", "superseded")
            .maybe_single()
            .execute()
        )
    )
    return _first_row(result.data) if result is not None else None


async def _fetch_approved_project_matrix(
    *, client: Any, organization_id: str, project_id: str
) -> dict[str, Any] | None:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .select(MATRIX_COLUMNS)
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .is_("escritura_case_id", "null")
            .eq("status", "approved")
            .maybe_single()
            .execute()
        )
    )
    return _first_row(result.data) if result is not None else None


async def _insert_lot_matrix_from_project(
    *,
    client: Any,
    case_row: dict[str, Any],
    project_matrix: dict[str, Any],
) -> dict[str, Any]:
    payload = {
        "organization_id": str(case_row["organization_id"]),
        "project_id": str(case_row["project_id"]),
        "escritura_case_id": str(case_row["id"]),
        "template_id": str(project_matrix["template_id"]),
        "snapshot_case_status": case_row.get("case_status") or "variables_pending",
        "snapshot_hash": _json_hash(case_row.get("variable_snapshot")),
        "clause_order": _json_copy(project_matrix.get("clause_order"), []),
        "clause_overrides": _json_copy(project_matrix.get("clause_overrides"), {}),
        "source_project_matriz_id": str(project_matrix["id"]),
        "status": "draft",
        "version": 1,
    }
    result = await asyncio.to_thread(
        lambda: client.table("escritura_matrices").insert(payload).execute()
    )
    row = _first_row(result.data)
    return row or payload


async def _mark_case_waiting_project_matrix(
    *, client: Any, case_row: dict[str, Any]
) -> dict[str, Any]:
    gates = dict(case_row.get("readiness_gates") or {})
    gates[PROJECT_MATRIZ_GATE] = {
        "gate": PROJECT_MATRIZ_GATE,
        "status": "blocked",
        "blocking_variables": [],
        "warnings": [],
    }
    payload = {
        "case_status": "variables_pending",
        "readiness_status": "blocked",
        "readiness_gates": gates,
    }
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_cases")
            .update(payload)
            .eq("id", str(case_row["id"]))
            .eq("organization_id", str(case_row["organization_id"]))
            .execute()
        )
    )
    return _first_row(result.data) or {**case_row, **payload}


async def handle_sale_validated_for_escritura(
    *,
    organization_id: str,
    lot_id: str,
    validated_by: str | None = None,
    supabase: Any | None = None,
) -> SaleEscrituraHookResult:
    """Create the legal draft after a sale is validated.

    Idempotence is by active `escritura_cases` and active
    `escritura_matrices`: rerunning the hook refreshes the case snapshot but
    reuses the existing lot matrix when one already exists.
    """

    if supabase is None:
        from core.database import get_supabase_client

        supabase = get_supabase_client()

    project_id = await _fetch_lot_project(
        client=supabase, organization_id=organization_id, lot_id=lot_id
    )
    if not project_id:
        logger.warning(
            "sale_escritura_hook_lot_scope_missing",
            organization_id=organization_id,
            lot_id=lot_id,
        )
        return SaleEscrituraHookResult(
            organization_id=organization_id,
            project_id=None,
            lot_id=lot_id,
            escritura_case_id=None,
            project_matriz_id=None,
            borrador_matriz_id=None,
            created_borrador=False,
            ready_for_borrador=False,
        )

    case_row = await create_escritura_case_snapshot(
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        created_by=_uuid_or_none(validated_by),
        stage_operational=True,
        supabase=supabase,
    )
    escritura_case_id = str(case_row.get("id") or case_row.get("escritura_case_id"))

    existing_matrix = await _fetch_active_lot_matrix(
        client=supabase,
        organization_id=organization_id,
        project_id=project_id,
        escritura_case_id=escritura_case_id,
    )
    if existing_matrix:
        return SaleEscrituraHookResult(
            organization_id=organization_id,
            project_id=project_id,
            lot_id=lot_id,
            escritura_case_id=escritura_case_id,
            project_matriz_id=existing_matrix.get("source_project_matriz_id"),
            borrador_matriz_id=str(existing_matrix["id"]),
            created_borrador=False,
            ready_for_borrador=bool(existing_matrix.get("source_project_matriz_id")),
        )

    project_matrix = await _fetch_approved_project_matrix(
        client=supabase,
        organization_id=organization_id,
        project_id=project_id,
    )
    if not project_matrix:
        case_row = await _mark_case_waiting_project_matrix(
            client=supabase, case_row=case_row
        )
        logger.info(
            "sale_escritura_hook_project_matriz_missing",
            organization_id=organization_id,
            project_id=project_id,
            lot_id=lot_id,
            escritura_case_id=escritura_case_id,
        )
        return SaleEscrituraHookResult(
            organization_id=organization_id,
            project_id=project_id,
            lot_id=lot_id,
            escritura_case_id=escritura_case_id,
            project_matriz_id=None,
            borrador_matriz_id=None,
            created_borrador=False,
            ready_for_borrador=False,
        )

    lot_matrix = await _insert_lot_matrix_from_project(
        client=supabase, case_row=case_row, project_matrix=project_matrix
    )
    logger.info(
        "sale_escritura_hook_borrador_created",
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        escritura_case_id=escritura_case_id,
        project_matriz_id=str(project_matrix["id"]),
        borrador_matriz_id=str(lot_matrix.get("id")),
    )
    return SaleEscrituraHookResult(
        organization_id=organization_id,
        project_id=project_id,
        lot_id=lot_id,
        escritura_case_id=escritura_case_id,
        project_matriz_id=str(project_matrix["id"]),
        borrador_matriz_id=str(lot_matrix["id"]),
        created_borrador=True,
        ready_for_borrador=True,
    )
