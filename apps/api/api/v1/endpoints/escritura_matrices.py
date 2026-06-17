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
import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from urllib.parse import quote

from api.deps import verify_internal_secret
from core.logger import get_logger
from schemas.escritura_matrices import (
    EscrituraTraceResponse,
    GenerateMinutaRequest,
    MatrizApproveRequest,
    MatrizCaseResponse,
    MatrizRejectRequest,
    MatrizSaveRequest,
    MatrizSubmitRequest,
    MinutaGeneration,
    MinutaGenerationListResponse,
    StageOperationalResult,
)
from services.legal_microcopy import (
    ALERT_REQUIRED_CLAUSE_TEXTS,
    ESCRITURA_BORRADOR_NOTICE,
    BlockerMicrocopy,
    alert_clause_missing_microcopy,
    clause_omitted_reason,
    readiness_gate_microcopy,
    snapshot_stale_microcopy,
    token_blocked_microcopy,
    token_missing_microcopy,
    flow_state_description,
    flow_state_label,
)
from services.matriz_token_resolution import (
    UnknownNodeError,
    insertable_variables_catalog,
    resolve_matriz_clauses,
    token_category,
    token_label,
)
from services.matriz_docx_renderer import (
    MatrizDocxError,
    render_minuta_docx,
)
from services.legal_variable_catalog import (
    NON_BLOCKING_PROJECT_MATRIZ_KEYS,
    SALE_SCOPED_VARIABLE_KEYS,
    variable_producer,
)
from services.escritura_readiness import fetch_project_matriz_snapshot
from services.escritura_delivery import deliver_draft, delivery_status_label

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
    "source_project_matriz_id, status, version, submitted_by, submitted_at, "
    "approved_by, approved_at, created_at, updated_at"
)
GENERATION_COLUMNS = (
    "id, organization_id, project_id, escritura_case_id, matriz_id, "
    "matriz_version, template_id, snapshot_hash, resolution_manifest, "
    "content_hash, storage_path, warning_acknowledged_by, "
    "warning_acknowledged_at, generated_by, generated_at"
)
MINUTA_STORAGE_BUCKET = "documents"
PROJECT_MATRIZ_GATE = "project_matriz_approved"
PROJECT_MATRIZ_MISSING_CODE = "project_matriz_approval_missing"

# SDD 010 (research D6): catalogo humanizado para el picker "Insertar dato",
# construido una vez desde la fuente unica (matriz_token_resolution).
INSERTABLE_VARIABLES: list[dict[str, str]] = insertable_variables_catalog()

# SDD 011 (FR-002/FR-003): claves que solo se llenan al vender el lote (datos
# de la venta + geometria del lote + servidumbre). En la matriz del PROYECTO son
# huecos por diseño ("esperando ventas"): se renderizan como huecos pero NO
# bloquean la aprobacion. Fuente unica: la clasificacion de productor del
# catalogo (`SALE_SCOPED_VARIABLE_KEYS`), ya normalizada sin el sufijo `[]`.
PROJECT_MATRIZ_GAP_KEYS: frozenset[str] = SALE_SCOPED_VARIABLE_KEYS


def _first_row(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        return data[0] if data else None
    return data if isinstance(data, dict) else None


def _single_row(result: Any) -> dict[str, Any] | None:
    """Fila de un `.maybe_single()` tolerando el None que PostgREST devuelve
    para 0 filas. Sin esto, `result.data` revienta en el primer open de la mesa
    (caso sin matriz aún) — comportamiento real que los fakes de test no
    reproducen, así que la suite lo dejaba pasar."""
    if result is None:
        return None
    return _first_row(result.data)


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


def _uuid_text_or_none(value: Any) -> str | None:
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (TypeError, ValueError):
        return None


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


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
    row = _single_row(result)
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
            # `projects` solo tiene `name` (no `nombre`): seleccionar una
            # columna inexistente hace que PostgREST devuelva 204 y reviente
            # la mesa. El fallback a `nombre` se conserva por si otro entorno
            # la tuviera, pero no se pide en el select.
            .select("id, organization_id, name")
            .eq("id", project_id)
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    row = _single_row(result) or {}
    project_name = row.get("name") or row.get("nombre")
    return {"proyecto_nombre": project_name} if project_name else {}


async def _fetch_project(
    client: Any, project_id: str, organization_id: str
) -> dict[str, Any]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("projects")
            .select("id, organization_id, name")
            .eq("id", project_id)
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    row = _single_row(result)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found for this organization.",
        )
    return row


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
    template = _single_row(result)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found for this organization.",
        )
    return template


async def _fetch_template_clauses(
    client: Any, template_id: str, organization_id: str
) -> list[dict[str, Any]]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_template_clauses")
            .select(CLAUSE_COLUMNS)
            .eq("template_id", template_id)
            .eq("organization_id", organization_id)
            .order("position")
            .execute()
        )
    )
    return _rows(result.data)


async def _fetch_active_matrix(
    client: Any, escritura_case_id: str, organization_id: str, project_id: str
) -> dict[str, Any] | None:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .select(MATRIX_COLUMNS)
            .eq("escritura_case_id", escritura_case_id)
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .neq("status", "superseded")
            .maybe_single()
            .execute()
        )
    )
    return _single_row(result)


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
    row = _single_row(result)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matriz not found for this organization.",
        )
    return row


async def _lazy_create_matrix(
    client: Any, case_row: dict[str, Any], organization_id: str
) -> dict[str, Any]:
    project_matrix = await _fetch_approved_project_matrix(
        client=client,
        project_id=str(case_row["project_id"]),
        organization_id=organization_id,
    )
    if project_matrix is None:
        _raise_project_matriz_missing(str(case_row["project_id"]))
    return await _create_matrix_from_project_matrix(
        client=client,
        case_row=case_row,
        project_matrix=project_matrix,
    )


