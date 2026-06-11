"""SDD 008 case-bound matriz endpoints.

Skeleton (T008): routes registered with their contracts; behavior lands in
T020 (get/save), T025 (generate), T032 (workflow) and T016
(stage-operational). Internal-secret + tenant validation pattern inherited
from SDD 007/009.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.deps import verify_internal_secret
from core.logger import get_logger
from schemas.escritura_matrices import (
    GenerateMinutaRequest,
    MatrizCaseResponse,
    MatrizRejectRequest,
    MatrizSaveRequest,
    MinutaGeneration,
    MinutaGenerationListResponse,
    StageOperationalResult,
)
from services.matriz_token_resolution import (
    UnknownNodeError,
    resolve_matriz_clauses,
)

logger = get_logger(__name__)

router = APIRouter(
    tags=["escritura-matrices"],
    dependencies=[Depends(verify_internal_secret)],
)

_NOT_IMPLEMENTED = HTTPException(
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    detail="escritura-matrices endpoint not implemented yet (SDD 008).",
)

CASE_COLUMNS = (
    "id, organization_id, project_id, lot_id, case_status, readiness_status, "
    "readiness_gates, variable_snapshot, evidence_snapshot"
)
TEMPLATE_COLUMNS = (
    "id, organization_id, name, document_type, version, status, "
    "published_at, published_by, created_at, updated_at"
)
CLAUSE_COLUMNS = (
    "id, organization_id, template_id, clause_key, title, position, "
    "fixed_position, content_json, condition_key, condition_mode, alert_tipo"
)
MATRIX_COLUMNS = (
    "id, organization_id, project_id, escritura_case_id, template_id, "
    "snapshot_case_status, snapshot_hash, clause_order, clause_overrides, "
    "status, version, submitted_by, submitted_at, approved_by, approved_at, "
    "created_at, updated_at"
)


def _first_row(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        return data[0] if data else None
    return data if isinstance(data, dict) else None


def _rows(data: Any) -> list[dict[str, Any]]:
    return data if isinstance(data, list) else []


def _json_hash(value: Any) -> str:
    payload = json.dumps(
        value or {},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _truthy_snapshot_value(snapshot: dict[str, Any], key: str | None) -> bool | None:
    if not key:
        return None
    entry = snapshot.get(key)
    if not isinstance(entry, dict):
        return None
    if entry.get("state") == "not_applicable":
        return False
    value_json = entry.get("value_json")
    if isinstance(value_json, bool):
        return value_json
    value_text = entry.get("value_text")
    if isinstance(value_text, str) and value_text.strip():
        return value_text.strip().lower() in {"true", "si", "sí", "1", "aplica"}
    if value_json is not None:
        return bool(value_json)
    return None


async def _fetch_case(
    client: Any, escritura_case_id: str, organization_id: str
) -> dict[str, Any]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_cases")
            .select(CASE_COLUMNS)
            .eq("id", escritura_case_id)
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    row = _first_row(result.data)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Escritura case not found for this organization.",
        )
    return row


async def _fetch_project_context(client: Any, case_row: dict[str, Any]) -> dict[str, Any]:
    project_id = str(case_row["project_id"])
    organization_id = str(case_row["organization_id"])
    result = await asyncio.to_thread(
        lambda: (
            client.table("projects")
            .select("id, organization_id, name, nombre")
            .eq("id", project_id)
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    row = _first_row(result.data) or {}
    project_name = row.get("name") or row.get("nombre")
    return {"proyecto_nombre": project_name} if project_name else {}


async def _fetch_published_template(
    client: Any, organization_id: str
) -> dict[str, Any]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_templates")
            .select(TEMPLATE_COLUMNS)
            .eq("organization_id", organization_id)
            .eq("document_type", "compraventa")
            .eq("status", "published")
            .order("published_at", desc=True)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
    )
    template = _first_row(result.data)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "published_template_missing",
                "message": "No published compraventa template exists for this organization.",
            },
        )
    return template


async def _fetch_template(client: Any, template_id: str, organization_id: str) -> dict[str, Any]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_templates")
            .select(TEMPLATE_COLUMNS)
            .eq("id", template_id)
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    template = _first_row(result.data)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found for this organization.",
        )
    return template


async def _fetch_template_clauses(client: Any, template_id: str) -> list[dict[str, Any]]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_template_clauses")
            .select(CLAUSE_COLUMNS)
            .eq("template_id", template_id)
            .order("position")
            .execute()
        )
    )
    return _rows(result.data)


async def _fetch_active_matrix(
    client: Any, escritura_case_id: str, organization_id: str
) -> dict[str, Any] | None:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .select(MATRIX_COLUMNS)
            .eq("escritura_case_id", escritura_case_id)
            .eq("organization_id", organization_id)
            .neq("status", "superseded")
            .maybe_single()
            .execute()
        )
    )
    return _first_row(result.data)


async def _fetch_matrix_by_id(
    client: Any, matriz_id: str, organization_id: str
) -> dict[str, Any]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .select(MATRIX_COLUMNS)
            .eq("id", matriz_id)
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    row = _first_row(result.data)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matriz not found for this organization.",
        )
    return row


async def _lazy_create_matrix(
    client: Any, case_row: dict[str, Any], organization_id: str
) -> dict[str, Any]:
    template = await _fetch_published_template(client, organization_id)
    clauses = await _fetch_template_clauses(client, str(template["id"]))
    snapshot_hash = _json_hash(case_row.get("variable_snapshot"))
    clause_order = [str(clause["clause_key"]) for clause in clauses]
    payload = {
        "organization_id": organization_id,
        "project_id": str(case_row["project_id"]),
        "escritura_case_id": str(case_row["id"]),
        "template_id": str(template["id"]),
        "snapshot_case_status": case_row.get("case_status") or "variables_pending",
        "snapshot_hash": snapshot_hash,
        "clause_order": clause_order,
        "clause_overrides": {},
        "status": "draft",
        "version": 1,
    }
    result = await asyncio.to_thread(
        lambda: client.table("escritura_matrices").insert(payload).execute()
    )
    row = _first_row(result.data)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Matriz creation returned no row.",
        )
    logger.info(
        "escritura_matriz_lazy_created",
        organization_id=organization_id,
        escritura_case_id=str(case_row["id"]),
        matriz_id=row["id"],
        template_id=template["id"],
    )
    return row


def _effective_clauses(
    clauses: list[dict[str, Any]],
    matrix_row: dict[str, Any],
    variable_snapshot: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_key = {str(clause["clause_key"]): clause for clause in clauses}
    overrides = _as_dict(matrix_row.get("clause_overrides"))
    order = [str(key) for key in _as_list(matrix_row.get("clause_order"))]
    ordered_keys = [key for key in order if key in by_key or key in overrides]
    ordered_keys.extend(key for key in by_key if key not in ordered_keys)

    view_clauses: list[dict[str, Any]] = []
    active_clauses: list[dict[str, Any]] = []
    for index, key in enumerate(ordered_keys):
        base = by_key.get(key)
        override = _as_dict(overrides.get(key))
        if base:
            clause = {**base}
        elif override.get("content_json"):
            clause = {
                "clause_key": key,
                "title": override.get("title") or key,
                "position": index,
                "fixed_position": False,
                "content_json": override["content_json"],
                "condition_key": None,
                "condition_mode": None,
                "alert_tipo": None,
            }
        else:
            continue

        if override.get("title"):
            clause["title"] = override["title"]
        if override.get("content_json") is not None:
            clause["content_json"] = override["content_json"]

        disabled = bool(override.get("disabled"))
        condition_key = clause.get("condition_key")
        condition_mode = clause.get("condition_mode")
        condition = None
        if condition_key and condition_mode:
            active = _truthy_snapshot_value(variable_snapshot, str(condition_key))
            condition = {
                "key": str(condition_key),
                "mode": str(condition_mode),
                "active": bool(active),
            }

        view = {
            "clause_key": key,
            "title": clause["title"],
            "position": index,
            "fixed_position": bool(clause.get("fixed_position")),
            "content_json": clause.get("content_json") or {},
            "overridden": bool(override),
            "disabled": disabled,
            "condition": condition,
            "alert_tipo": clause.get("alert_tipo"),
        }
        view_clauses.append(view)
        if not disabled:
            active_clauses.append({**clause, "position": index})
    return view_clauses, active_clauses


def _approval_blockers(
    *,
    manifest: dict[str, Any],
    case_row: dict[str, Any],
    snapshot_stale: bool,
) -> list[dict[str, Any]]:
    project_id = str(case_row["project_id"])
    fix_url = f"/projects/{project_id}?tab=legal"
    blockers: list[dict[str, Any]] = []
    if snapshot_stale:
        blockers.append(
            {
                "kind": "snapshot_stale",
                "message": "El snapshot del caso cambió; recarga la matriz antes de guardar o aprobar.",
                "fix_url": fix_url,
            }
        )

    for token in manifest.get("tokens") or []:
        if not isinstance(token, dict) or token.get("status") == "resolved":
            continue
        key = str(token.get("variableKey") or "")
        blockers.append(
            {
                "kind": "token_missing",
                "key": key,
                "message": (
                    "Token pendiente de revisión."
                    if token.get("status") == "blocked"
                    else "Token sin valor en el snapshot."
                ),
                "fix_url": fix_url,
            }
        )
    for block in manifest.get("blocks") or []:
        if not isinstance(block, dict) or block.get("status") == "resolved":
            continue
        key = str(block.get("blockKey") or "")
        blockers.append(
            {
                "kind": "token_missing",
                "key": key,
                "message": "Bloque narrativo sin texto aprobado en el snapshot.",
                "fix_url": fix_url,
            }
        )

    readiness_gates = _as_dict(case_row.get("readiness_gates"))
    for gate, payload in readiness_gates.items():
        if not isinstance(payload, dict) or payload.get("status") != "blocked":
            continue
        causes = payload.get("blocking_variables") or []
        if not causes:
            causes = [None]
        for cause in causes:
            blockers.append(
                {
                    "kind": "readiness_gate",
                    "gate": str(gate),
                    "cause": str(cause) if cause is not None else None,
                    "fix_url": fix_url,
                }
            )
    return blockers


def _dismissed_alerts(variable_snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    titulo = variable_snapshot.get("titulo")
    alerts = titulo.get("alertas_resueltas") if isinstance(titulo, dict) else None
    dismissed: list[dict[str, Any]] = []
    if not isinstance(alerts, list):
        return dismissed
    for alert in alerts:
        if not isinstance(alert, dict):
            continue
        resolution = alert.get("resolution") or alert.get("decision")
        if resolution != "dismissed_with_reason":
            continue
        dismissed.append(
            {
                "tipo": str(alert.get("tipo") or alert.get("alert_tipo") or "otro"),
                "reason": alert.get("reason") or alert.get("resolution_reason"),
            }
        )
    return dismissed


async def _case_response(
    client: Any, matrix_row: dict[str, Any], case_row: dict[str, Any]
) -> MatrizCaseResponse:
    organization_id = str(case_row["organization_id"])
    template = await _fetch_template(client, str(matrix_row["template_id"]), organization_id)
    template_clauses = await _fetch_template_clauses(client, str(template["id"]))
    variable_snapshot = _as_dict(case_row.get("variable_snapshot"))
    evidence_snapshot = _as_dict(case_row.get("evidence_snapshot"))
    snapshot_hash = _json_hash(variable_snapshot)
    snapshot_stale = str(matrix_row.get("snapshot_hash")) != snapshot_hash
    view_clauses, active_clauses = _effective_clauses(
        template_clauses, matrix_row, variable_snapshot
    )
    context = await _fetch_project_context(client, case_row)
    try:
        resolution = resolve_matriz_clauses(
            clauses=active_clauses,
            variable_snapshot=variable_snapshot,
            evidence_snapshot=evidence_snapshot,
            context=context,
        )
    except UnknownNodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "unknown_matriz_node",
                "message": "Matriz content contains unknown ProseMirror node types.",
                "node_types": exc.node_types,
            },
        ) from exc
    manifest = resolution.manifest_dict()
    return MatrizCaseResponse.model_validate(
        {
            "matriz": {
                "id": matrix_row["id"],
                "escritura_case_id": matrix_row["escritura_case_id"],
                "status": matrix_row["status"],
                "version": matrix_row["version"],
                "template": {
                    "id": template["id"],
                    "name": template["name"],
                    "version": template["version"],
                },
                "snapshot_stale": snapshot_stale,
                "clause_order": [
                    str(key) for key in _as_list(matrix_row.get("clause_order"))
                ],
                "clauses": view_clauses,
                "resolution": manifest,
                "approval_blockers": _approval_blockers(
                    manifest=manifest,
                    case_row=case_row,
                    snapshot_stale=snapshot_stale,
                ),
                "dismissed_alerts": _dismissed_alerts(variable_snapshot),
            }
        }
    )


@router.get(
    "/escritura-matrices/case/{escritura_case_id}",
    response_model=MatrizCaseResponse,
)
async def get_case_matriz(
    escritura_case_id: UUID,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client

    client = get_supabase_client()
    org_id = str(organization_id)
    case_row = await _fetch_case(client, str(escritura_case_id), org_id)
    ensure_legal_documents_feature_enabled(
        organization_id=org_id,
        project_id=str(case_row["project_id"]),
    )
    matrix_row = await _fetch_active_matrix(client, str(escritura_case_id), org_id)
    if matrix_row is None:
        matrix_row = await _lazy_create_matrix(client, case_row, org_id)
    return await _case_response(client, matrix_row, case_row)


@router.put(
    "/escritura-matrices/{matriz_id}",
    response_model=MatrizCaseResponse,
)
async def save_matriz(
    matriz_id: UUID,
    request: MatrizSaveRequest,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client

    client = get_supabase_client()
    org_id = str(organization_id)
    matrix_row = await _fetch_matrix_by_id(client, str(matriz_id), org_id)
    case_row = await _fetch_case(client, str(matrix_row["escritura_case_id"]), org_id)
    ensure_legal_documents_feature_enabled(
        organization_id=org_id,
        project_id=str(case_row["project_id"]),
    )

    current_hash = _json_hash(case_row.get("variable_snapshot"))
    if str(matrix_row.get("snapshot_hash")) != current_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "snapshot_stale",
                "message": "The escritura case snapshot changed; reload the matriz before saving.",
            },
        )
    if int(matrix_row["version"]) != request.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "version_conflict",
                "message": "The matriz was updated by another writer.",
                "current_version": matrix_row["version"],
            },
        )

    payload = {
        "clause_order": request.clause_order,
        "clause_overrides": {
            key: override.model_dump(exclude_none=True)
            for key, override in request.clause_overrides.items()
        },
        "version": request.version + 1,
    }
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .update(payload)
            .eq("id", str(matriz_id))
            .eq("organization_id", org_id)
            .eq("version", request.version)
            .execute()
        )
    )
    updated = _first_row(result.data)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "version_conflict",
                "message": "The matriz was updated by another writer.",
            },
        )
    return await _case_response(client, updated, case_row)


@router.post(
    "/escritura-matrices/{matriz_id}/submit",
    response_model=MatrizCaseResponse,
)
async def submit_matriz(
    matriz_id: UUID,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    raise _NOT_IMPLEMENTED


@router.post(
    "/escritura-matrices/{matriz_id}/approve",
    response_model=MatrizCaseResponse,
)
async def approve_matriz(
    matriz_id: UUID,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    raise _NOT_IMPLEMENTED


@router.post(
    "/escritura-matrices/{matriz_id}/reject",
    response_model=MatrizCaseResponse,
)
async def reject_matriz(
    matriz_id: UUID,
    request: MatrizRejectRequest,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    raise _NOT_IMPLEMENTED


@router.post(
    "/escritura-matrices/{matriz_id}/generate",
    response_model=MinutaGeneration,
    status_code=status.HTTP_201_CREATED,
)
async def generate_minuta(
    matriz_id: UUID,
    request: GenerateMinutaRequest,
    organization_id: UUID = Query(...),
) -> MinutaGeneration:
    raise _NOT_IMPLEMENTED


@router.get(
    "/escritura-matrices/case/{escritura_case_id}/generations",
    response_model=MinutaGenerationListResponse,
)
async def list_case_generations(
    escritura_case_id: UUID,
    organization_id: UUID = Query(...),
) -> MinutaGenerationListResponse:
    raise _NOT_IMPLEMENTED


@router.post(
    "/escritura-cases/{escritura_case_id}/stage-operational",
    response_model=StageOperationalResult,
)
async def stage_operational_variables(
    escritura_case_id: UUID,
    organization_id: UUID = Query(...),
) -> StageOperationalResult:
    """Re-run the operational bridge for a case and refresh its snapshot.

    US6/FR-021: changed sale or geometry rows supersede + re-propose; the
    refreshed snapshot makes the matriz detect supersession (FR-014).
    """
    import asyncio

    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client
    from services.escritura_operational_bridge import (
        OperationalBridgeScopeError,
        stage_operational_variables as stage_operational_variables_service,
    )
    from services.escritura_readiness import create_escritura_case_snapshot

    supabase = get_supabase_client()
    case_result = await asyncio.to_thread(
        lambda: (
            supabase.table("escritura_cases")
            .select("id, organization_id, project_id, lot_id")
            .eq("id", str(escritura_case_id))
            .eq("organization_id", str(organization_id))
            .maybe_single()
            .execute()
        )
    )
    case_row = case_result.data if isinstance(case_result.data, dict) else None
    if not case_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Escritura case not found for this organization.",
        )
    ensure_legal_documents_feature_enabled(
        organization_id=str(organization_id),
        project_id=str(case_row["project_id"]),
    )
    try:
        outcome = await stage_operational_variables_service(
            organization_id=str(organization_id),
            project_id=str(case_row["project_id"]),
            lot_id=str(case_row["lot_id"]),
            supabase=supabase,
        )
        # Refresh the case snapshot so gates and the matriz see the staging.
        await create_escritura_case_snapshot(
            organization_id=str(organization_id),
            project_id=str(case_row["project_id"]),
            lot_id=str(case_row["lot_id"]),
            stage_operational=False,
            supabase=supabase,
        )
    except OperationalBridgeScopeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    return StageOperationalResult.model_validate(outcome.to_dict())