async def _create_matrix_from_project_matrix(
    *,
    client: Any,
    case_row: dict[str, Any],
    project_matrix: dict[str, Any],
) -> dict[str, Any]:
    snapshot_hash = _json_hash(case_row.get("variable_snapshot"))
    payload = {
        "organization_id": str(case_row["organization_id"]),
        "project_id": str(case_row["project_id"]),
        "escritura_case_id": str(case_row["id"]),
        "template_id": str(project_matrix["template_id"]),
        "snapshot_case_status": case_row.get("case_status") or "variables_pending",
        "snapshot_hash": snapshot_hash,
        "clause_order": _as_list(project_matrix.get("clause_order")),
        "clause_overrides": _as_dict(project_matrix.get("clause_overrides")),
        "source_project_matriz_id": str(project_matrix["id"]),
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
        organization_id=str(case_row["organization_id"]),
        escritura_case_id=str(case_row["id"]),
        matriz_id=row["id"],
        source_project_matriz_id=str(project_matrix["id"]),
        template_id=project_matrix["template_id"],
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
            # SDD 010 (FR-010): la clausula condicional que no aplica explica
            # su regla en lenguaje humano.
            "omitted_reason": (
                clause_omitted_reason(str(condition_key))
                if condition is not None and not condition["active"]
                else None
            ),
        }
        view_clauses.append(view)
        if not disabled:
            active_clauses.append({**clause, "position": index})
    return view_clauses, active_clauses


def _humanized(blocker: dict[str, Any], copy: BlockerMicrocopy, action_href: str | None) -> dict[str, Any]:
    """Adjunta los campos humanos SDD 010 (FR-005) a un blocker."""
    return {
        **blocker,
        "title": copy.title,
        "description": copy.description,
        "action_label": copy.action_label,
        "action_href": action_href,
    }


def _variable_fix_url(project_id: str, key: str) -> str:
    return f"/projects/{project_id}?tab=legal&variable={quote(key, safe='')}"


def _approval_blockers(
    *,
    manifest: dict[str, Any],
    case_row: dict[str, Any],
    active_clauses: list[dict[str, Any]],
    snapshot_stale: bool,
) -> list[dict[str, Any]]:
    project_id = str(case_row["project_id"])
    fix_url = f"/projects/{project_id}?tab=legal"
    blockers: list[dict[str, Any]] = []
    if snapshot_stale:
        blockers.append(
            _humanized(
                {
                    "kind": "snapshot_stale",
                    "message": "El expediente del caso cambió; recarga la matriz antes de guardar o aprobar.",
                    "fix_url": fix_url,
                },
                snapshot_stale_microcopy(),
                None,
            )
        )

    for token in manifest.get("tokens") or []:
        if not isinstance(token, dict) or token.get("status") == "resolved":
            continue
        key = str(token.get("variableKey") or "")
        label = token.get("label") or token_label(key)
        blocked = token.get("status") == "blocked"
        copy = (
            token_blocked_microcopy(key, label)
            if blocked
            else token_missing_microcopy(key, label)
        )
        blockers.append(
            _humanized(
                {
                    "kind": "token_missing",
                    "key": key,
                    "message": (
                        "Dato pendiente de revisión."
                        if blocked
                        else "Dato sin valor en el expediente."
                    ),
                    "fix_url": fix_url,
                },
                copy,
                _variable_fix_url(project_id, key),
            )
        )
    for block in manifest.get("blocks") or []:
        if not isinstance(block, dict) or block.get("status") == "resolved":
            continue
        key = str(block.get("blockKey") or "")
        blockers.append(
            _humanized(
                {
                    "kind": "token_missing",
                    "key": key,
                    "message": "Bloque narrativo sin texto aprobado en el expediente.",
                    "fix_url": fix_url,
                },
                BlockerMicrocopy(
                    title=f"Falta el texto aprobado: {token_label(key)}",
                    description=(
                        "El texto se redacta y aprueba en el estudio de "
                        "título del proyecto."
                    ),
                    action_label="Revisar estudio de título",
                ),
                fix_url,
            )
        )

    blockers.extend(_readiness_gate_blockers(case_row=case_row, fix_url=fix_url))
    blockers.extend(
        _alert_clause_blockers(
            variable_snapshot=_as_dict(case_row.get("variable_snapshot")),
            active_clauses=active_clauses,
            fix_url="/documentos/plantillas",
        )
    )
    return blockers


def _alert_clause_blockers(
    *,
    variable_snapshot: dict[str, Any],
    active_clauses: list[dict[str, Any]],
    fix_url: str,
) -> list[dict[str, Any]]:
    titulo = variable_snapshot.get("titulo")
    alerts = titulo.get("alertas_resueltas") if isinstance(titulo, dict) else None
    if not isinstance(alerts, list):
        return []

    active_alert_tipos = {
        str(clause.get("alert_tipo"))
        for clause in active_clauses
        if clause.get("alert_tipo")
    }
    blockers: list[dict[str, Any]] = []
    seen: set[str] = set()
    for alert in alerts:
        if not isinstance(alert, dict):
            continue
        resolution = alert.get("resolution") or alert.get("decision")
        if resolution != "clause_added":
            continue
        tipo = str(alert.get("tipo") or alert.get("alert_tipo") or "otro")
        if tipo in active_alert_tipos or tipo in seen:
            continue
        seen.add(tipo)
        blockers.append(
            _humanized(
                {
                    "kind": "alert_clause_missing",
                    "alert_tipo": tipo,
                    "required_clause": ALERT_REQUIRED_CLAUSE_TEXTS.get(
                        tipo, ALERT_REQUIRED_CLAUSE_TEXTS["otro"]
                    ),
                    "message": alert.get("reason") or alert.get("resolution_reason"),
                    "fix_url": fix_url,
                },
                alert_clause_missing_microcopy(tipo),
                fix_url,
            )
        )
    return blockers


def _readiness_gate_blockers(
    *, case_row: dict[str, Any], fix_url: str
) -> list[dict[str, Any]]:
    blockers: list[dict[str, Any]] = []
    readiness_gates = _as_dict(case_row.get("readiness_gates"))
    for gate, payload in readiness_gates.items():
        if not isinstance(payload, dict) or payload.get("status") != "blocked":
            continue
        causes = payload.get("blocking_variables") or []
        if not causes:
            causes = [None]
        for cause in causes:
            cause_text = str(cause) if cause is not None else None
            try:
                copy = readiness_gate_microcopy(str(gate), cause_text)
            except KeyError:
                # Gate fuera del catalogo (futuro): texto generico, nunca 500
                # ni codigo crudo en pantalla.
                copy = BlockerMicrocopy(
                    title="Verificación pendiente del caso",
                    description=(
                        "Una verificación del caso sigue bloqueada. "
                        "Se revisa en el Centro de Control Legal."
                    ),
                    action_label="Completar dato",
                )
            blockers.append(
                _humanized(
                    {
                        "kind": "readiness_gate",
                        "gate": str(gate),
                        "cause": cause_text,
                        "fix_url": fix_url,
                    },
                    copy,
                    fix_url,
                )
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
    template_clauses = await _fetch_template_clauses(
        client, str(template["id"]), str(case_row["organization_id"])
    )
    variable_snapshot = _as_dict(case_row.get("variable_snapshot"))
    evidence_snapshot = _as_dict(case_row.get("evidence_snapshot"))
    snapshot_hash = _json_hash(variable_snapshot)
    snapshot_stale = str(matrix_row.get("snapshot_hash")) != snapshot_hash
    if snapshot_stale and matrix_row.get("status") == "approved":
        matrix_row = await _supersede_approved_matriz(
            client=client,
            matrix_row=matrix_row,
            case_row=case_row,
            current_snapshot_hash=snapshot_hash,
        )
        snapshot_stale = False
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
    resolved_content_by_clause = {
        item.clause_key: item.resolved_content
        for item in resolution.clauses
        if item.resolved_content is not None
    }
    for clause in view_clauses:
        clause["resolved_content"] = resolved_content_by_clause.get(
            str(clause.get("clause_key"))
        )
    return MatrizCaseResponse.model_validate(
        {
            "matriz": {
                "id": matrix_row["id"],
                "escritura_case_id": matrix_row["escritura_case_id"],
                "project_id": matrix_row["project_id"],
                "status": matrix_row["status"],
                "version": matrix_row["version"],
                "scope": "lot",
                "source_project_matriz_id": matrix_row.get(
                    "source_project_matriz_id"
                ),
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
                    active_clauses=active_clauses,
                    snapshot_stale=snapshot_stale,
                ),
                "dismissed_alerts": _dismissed_alerts(variable_snapshot),
            },
            "insertable_variables": INSERTABLE_VARIABLES,
        }
    )


# ─── Matriz del PROYECTO (SDD 011, scope escritura_case_id NULL) ──────────────


async def _fetch_project_context_by_id(
    client: Any, project_id: str, organization_id: str
) -> dict[str, Any]:
    row = await _fetch_project(client, project_id, organization_id)
    project_name = row.get("name") or row.get("nombre")
    return {"proyecto_nombre": project_name} if project_name else {}


async def _fetch_active_project_matrix(
    client: Any, project_id: str, organization_id: str
) -> dict[str, Any] | None:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .select(MATRIX_COLUMNS)
            .eq("project_id", project_id)
            .eq("organization_id", organization_id)
            .is_("escritura_case_id", "null")
            .neq("status", "superseded")
            .maybe_single()
            .execute()
        )
    )
    return _single_row(result)


async def _fetch_approved_project_matrix(
    *, client: Any, project_id: str, organization_id: str
) -> dict[str, Any] | None:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .select(MATRIX_COLUMNS)
            .eq("project_id", project_id)
            .eq("organization_id", organization_id)
            .is_("escritura_case_id", "null")
            .eq("status", "approved")
            .maybe_single()
            .execute()
        )
    )
    return _single_row(result)


def _project_matriz_action_url(project_id: str) -> str:
    return f"/documentos/matriz/proyecto/{project_id}"


def _project_matriz_missing_detail(project_id: str) -> dict[str, Any]:
    action_url = _project_matriz_action_url(project_id)
    copy = readiness_gate_microcopy(PROJECT_MATRIZ_GATE)
    blocker = _humanized(
        {
            "kind": "readiness_gate",
            "gate": PROJECT_MATRIZ_GATE,
            "message": "Falta aprobar la matriz del proyecto.",
            "fix_url": action_url,
        },
        copy,
        action_url,
    )
    return {
        "code": PROJECT_MATRIZ_MISSING_CODE,
        "message": "Falta aprobar la matriz del proyecto.",
        "flow_state": "waiting_project_matriz",
        "flow_state_label": flow_state_label("waiting_project_matriz"),
        "flow_state_description": flow_state_description("waiting_project_matriz"),
        "blocking": [blocker],
    }


def _raise_project_matriz_missing(project_id: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=_project_matriz_missing_detail(project_id),
    )


async def _lazy_create_project_matrix(
    client: Any,
    project_id: str,
    organization_id: str,
    variable_snapshot: dict[str, Any],
) -> dict[str, Any]:
    """Crea la matriz del proyecto (case_id NULL) desde la plantilla general."""
    template = await _fetch_published_template(client, organization_id)
    clauses = await _fetch_template_clauses(client, str(template["id"]), organization_id)
    clause_order = [str(clause["clause_key"]) for clause in clauses]
    payload = {
        "organization_id": organization_id,
        "project_id": project_id,
        "escritura_case_id": None,
        "template_id": str(template["id"]),
        "snapshot_case_status": "project",
        "snapshot_hash": _json_hash(variable_snapshot),
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
            detail="Project matriz creation returned no row.",
        )
    logger.info(
        "escritura_project_matriz_created",
        organization_id=organization_id,
        project_id=project_id,
        matriz_id=row["id"],
        template_id=template["id"],
    )
    return row


def _is_project_gap_key(key: str) -> bool:
    """True si la clave es un hueco por diseño en la matriz del proyecto: dato
    de venta (comprador/precio/lote/servidumbre) o dato de firma
    (notaria/otorgamiento). Ninguno bloquea la aprobación."""
    return key.removesuffix("[]") in NON_BLOCKING_PROJECT_MATRIZ_KEYS


def _project_approval_blockers(
    *, manifest: dict[str, Any], project_id: str, snapshot_stale: bool
) -> list[dict[str, Any]]:
    """Pendientes de la matriz del PROYECTO (FR-003).

    Los datos de la venta (claves de venta/lote/derivadas) son huecos por
    diseño y NUNCA bloquean: se excluyen. Bloquean los pendientes del proyecto
    (titulo, variables legales) que el manifiesto marca sin resolver.
    """
    fix_url = f"/projects/{project_id}?tab=legal"
    blockers: list[dict[str, Any]] = []
    if snapshot_stale:
        blockers.append(
            _humanized(
                {
                    "kind": "snapshot_stale",
                    "message": "La revisión del proyecto cambió; recarga la matriz antes de aprobar.",
                    "fix_url": fix_url,
                },
                snapshot_stale_microcopy(),
                None,
            )
        )
    for token in manifest.get("tokens") or []:
        if not isinstance(token, dict) or token.get("status") == "resolved":
            continue
        key = str(token.get("variableKey") or "")
        if _is_project_gap_key(key):
            continue  # hueco de venta: se muestra como hueco, no bloquea
        label = token.get("label") or token_label(key)
        blocked = token.get("status") == "blocked"
        copy = (
            token_blocked_microcopy(key, label)
            if blocked
            else token_missing_microcopy(key, label)
        )
        blockers.append(
            _humanized(
                {
                    "kind": "token_missing",
                    "key": key,
                    "producer": variable_producer(key),
                    "message": (
                        "Dato del proyecto pendiente de revisión."
                        if blocked
                        else "Dato del proyecto sin valor aprobado."
                    ),
                    "fix_url": fix_url,
                },
                copy,
                _variable_fix_url(project_id, key),
            )
        )
    for block in manifest.get("blocks") or []:
        if not isinstance(block, dict) or block.get("status") == "resolved":
            continue
        key = str(block.get("blockKey") or "")
        blockers.append(
            _humanized(
                {
                    "kind": "token_missing",
                    "key": key,
                    "message": "Texto del estudio de título sin aprobar.",
                    "fix_url": fix_url,
                },
                BlockerMicrocopy(
                    title=f"Falta el texto aprobado: {token_label(key)}",
                    description=(
                        "El texto se redacta y aprueba en el estudio de "
                        "título del proyecto."
                    ),
                    action_label="Revisar estudio de título",
                ),
                fix_url,
            )
        )
    return blockers


async def _project_matriz_response(
    client: Any,
    matrix_row: dict[str, Any],
    *,
    project_id: str,
    organization_id: str,
    variable_snapshot: dict[str, Any],
    evidence_snapshot: dict[str, Any],
) -> MatrizCaseResponse:
    template = await _fetch_template(
        client, str(matrix_row["template_id"]), organization_id
    )
    template_clauses = await _fetch_template_clauses(
        client, str(template["id"]), organization_id
    )
    snapshot_hash = _json_hash(variable_snapshot)
    snapshot_stale = str(matrix_row.get("snapshot_hash")) != snapshot_hash
    if snapshot_stale and matrix_row.get("status") == "approved":
        matrix_row = await _supersede_approved_project_matriz(
            client=client,
            matrix_row=matrix_row,
            current_snapshot_hash=snapshot_hash,
        )
        snapshot_stale = False
    view_clauses, active_clauses = _effective_clauses(
        template_clauses, matrix_row, variable_snapshot
    )
    context = await _fetch_project_context_by_id(client, project_id, organization_id)
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
    resolved_content_by_clause = {
        item.clause_key: item.resolved_content
        for item in resolution.clauses
        if item.resolved_content is not None
    }
    for clause in view_clauses:
        clause["resolved_content"] = resolved_content_by_clause.get(
            str(clause.get("clause_key"))
        )
    return MatrizCaseResponse.model_validate(
        {
            "matriz": {
                "id": matrix_row["id"],
                "escritura_case_id": None,
                "project_id": matrix_row["project_id"],
                "status": matrix_row["status"],
                "version": matrix_row["version"],
                "scope": "project",
                "source_project_matriz_id": None,
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
                "approval_blockers": _project_approval_blockers(
                    manifest=manifest,
                    project_id=str(matrix_row["project_id"]),
                    snapshot_stale=snapshot_stale,
                ),
                "dismissed_alerts": _dismissed_alerts(variable_snapshot),
            },
            "insertable_variables": INSERTABLE_VARIABLES,
        }
    )


async def _insert_matriz_review_decision(
    *,
    client: Any,
    matrix_row: dict[str, Any],
    case_row: dict[str, Any] | None,
    decision_type: str,
    decision_status: str,
    decided_by: str,
    reason: str | None = None,
) -> None:
    organization_id = str(
        case_row["organization_id"] if case_row else matrix_row["organization_id"]
    )
    project_id = str(case_row["project_id"] if case_row else matrix_row["project_id"])
    lot_id = str(case_row["lot_id"]) if case_row and case_row.get("lot_id") else None
    escritura_case_id = str(case_row["id"]) if case_row else None
    payload = {
        "organization_id": organization_id,
        "project_id": project_id,
        "lot_id": lot_id,
        "escritura_case_id": escritura_case_id,
        "decision_type": decision_type,
        "decision_status": decision_status,
        "reason": reason,
        "decided_by": decided_by,
    }
    await asyncio.to_thread(
        lambda: client.table("legal_review_decisions").insert(payload).execute()
    )
    logger.info(
        "escritura_matriz_review_decision",
        organization_id=organization_id,
        escritura_case_id=escritura_case_id,
        matriz_id=str(matrix_row["id"]),
        decision_type=decision_type,
        decision_status=decision_status,
    )


async def _supersede_approved_matriz(
    *,
    client: Any,
    matrix_row: dict[str, Any],
    case_row: dict[str, Any],
    current_snapshot_hash: str,
) -> dict[str, Any]:
    now = _utc_now_iso()
    payload = {
        "status": "draft",
        "snapshot_case_status": case_row.get("case_status") or "variables_pending",
        "snapshot_hash": current_snapshot_hash,
        "version": int(matrix_row.get("version") or 1) + 1,
        "submitted_by": None,
        "submitted_at": None,
        "approved_by": None,
        "approved_at": None,
    }
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .update(payload)
            .eq("id", str(matrix_row["id"]))
            .eq("organization_id", str(case_row["organization_id"]))
            .execute()
        )
    )
    updated = _first_row(result.data) or {**matrix_row, **payload, "updated_at": now}
    logger.info(
        "escritura_matriz_snapshot_superseded",
        organization_id=str(case_row["organization_id"]),
        escritura_case_id=str(case_row["id"]),
        matriz_id=str(matrix_row["id"]),
        previous_snapshot_hash=str(matrix_row.get("snapshot_hash")),
        current_snapshot_hash=current_snapshot_hash,
    )
    return updated


async def _supersede_approved_project_matriz(
    *,
    client: Any,
    matrix_row: dict[str, Any],
    current_snapshot_hash: str,
) -> dict[str, Any]:
    now = _utc_now_iso()
    payload = {
        "status": "draft",
        "snapshot_case_status": "project",
        "snapshot_hash": current_snapshot_hash,
        "version": int(matrix_row.get("version") or 1) + 1,
        "submitted_by": None,
        "submitted_at": None,
        "approved_by": None,
        "approved_at": None,
    }
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .update(payload)
            .eq("id", str(matrix_row["id"]))
            .eq("organization_id", str(matrix_row["organization_id"]))
            .execute()
        )
    )
    updated = _first_row(result.data) or {**matrix_row, **payload, "updated_at": now}
    logger.info(
        "escritura_project_matriz_snapshot_superseded",
        organization_id=str(matrix_row["organization_id"]),
        project_id=str(matrix_row["project_id"]),
        matriz_id=str(matrix_row["id"]),
        previous_snapshot_hash=str(matrix_row.get("snapshot_hash")),
        current_snapshot_hash=current_snapshot_hash,
    )
    return updated


async def _workflow_context(
    matriz_id: UUID, organization_id: UUID
) -> tuple[Any, str, dict[str, Any], dict[str, Any] | None]:
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client

    client = get_supabase_client()
    org_id = str(organization_id)
    matrix_row = await _fetch_matrix_by_id(client, str(matriz_id), org_id)
    case_row: dict[str, Any] | None = None
    if matrix_row.get("escritura_case_id"):
        case_row = await _fetch_case(
            client, str(matrix_row["escritura_case_id"]), org_id
        )
        if str(matrix_row.get("project_id")) != str(case_row["project_id"]):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Matriz not found for this project.",
            )
        project_id = str(case_row["project_id"])
    else:
        project_id = str(matrix_row["project_id"])
        await _fetch_project(client, project_id, org_id)
    ensure_legal_documents_feature_enabled(
        organization_id=org_id,
        project_id=project_id,
    )
    return client, org_id, matrix_row, case_row


async def _workflow_response(
    client: Any, matrix_row: dict[str, Any], case_row: dict[str, Any] | None
) -> MatrizCaseResponse:
    if case_row is not None:
        return await _case_response(client, matrix_row, case_row)
    variable_snapshot, evidence_snapshot = await fetch_project_matriz_snapshot(
        organization_id=str(matrix_row["organization_id"]),
        project_id=str(matrix_row["project_id"]),
        supabase=client,
    )
    return await _project_matriz_response(
        client,
        matrix_row,
        project_id=str(matrix_row["project_id"]),
        organization_id=str(matrix_row["organization_id"]),
        variable_snapshot=variable_snapshot,
        evidence_snapshot=evidence_snapshot,
    )


async def _fresh_workflow_view(
    client: Any, matrix_row: dict[str, Any], case_row: dict[str, Any] | None
) -> tuple[MatrizCaseResponse, list[dict[str, Any]], str]:
    if case_row is not None:
        response = await _case_response(client, matrix_row, case_row)
        current_hash = _json_hash(case_row.get("variable_snapshot"))
    else:
        variable_snapshot, evidence_snapshot = await fetch_project_matriz_snapshot(
            organization_id=str(matrix_row["organization_id"]),
            project_id=str(matrix_row["project_id"]),
            supabase=client,
        )
        response = await _project_matriz_response(
            client,
            matrix_row,
            project_id=str(matrix_row["project_id"]),
            organization_id=str(matrix_row["organization_id"]),
            variable_snapshot=variable_snapshot,
            evidence_snapshot=evidence_snapshot,
        )
        current_hash = _json_hash(variable_snapshot)
    matriz = response.matriz
    blockers = [
        blocker.model_dump(exclude_none=True) for blocker in matriz.approval_blockers
    ]
    return response, blockers, current_hash


def _raise_if_snapshot_stale(
    *, matrix_row: dict[str, Any], current_hash: str, action: str
) -> None:
    if str(matrix_row.get("snapshot_hash")) != current_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "snapshot_stale",
                "message": f"The matriz snapshot changed; reload before {action}.",
            },
        )


async def _signed_minuta_url(client: Any, storage_path: str) -> str:
    signed = await asyncio.to_thread(
        lambda: client.storage.from_(MINUTA_STORAGE_BUCKET).create_signed_url(
            storage_path, expires_in=604800
        )
    )
    if isinstance(signed, dict):
        return str(signed.get("signedURL") or signed.get("signedUrl") or storage_path)
    return storage_path


async def _generation_response(client: Any, row: dict[str, Any]) -> MinutaGeneration:
    payload = {**row}
    payload["download_url"] = await _signed_minuta_url(client, str(row["storage_path"]))
    return MinutaGeneration.model_validate(payload)


async def _resolve_case_vendor_user_id(
    client: Any, case_row: dict[str, Any]
) -> str | None:
    """user_id del vendedor asignado a la venta del lote del caso (SDD 011 US4).

    Cadena: lote del caso → approval_request de venta → `vendors.user_id`.
    Devuelve None si no se resuelve; la entrega cae a web-only, igual auditada.
    """
    lot_id = case_row.get("lot_id")
    organization_id = str(case_row["organization_id"])
    if not lot_id:
        return None
    request_result = await asyncio.to_thread(
        lambda: (
            client.table("approval_requests")
            .select("vendor_id, created_at")
            .eq("organization_id", organization_id)
            .eq("lot_id", str(lot_id))
            .eq("request_type", "sale")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    request_rows = request_result.data if isinstance(request_result.data, list) else []
    vendor_id = request_rows[0].get("vendor_id") if request_rows else None
    if not vendor_id:
        return None
    vendor_result = await asyncio.to_thread(
        lambda: (
            client.table("vendors")
            .select("user_id")
            .eq("id", vendor_id)
            .eq("organization_id", organization_id)
            .limit(1)
            .execute()
        )
    )
    vendor_rows = vendor_result.data if isinstance(vendor_result.data, list) else []
    return vendor_rows[0].get("user_id") if vendor_rows else None


async def _resolve_lot_label(client: Any, case_row: dict[str, Any]) -> str:
    lot_id = case_row.get("lot_id")
    if not lot_id:
        return "tu lote"
    result = await asyncio.to_thread(
        lambda: (
            client.table("lots")
            .select("numero_lote")
            .eq("id", str(lot_id))
            .maybe_single()
            .execute()
        )
    )
    row = _single_row(result)
    numero = row.get("numero_lote") if row else None
    return f"Lote {numero}" if numero else "tu lote"


async def _fetch_case_deliveries(
    client: Any, case_id: str, organization_id: str
) -> list[dict[str, Any]]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_deliveries")
            .select("channel, status, recipient_user_id, sent_at, created_at")
            .eq("escritura_case_id", case_id)
            .eq("organization_id", organization_id)
            .order("created_at", desc=False)
            .execute()
        )
    )
    return _rows(result.data)


async def _fetch_sale_validation(
    client: Any, case_row: dict[str, Any]
) -> dict[str, Any] | None:
    lot_id = case_row.get("lot_id")
    if not lot_id:
        return None
    result = await asyncio.to_thread(
        lambda: (
            client.table("approval_requests")
            .select("id, admin_phone, resolved_at, payload")
            .eq("organization_id", str(case_row["organization_id"]))
            .eq("lot_id", str(lot_id))
            .eq("request_type", "sale")
            .eq("status", "approved")
            .order("resolved_at", desc=True)
            .execute()
        )
    )
    rows = _rows(result.data)
    return rows[0] if rows else None


def _trace_input_keys(manifest: Any) -> list[str]:
    payload = _as_dict(manifest)
    keys: set[str] = set()
    for token in _as_list(payload.get("tokens")):
        if isinstance(token, dict) and token.get("variableKey"):
            keys.add(str(token["variableKey"]))
    for block in _as_list(payload.get("blocks")):
        if isinstance(block, dict) and block.get("blockKey"):
            keys.add(str(block["blockKey"]))
    return sorted(keys)


async def _build_escritura_trace(
    client: Any, case_row: dict[str, Any]
) -> dict[str, Any]:
    """Trazabilidad completa de una escritura (SDD 011 T020, FR-012): matriz
    del proyecto aprobada, venta validada, borrador generado, aceptado y
    entregas — en orden."""
    organization_id = str(case_row["organization_id"])
    project_id = str(case_row["project_id"])
    case_id = str(case_row["id"])
    events: list[dict[str, Any]] = []
    source_project_matriz_id: str | None = None

    project_matriz = await _fetch_active_project_matrix(
        client, project_id, organization_id
    )
    if project_matriz:
        source_project_matriz_id = str(project_matriz["id"])
        if project_matriz.get("approved_by"):
            events.append(
                {
                    "kind": "project_matriz_approved",
                    "label": "Matriz del proyecto aprobada",
                    "at": project_matriz.get("approved_at"),
                    "actor_id": project_matriz.get("approved_by"),
                    "matriz_version": project_matriz.get("version"),
                }
            )

    sale_validation = await _fetch_sale_validation(client, case_row)
    if sale_validation:
        events.append(
            {
                "kind": "sale_validated",
                "label": "Venta validada",
                "at": sale_validation.get("resolved_at"),
                "actor_id": _uuid_text_or_none(sale_validation.get("admin_phone")),
                "approval_id": sale_validation.get("id"),
                "input_keys": sorted(_as_dict(sale_validation.get("payload")).keys()),
            }
        )

    gen_result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_minuta_generations")
            .select(GENERATION_COLUMNS)
            .eq("escritura_case_id", case_id)
            .eq("organization_id", organization_id)
            .order("generated_at", desc=False)
            .execute()
        )
    )
    for gen in _rows(gen_result.data):
        events.append(
            {
                "kind": "draft_generated",
                "label": "Borrador generado",
                "at": gen.get("generated_at"),
                "actor_id": gen.get("generated_by"),
                "matriz_version": gen.get("matriz_version"),
                "input_keys": _trace_input_keys(gen.get("resolution_manifest")),
            }
        )
        if gen.get("warning_acknowledged_by"):
            events.append(
                {
                    "kind": "draft_accepted",
                    "label": "Borrador aceptado",
                    "at": gen.get("warning_acknowledged_at"),
                    "actor_id": gen.get("warning_acknowledged_by"),
                }
            )

    for delivery in await _fetch_case_deliveries(client, case_id, organization_id):
        events.append(
            {
                "kind": "delivered",
                "label": delivery_status_label(str(delivery.get("status") or "")),
                "at": delivery.get("sent_at") or delivery.get("created_at"),
                "channel": delivery.get("channel"),
                "status": delivery.get("status"),
                "recipient_user_id": delivery.get("recipient_user_id"),
            }
        )

    return {
        "escritura_case_id": case_id,
        "source_project_matriz_id": source_project_matriz_id,
        "events": events,
    }


async def _generate_minuta_row(
    *,
    client: Any,
    matrix_row: dict[str, Any],
    case_row: dict[str, Any],
    template: dict[str, Any],
    active_clauses: list[dict[str, Any]],
    request: GenerateMinutaRequest,
) -> MinutaGeneration:
    variable_snapshot = _as_dict(case_row.get("variable_snapshot"))
    evidence_snapshot = _as_dict(case_row.get("evidence_snapshot"))
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

    if resolution.missing_count or resolution.blocked_count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "unresolved_matriz_tokens",
                "message": "La matriz aprobada contiene tokens pendientes.",
                "missing_count": resolution.missing_count,
                "blocked_count": resolution.blocked_count,
            },
        )

    by_key = {str(clause.get("clause_key")): clause for clause in active_clauses}
    rendered_clauses = []
    for clause_resolution in resolution.clauses:
        if clause_resolution.omitted or not clause_resolution.resolved_content:
            continue
        source_clause = by_key.get(clause_resolution.clause_key, {})
        rendered_clauses.append(
            {
                "clause_key": clause_resolution.clause_key,
                "title": source_clause.get("title") or clause_resolution.clause_key,
                "resolved_content": clause_resolution.resolved_content,
            }
        )

    try:
        docx_bytes = render_minuta_docx(
            clauses=rendered_clauses,
            metadata={
                "title": f"Minuta {template['name']}",
                # FR-008 / ADR-009: todo entregable lleva la marca de borrador.
                "draft_notice": ESCRITURA_BORRADOR_NOTICE,
            },
        )
    except MatrizDocxError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "docx_render_failed",
                "message": str(exc),
            },
        ) from exc

    content_hash = hashlib.sha256(docx_bytes).hexdigest()
    generation_id = str(uuid.uuid4())
    storage_path = (
        f"{case_row['organization_id']}/escritura-minutas/"
        f"{case_row['id']}/{generation_id}.docx"
    )
    await asyncio.to_thread(
        lambda: client.storage.from_(MINUTA_STORAGE_BUCKET).upload(
            storage_path,
            docx_bytes,
            {
                "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            },
        )
    )

    now = _utc_now_iso()
    payload = {
        "id": generation_id,
        "organization_id": str(case_row["organization_id"]),
        "project_id": str(case_row["project_id"]),
        "escritura_case_id": str(case_row["id"]),
        "matriz_id": str(matrix_row["id"]),
        "matriz_version": int(matrix_row["version"]),
        "template_id": str(template["id"]),
        "snapshot_hash": str(matrix_row["snapshot_hash"]),
        "resolution_manifest": resolution.manifest_dict(),
        "content_hash": content_hash,
        "storage_path": storage_path,
        "warning_acknowledged_by": str(request.generated_by),
        "warning_acknowledged_at": now,
        "generated_by": str(request.generated_by),
        "generated_at": now,
    }
    result = await asyncio.to_thread(
        lambda: client.table("escritura_minuta_generations").insert(payload).execute()
    )
    inserted = _first_row(result.data) or payload
    logger.info(
        "escritura_minuta_generated",
        organization_id=str(case_row["organization_id"]),
        escritura_case_id=str(case_row["id"]),
        matriz_id=str(matrix_row["id"]),
        generation_id=generation_id,
        content_hash=content_hash,
    )

    # SDD 011 (US4): al aceptar/generar el borrador, entregarlo al vendedor
    # asignado (Telegram best-effort + "mis documentos"). Best-effort: una falla
    # de entrega NUNCA invalida la generación del DOCX ya persistida.
    try:
        vendor_user_id = await _resolve_case_vendor_user_id(client, case_row)
        lot_label = await _resolve_lot_label(client, case_row)
        await deliver_draft(
            supabase=client,
            generation=inserted,
            recipient_user_id=vendor_user_id,
            lot_label=lot_label,
        )
    except Exception as exc:  # noqa: BLE001 - entrega best-effort, jamás bloquea
        logger.warning(
            "escritura_delivery_trigger_failed",
            generation_id=generation_id,
            error=str(exc),
        )

    return await _generation_response(client, inserted)


@router.get(
    "/escritura-matrices/project/{project_id}",
    response_model=MatrizCaseResponse,
)
async def get_project_matriz(
    project_id: UUID,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client

    client = get_supabase_client()
    org_id = str(organization_id)
    project_id_str = str(project_id)
    await _fetch_project(client, project_id_str, org_id)
    ensure_legal_documents_feature_enabled(
        organization_id=org_id,
        project_id=project_id_str,
    )
    variable_snapshot, evidence_snapshot = await fetch_project_matriz_snapshot(
        organization_id=org_id,
        project_id=project_id_str,
        supabase=client,
    )
    matrix_row = await _fetch_active_project_matrix(client, project_id_str, org_id)
    if matrix_row is None:
        matrix_row = await _lazy_create_project_matrix(
            client, project_id_str, org_id, variable_snapshot
        )
    return await _project_matriz_response(
        client,
        matrix_row,
        project_id=project_id_str,
        organization_id=org_id,
        variable_snapshot=variable_snapshot,
        evidence_snapshot=evidence_snapshot,
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
    matrix_row = await _fetch_active_matrix(
        client, str(escritura_case_id), org_id, str(case_row["project_id"])
    )
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
    if str(matrix_row.get("project_id")) != str(case_row["project_id"]):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matriz not found for this project.",
        )
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
    if matrix_row.get("status") == "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "matriz_approved_locked",
                "message": "Approved matrices are locked; a new snapshot must return them to draft.",
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
    request: MatrizSubmitRequest,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    client, _org_id, matrix_row, case_row = await _workflow_context(
        matriz_id, organization_id
    )
    response, blockers, current_hash = await _fresh_workflow_view(
        client, matrix_row, case_row
    )
    _raise_if_snapshot_stale(
        matrix_row=matrix_row, current_hash=current_hash, action="submitting"
    )
    if matrix_row.get("status") != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "invalid_matriz_status",
                "message": "Only draft matrices can be submitted for legal review.",
                "current_status": matrix_row.get("status"),
            },
        )
    if blockers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "approval_blocked",
                "message": "La matriz tiene blockers antes de revisión legal.",
                "blocking": blockers,
            },
        )
    now = _utc_now_iso()
    payload = {
        "status": "legal_review_pending",
        "submitted_by": str(request.submitted_by),
        "submitted_at": now,
        "approved_by": None,
        "approved_at": None,
        "version": int(matrix_row["version"]) + 1,
    }
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .update(payload)
            .eq("id", str(matriz_id))
            .eq("organization_id", str(organization_id))
            .execute()
        )
    )
    updated = _first_row(result.data) or {**matrix_row, **payload}
    await _insert_matriz_review_decision(
        client=client,
        matrix_row=updated,
        case_row=case_row,
        decision_type="matriz_submitted",
        decision_status="needs_changes",
        decided_by=str(request.submitted_by),
        reason="submitted_for_legal_review",
    )
    return await _workflow_response(client, updated, case_row)


@router.post(
    "/escritura-matrices/{matriz_id}/approve",
    response_model=MatrizCaseResponse,
)
async def approve_matriz(
    matriz_id: UUID,
    request: MatrizApproveRequest,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    client, _org_id, matrix_row, case_row = await _workflow_context(
        matriz_id, organization_id
    )
    response, blockers, current_hash = await _fresh_workflow_view(
        client, matrix_row, case_row
    )
    _raise_if_snapshot_stale(
        matrix_row=matrix_row, current_hash=current_hash, action="approving"
    )
    if matrix_row.get("status") != "legal_review_pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "invalid_matriz_status",
                "message": "Only matrices pending legal review can be approved.",
                "current_status": matrix_row.get("status"),
            },
        )
    if str(matrix_row.get("submitted_by")) == str(request.approved_by):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "reviewer_not_authorized",
                "message": "The legal reviewer must be different from the submitter.",
            },
        )
    if blockers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "approval_blocked",
                "message": "La matriz tiene blockers antes de aprobación.",
                "blocking": blockers,
            },
        )
    now = _utc_now_iso()
    payload = {
        "status": "approved",
        "approved_by": str(request.approved_by),
        "approved_at": now,
        "version": int(matrix_row["version"]) + 1,
    }
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .update(payload)
            .eq("id", str(matriz_id))
            .eq("organization_id", str(organization_id))
            .execute()
        )
    )
    updated = _first_row(result.data) or {**matrix_row, **payload}
    await _insert_matriz_review_decision(
        client=client,
        matrix_row=updated,
        case_row=case_row,
        decision_type="matriz_approved",
        decision_status="approved",
        decided_by=str(request.approved_by),
    )
    return await _workflow_response(client, updated, case_row)


@router.post(
    "/escritura-matrices/{matriz_id}/reject",
    response_model=MatrizCaseResponse,
)
async def reject_matriz(
    matriz_id: UUID,
    request: MatrizRejectRequest,
    organization_id: UUID = Query(...),
) -> MatrizCaseResponse:
    client, _org_id, matrix_row, case_row = await _workflow_context(
        matriz_id, organization_id
    )
    _response, _blockers, current_hash = await _fresh_workflow_view(
        client, matrix_row, case_row
    )
    _raise_if_snapshot_stale(
        matrix_row=matrix_row,
        current_hash=current_hash,
        action="rejecting",
    )
    if matrix_row.get("status") != "legal_review_pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "invalid_matriz_status",
                "message": "Only matrices pending legal review can be rejected.",
                "current_status": matrix_row.get("status"),
            },
        )
    now = _utc_now_iso()
    payload = {
        "status": "draft",
        "submitted_by": None,
        "submitted_at": None,
        "approved_by": None,
        "approved_at": None,
        "version": int(matrix_row["version"]) + 1,
    }
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .update(payload)
            .eq("id", str(matriz_id))
            .eq("organization_id", str(organization_id))
            .execute()
        )
    )
    updated = _first_row(result.data) or {**matrix_row, **payload, "updated_at": now}
    await _insert_matriz_review_decision(
        client=client,
        matrix_row=updated,
        case_row=case_row,
        decision_type="matriz_rejected",
        decision_status="rejected",
        decided_by=str(request.rejected_by),
        reason=request.reason,
    )
    return await _workflow_response(client, updated, case_row)


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
    from api.v1.endpoints.legal_variables import (
        ensure_legal_documents_feature_enabled,
    )
    from core.database import get_supabase_client

    if not request.warning_acknowledged:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "warning_required",
                "message": "Debes confirmar el warning legal antes de generar la minuta.",
            },
        )

    client = get_supabase_client()
    org_id = str(organization_id)
    matrix_row = await _fetch_matrix_by_id(client, str(matriz_id), org_id)
    case_row = await _fetch_case(client, str(matrix_row["escritura_case_id"]), org_id)
    if str(matrix_row.get("project_id")) != str(case_row["project_id"]):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matriz not found for this project.",
        )
    ensure_legal_documents_feature_enabled(
        organization_id=org_id,
        project_id=str(case_row["project_id"]),
    )
    if matrix_row.get("status") != "approved":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "matriz_not_approved",
                "message": "Solo una matriz aprobada puede generar minuta DOCX.",
            },
        )
    current_hash = _json_hash(case_row.get("variable_snapshot"))
    if str(matrix_row.get("snapshot_hash")) != current_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "snapshot_stale",
                "message": "The escritura case snapshot changed; reload before generating.",
            },
        )
    readiness_blockers = _readiness_gate_blockers(
        case_row=case_row,
        fix_url=f"/projects/{case_row['project_id']}?tab=legal",
    )
    if readiness_blockers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "readiness_blocked",
                "message": "El caso tiene gates de readiness bloqueados.",
                "blocking": readiness_blockers,
            },
        )

    template = await _fetch_template(client, str(matrix_row["template_id"]), org_id)
    template_clauses = await _fetch_template_clauses(
        client, str(template["id"]), org_id
    )
    _, active_clauses = _effective_clauses(
        template_clauses, matrix_row, _as_dict(case_row.get("variable_snapshot"))
    )
    alert_blockers = _alert_clause_blockers(
        variable_snapshot=_as_dict(case_row.get("variable_snapshot")),
        active_clauses=active_clauses,
        fix_url="/documentos/plantillas",
    )
    if alert_blockers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "alert_clause_missing",
                "message": "La matriz aprobada no contiene todas las clausulas comprometidas por alertas.",
                "blocking": alert_blockers,
            },
        )
    return await _generate_minuta_row(
        client=client,
        matrix_row=matrix_row,
        case_row=case_row,
        template=template,
        active_clauses=active_clauses,
        request=request,
    )


@router.get(
    "/escritura-matrices/case/{escritura_case_id}/generations",
    response_model=MinutaGenerationListResponse,
)
async def list_case_generations(
    escritura_case_id: UUID,
    organization_id: UUID = Query(...),
) -> MinutaGenerationListResponse:
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
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_minuta_generations")
            .select(GENERATION_COLUMNS)
            .eq("escritura_case_id", str(escritura_case_id))
            .eq("organization_id", org_id)
            .eq("project_id", str(case_row["project_id"]))
            .order("generated_at", desc=True)
            .execute()
        )
    )
    generations = [
        await _generation_response(client, row) for row in _rows(result.data)
    ]
    return MinutaGenerationListResponse(generations=generations)


@router.get(
    "/escritura-matrices/case/{escritura_case_id}/trace",
    response_model=EscrituraTraceResponse,
)
async def get_escritura_trace(
    escritura_case_id: UUID,
    organization_id: UUID = Query(...),
) -> EscrituraTraceResponse:
    """Trazabilidad completa de la escritura (FR-012), consultable desde la
    mesa y el historial."""
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
    trace = await _build_escritura_trace(client, case_row)
    return EscrituraTraceResponse.model_validate(trace)


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
    case_row = _single_row(case_result)
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
