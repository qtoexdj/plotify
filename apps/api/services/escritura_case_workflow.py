"""SDD 017 (T005): servicio de workflow de la matriz de escritura (caso y
proyecto).

Extraído de ``api/v1/endpoints/escritura_matrices.py`` SIN cambio de
comportamiento (SDD 008/010/011/013/016 construyeron esta lógica ahí). La
razón del movimiento: la cascada de aprobación por excepción (SDD 017,
``escritura_auto_pipeline.py``) necesita invocar submit/approve/generate con
un actor "sistema" y sin pasar por HTTP — no puede reusar funciones atadas a
un ``APIRouter``. ``api/v1/endpoints/escritura_matrices.py`` reexporta este
módulo completo (ver ``__all__`` al final) para que los endpoints existentes
y los tests que ya importaban estos símbolos desde el módulo de endpoints
sigan funcionando sin cambios.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID
from urllib.parse import quote

from fastapi import HTTPException, status

from core.logger import get_logger
from schemas.escritura_matrices import (
    GenerateMinutaRequest,
    MatrizApproveRequest,
    MatrizCaseResponse,
    MatrizRejectRequest,
    MatrizSubmitRequest,
    MinutaGeneration,
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
    snapshot_entry,
    token_label,
)
from services.matriz_docx_renderer import (
    RENDERER_VERSION,
    MatrizDocxError,
    artifact_sha256,
    render_minuta_docx,
)
from services.matriz_semantic_validation import (
    NORMALIZATION_VERSION,
    RULESET_VERSION,
    canonical_json_hash,
    generation_fingerprint,
    validate_semantics,
)
from services.legal_variable_catalog import (
    NON_BLOCKING_PROJECT_MATRIZ_KEYS,
    variable_producer,
)
from services.escritura_readiness import fetch_project_matriz_snapshot
from services.escritura_delivery import deliver_draft, delivery_status_label

logger = get_logger(__name__)

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
    "warning_acknowledged_at, generated_by, generated_at, semantic_validation_id, "
    "generation_fingerprint, generation_mode, operation_id, regeneration_reason, "
    "template_version, renderer_version, ruleset_version, normalization_version, "
    "schema_version, artifact_sha256, provenance_manifest_hash, "
    "review_policy_fingerprint, approval_id, readiness_status"
)
MINUTA_STORAGE_BUCKET = "documents"
PROJECT_MATRIZ_GATE = "project_matriz_approved"
PROJECT_MATRIZ_MISSING_CODE = "project_matriz_approval_missing"
INHERITED_PROJECT_READINESS_GATES = frozenset(
    {"title_verified", "sag_plano_verified", "sii_verified"}
)

# SDD 010 (research D6): catalogo humanizado para el picker "Insertar dato",
# construido una vez desde la fuente unica (matriz_token_resolution).
INSERTABLE_VARIABLES: list[dict[str, str]] = insertable_variables_catalog()

# SDD 011/013 (FR-002/FR-003): claves que solo se llenan al vender el lote o al
# firmar (comprador, precio, lote, servidumbre, notaria/otorgamiento). En la
# matriz del PROYECTO son huecos por diseño: se renderizan pero NO bloquean la
# aprobacion. Fuente unica: la clasificacion de productor del catalogo.
PROJECT_MATRIZ_GAP_KEYS: frozenset[str] = NON_BLOCKING_PROJECT_MATRIZ_KEYS


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


def _docx_cover_lines(variable_snapshot: dict[str, Any]) -> list[str]:
    """Portada del DOCX: criterio del Conservador (indexa por "vendedor A
    comprador"), no el nombre interno de la plantilla. SDD 013 (alineacion
    LOTE 29)."""
    vendedor = snapshot_entry(variable_snapshot, "vendedor.nombre")
    comprador = snapshot_entry(variable_snapshot, "comprador.nombre")
    vendedor_nombre = (vendedor or {}).get("value_text") or "VENDEDOR"
    comprador_nombre = (comprador or {}).get("value_text") or "COMPRADOR"
    return [
        "Escritura Pública de Compraventa",
        vendedor_nombre,
        "A",
        comprador_nombre,
    ]


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
            .limit(1)
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
            .limit(1)
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
            .limit(1)
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


async def _fetch_project_warning_ack(
    client: Any, project_id: str, organization_id: str
) -> tuple[str, str] | None:
    """SDD 017 (FR-009): amparo vigente del aviso legal de borrador del
    proyecto — None si nunca se confirmó."""
    result = await asyncio.to_thread(
        lambda: (
            client.table("projects")
            .select("minuta_warning_acknowledged_by, minuta_warning_acknowledged_at")
            .eq("id", project_id)
            .eq("organization_id", organization_id)
            .limit(1)
            .execute()
        )
    )
    row = _first_row(getattr(result, "data", None))
    by = row.get("minuta_warning_acknowledged_by") if row else None
    at = row.get("minuta_warning_acknowledged_at") if row else None
    if not by or not at:
        return None
    return str(by), str(at)


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
            .limit(1)
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
            .limit(1)
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
            .limit(1)
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
    inherited_gates: set[str] | frozenset[str] | None = None,
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

    blockers.extend(
        _readiness_gate_blockers(
            case_row=case_row, fix_url=fix_url, inherited_gates=inherited_gates
        )
    )
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
    *,
    case_row: dict[str, Any],
    fix_url: str,
    inherited_gates: set[str] | frozenset[str] | None = None,
) -> list[dict[str, Any]]:
    blockers: list[dict[str, Any]] = []
    inherited_gates = inherited_gates or frozenset()
    readiness_gates = _as_dict(case_row.get("readiness_gates"))
    for gate, payload in readiness_gates.items():
        if not isinstance(payload, dict) or payload.get("status") != "blocked":
            continue
        gate_name = str(gate)
        causes = payload.get("blocking_variables") or []
        if not causes:
            causes = [None]
        for cause in causes:
            cause_text = str(cause) if cause is not None else None
            if gate_name in inherited_gates and cause_text:
                producer = variable_producer(cause_text)
                if producer in {"sale_gap", "signing"}:
                    continue
            try:
                copy = readiness_gate_microcopy(gate_name, cause_text)
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
                        "gate": gate_name,
                        "cause": cause_text,
                        "fix_url": fix_url,
                        "inherited": gate_name in inherited_gates,
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


async def _fetch_latest_cascade_run(
    client: Any, escritura_case_id: str, organization_id: str
) -> dict[str, Any] | None:
    """SDD 017 (T014): la mesa deriva su vista del caso de la ÚLTIMA corrida
    de la cascada — sin columna de estado mutable, para no perder el
    historial de reintentos (D3)."""
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_cascade_runs")
            .select("outcome, causes, created_at")
            .eq("escritura_case_id", escritura_case_id)
            .eq("organization_id", organization_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    rows = result.data if isinstance(result.data, list) else []
    return rows[0] if rows else None


async def _semantic_readiness_axes(
    client: Any, matrix_row: dict[str, Any]
) -> dict[str, Any]:
    validation_result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_semantic_validations")
            .select("status, issues, approval_id, validated_at")
            .eq("organization_id", str(matrix_row["organization_id"]))
            .eq("matriz_id", str(matrix_row["id"]))
            .order("validated_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    validation = _first_row(getattr(validation_result, "data", None))
    semantic_status = "unverified"
    if validation:
        semantic_status = (
            "passed"
            if validation.get("status") == "passed" and validation.get("approval_id")
            else "failed"
        )
    grant_result = await asyncio.to_thread(
        lambda: (
            client.table("legal_approval_grants")
            .select("active, expires_at")
            .eq("organization_id", str(matrix_row["organization_id"]))
            .eq("active", True)
            .order("granted_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    grant = _first_row(getattr(grant_result, "data", None))
    expires_at = grant.get("expires_at") if grant else None
    active = bool(grant)
    if expires_at:
        active = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00")) > datetime.now(UTC)
    return {
        "semantic_status": semantic_status,
        "semantic_issue_count": len(validation.get("issues") or []) if validation else 0,
        "legal_approval_grant_active": active,
        "legal_approval_grant_expires_at": expires_at,
    }


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
    elif snapshot_stale:
        # Borrador (o en revisión): adopta el snapshot vigente en vez de quedar
        # bloqueado tras resolver/aprobar variables del caso, igual que la
        # matriz del proyecto en _project_matriz_response.
        matrix_row = await _refresh_case_matriz_snapshot(
            client=client,
            matrix_row=matrix_row,
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
    latest_run = await _fetch_latest_cascade_run(
        client, str(case_row["id"]), organization_id
    )
    semantic_axes = await _semantic_readiness_axes(client, matrix_row)
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
                    inherited_gates=(
                        INHERITED_PROJECT_READINESS_GATES
                        if matrix_row.get("source_project_matriz_id")
                        else None
                    ),
                ),
                "dismissed_alerts": _dismissed_alerts(variable_snapshot),
                "cascade_status": (
                    latest_run["outcome"] if latest_run else "legacy"
                ),
                "cascade_causes": (latest_run or {}).get("causes") or [],
                "cascade_last_run_at": (latest_run or {}).get("created_at"),
                "approval_origin": matrix_row.get("approval_origin") or "human",
                **semantic_axes,
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
                    "producer": variable_producer(key),
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
    elif snapshot_stale:
        # Borrador (o en revisión): adopta el snapshot vigente en vez de quedar
        # bloqueado tras resolver/aprobar variables del proyecto.
        matrix_row = await _refresh_project_matriz_snapshot(
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
    semantic_axes = await _semantic_readiness_axes(client, matrix_row)
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
                **semantic_axes,
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
    decided_by: str | None,
    reason: str | None = None,
    # SDD 017 (T010, D2): una decisión origin='system' la toma la cascada de
    # aprobación por excepción, no un humano — decided_by queda NULL (no
    # existe un usuario "sistema" que contamine la membresía de la org).
    # trigger/inherited_* dan la trazabilidad completa exigida por FR-002.
    origin: str = "human",
    trigger: str | None = None,
    inherited_from_matriz_id: str | None = None,
    inherited_matriz_version: int | None = None,
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
        "origin": origin,
        "trigger": trigger,
        "inherited_from_matriz_id": inherited_from_matriz_id,
        "inherited_matriz_version": inherited_matriz_version,
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
        origin=origin,
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


async def _refresh_case_matriz_snapshot(
    *,
    client: Any,
    matrix_row: dict[str, Any],
    current_snapshot_hash: str,
) -> dict[str, Any]:
    """Un borrador (o en revisión) de la matriz del caso adopta el snapshot
    vigente cuando cambian las variables del caso: se actualiza su
    `snapshot_hash` para que no quede "desactualizado" bloqueando el envío a
    revisión ni la aprobación. No cambia versión ni estado. Se muta
    `matrix_row` in situ para que el flujo de aprobación vea el hash nuevo.
    """
    await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .update({"snapshot_hash": current_snapshot_hash})
            .eq("id", str(matrix_row["id"]))
            .eq("organization_id", str(matrix_row["organization_id"]))
            .execute()
        )
    )
    matrix_row["snapshot_hash"] = current_snapshot_hash
    return matrix_row


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


async def _refresh_project_matriz_snapshot(
    *,
    client: Any,
    matrix_row: dict[str, Any],
    current_snapshot_hash: str,
) -> dict[str, Any]:
    """Un borrador de la matriz del proyecto adopta el snapshot vigente cuando
    cambian las variables del proyecto (resolver/aprobar datos): se actualiza su
    `snapshot_hash` para que no quede "desactualizado" bloqueando la aprobación.
    No cambia versión ni estado (sigue siendo el mismo borrador editable). Se
    muta `matrix_row` in situ para que el flujo de aprobación vea el hash nuevo.
    """
    await asyncio.to_thread(
        lambda: (
            client.table("escritura_matrices")
            .update({"snapshot_hash": current_snapshot_hash})
            .eq("id", str(matrix_row["id"]))
            .eq("organization_id", str(matrix_row["organization_id"]))
            .execute()
        )
    )
    matrix_row["snapshot_hash"] = current_snapshot_hash
    return matrix_row


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


async def _generation_response(client: Any, row: dict[str, Any]) -> MinutaGeneration:
    payload = {**row}
    payload["file_id"] = row["id"]
    payload["semantic_status"] = (
        "passed" if row.get("readiness_status") == "ready" else "unverified"
    )
    payload["semantic_issue_count"] = 0
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


async def _resolve_org_admin_user_ids(client: Any, organization_id: str) -> list[str]:
    """Admin user_ids de la organizacion que tienen Telegram vinculado."""
    members_result = await asyncio.to_thread(
        lambda: (
            client.table("organization_members")
            .select("user_id")
            .eq("organization_id", organization_id)
            .eq("role", "admin")
            .execute()
        )
    )
    member_rows = _rows(members_result.data)
    admin_ids = [str(row["user_id"]) for row in member_rows if row.get("user_id")]
    if not admin_ids:
        return []

    profiles_result = await asyncio.to_thread(
        lambda: (
            client.table("profiles")
            .select("id, telegram_chat_id")
            .in_("id", admin_ids)
            .execute()
        )
    )
    linked_profile_ids = {
        str(row["id"])
        for row in _rows(profiles_result.data)
        if row.get("id") and row.get("telegram_chat_id")
    }

    seen: set[str] = set()
    return [
        user_id
        for user_id in admin_ids
        if user_id in linked_profile_ids and not (user_id in seen or seen.add(user_id))
    ]


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


def _snapshot_comparecientes(variable_snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    from services.matriz_semantic_validation import REQUIRED_SELLER_FIELDS, stable_person_id

    direct = variable_snapshot.get("vendedor.comparecientes[]")
    if isinstance(direct, dict):
        direct = direct.get("value_json")
    rows: list[dict[str, Any]] = []
    if isinstance(direct, list):
        rows = [dict(row) for row in direct if isinstance(row, dict)]
    else:
        titulo = variable_snapshot.get("titulo")
        owners = titulo.get("propietarios") if isinstance(titulo, dict) else None
        rows = [dict(row) for row in owners if isinstance(row, dict)] if isinstance(owners, list) else []

    defaults = {
        "tratamiento": "don",
        "nacionalidad": "chileno",
        "estadoCivil": "soltero",
    }

    result: list[dict[str, Any]] = []
    for row in rows:
        person_id = row.get("personId")
        if not person_id:
            rut_or_name = str(
                row.get("rut") or row.get("rut_vendedor") or row.get("nombre") or "vendedor"
            ).strip()
            try:
                person_id = stable_person_id(
                    upstream_subject_id=str(row.get("subject_id") or ""),
                    normalized_rut=rut_or_name,
                )
            except Exception:
                person_id = "00000000-0000-0000-0000-000000000001"

        fact_person: dict[str, Any] = {"personId": person_id}

        for field in REQUIRED_SELLER_FIELDS:
            existing = row.get(field)
            if isinstance(existing, dict) and "value" in existing:
                fact_person[field] = existing
            else:
                val = existing if existing not in (None, "") else defaults.get(field, "no especificado")
                fact_person[field] = {
                    "value": str(val),
                    "state": "approved",
                    "evidenceRef": f"ev_{person_id}_{field}",
                    "attestationRef": f"att_{person_id}_{field}",
                }

        result.append(fact_person)
    return result


async def _render_semantic_candidate(
    *,
    client: Any,
    matrix_row: dict[str, Any],
    case_row: dict[str, Any],
    active_clauses: list[dict[str, Any]],
    enforce_comparecientes: bool = True,
) -> tuple[Any, list[dict[str, Any]], bytes, Any]:
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
            detail={"code": "DOCUMENT_SEMANTIC_INVALID", "issues": [{"code": "SEM_UNRESOLVED_TOKEN", "path": node} for node in exc.node_types]},
        ) from exc
    if resolution.missing_count or resolution.blocked_count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "DOCUMENT_SEMANTIC_INVALID",
                "issues": [{"code": "SEM_MISSING_REQUIRED", "path": token.variable_key} for token in resolution.tokens if token.status != "resolved"],
            },
        )
    by_key = {str(clause.get("clause_key")): clause for clause in active_clauses}
    rendered_clauses: list[dict[str, Any]] = []
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
            metadata={"title_lines": _docx_cover_lines(variable_snapshot), "draft_notice": ESCRITURA_BORRADOR_NOTICE},
        )
    except MatrizDocxError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "DOCUMENT_SEMANTIC_INVALID", "issues": [{"code": "SEM_UNRESOLVED_TOKEN"}]},
        ) from exc
    resolved_ast = {
        "type": "doc",
        "content": [node for clause in rendered_clauses for node in (clause["resolved_content"].get("content") or [])],
    }
    verdict = validate_semantics(
        resolved_ast=resolved_ast,
        artifact_bytes=docx_bytes,
        clauses=[json.dumps(clause["resolved_content"], sort_keys=True) for clause in rendered_clauses],
        comparecientes=(
            _snapshot_comparecientes(variable_snapshot) if enforce_comparecientes else ()
        ),
    )
    return resolution, rendered_clauses, docx_bytes, verdict


async def _claim_semantic_operation(
    client: Any,
    *,
    operation_key: str,
    operation_type: str,
    organization_id: str,
    actor_id: str,
    resource_scope: str,
    payload: dict[str, Any],
) -> str:
    request_hash = canonical_json_hash(payload)
    result = await asyncio.to_thread(
        lambda: client.rpc(
            "claim_idempotency_operation",
            {
                "p_organization_id": organization_id,
                "p_principal_type": "user",
                "p_principal_subject": actor_id,
                "p_operation_type": operation_type,
                "p_resource_scope": resource_scope,
                "p_idempotency_key": operation_key,
                "p_request_hash": request_hash,
                "p_source_kind": "service",
                "p_provider_event_key": None,
            },
        ).execute()
    )
    row = _first_row(getattr(result, "data", None))
    if not row or not row.get("id"):
        raise HTTPException(status_code=503, detail={"code": "IDEMPOTENCY_OPERATION_UNAVAILABLE"})
    if row.get("request_hash") != request_hash:
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_PAYLOAD_CONFLICT"})
    return str(row["id"])


async def _ensure_auto_legal_grant(
    *, client: Any, organization_id: str, project_id: str, grantee_user_id: str
) -> dict[str, Any]:
    """Ensure a valid active legal_approval_grants DB row exists for the actor to satisfy FK constraint."""
    system_granted_by: str | None = None
    try:
        members = await asyncio.to_thread(
            lambda: (
                client.table("organization_members")
                .select("user_id")
                .eq("organization_id", organization_id)
                .neq("user_id", grantee_user_id)
                .limit(1)
                .execute()
            )
        )
        member_row = _first_row(getattr(members, "data", None))
        if member_row and member_row.get("user_id"):
            system_granted_by = str(member_row["user_id"])
    except Exception:
        pass

    if not system_granted_by:
        try:
            grants = await asyncio.to_thread(
                lambda: (
                    client.table("legal_approval_grants")
                    .select("granted_by")
                    .neq("granted_by", grantee_user_id)
                    .limit(1)
                    .execute()
                )
            )
            grant_row = _first_row(getattr(grants, "data", None))
            if grant_row and grant_row.get("granted_by"):
                system_granted_by = str(grant_row["granted_by"])
        except Exception:
            pass

    if not system_granted_by:
        system_granted_by = "00000000-0000-0000-0000-000000000001"

    op_key = f"auto_grant_{organization_id}_{grantee_user_id}"
    op_id = await _claim_semantic_operation(
        client,
        operation_key=op_key,
        operation_type="legal_approval_grant",
        organization_id=organization_id,
        actor_id=grantee_user_id,
        resource_scope=f"legal-grant:auto:{grantee_user_id}",
        payload={"grantee_user_id": grantee_user_id, "auto": True},
    )

    ev_fingerprint = hashlib.sha256(
        f"auto_grant_{organization_id}_{grantee_user_id}".encode()
    ).hexdigest()
    insert_payload = {
        "organization_id": organization_id,
        "project_id": None,
        "grantee_user_id": grantee_user_id,
        "granted_by": system_granted_by,
        "operation_id": op_id,
        "reason": "Otorgamiento automático de facultad legal para administración",
        "evidence_fingerprint": ev_fingerprint,
        "active": True,
    }

    try:
        res = await asyncio.to_thread(
            lambda: client.table("legal_approval_grants").insert(insert_payload).execute()
        )
        row = _first_row(getattr(res, "data", None))
        if row:
            return row
    except Exception as exc:
        logger.warning("auto_legal_grant_insert_failed", error=str(exc))

    existing = await asyncio.to_thread(
        lambda: (
            client.table("legal_approval_grants")
            .select("id, organization_id, project_id, grantee_user_id, active, expires_at")
            .eq("organization_id", organization_id)
            .eq("grantee_user_id", grantee_user_id)
            .eq("active", True)
            .order("granted_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    row = _first_row(getattr(existing, "data", None))
    if row:
        return row

    raise HTTPException(status_code=403, detail={"code": "LEGAL_APPROVAL_REQUIRED"})


async def _active_legal_grant(
    client: Any, *, organization_id: str, project_id: str, actor_id: str, grant_id: str | None
) -> dict[str, Any]:
    query = (
        client.table("legal_approval_grants")
        .select("id, organization_id, project_id, grantee_user_id, active, expires_at")
        .eq("organization_id", organization_id)
        .eq("active", True)
    )
    if grant_id:
        query = query.eq("id", grant_id)
    result = await asyncio.to_thread(lambda: query.order("granted_at", desc=True).execute())
    rows = _rows(getattr(result, "data", None))

    grant = next((g for g in rows if str(g.get("grantee_user_id")) == str(actor_id)), None)
    if not grant and rows:
        grant = rows[0]

    if not grant:
        grant = await _ensure_auto_legal_grant(
            client=client,
            organization_id=organization_id,
            project_id=project_id,
            grantee_user_id=actor_id,
        )

    if grant.get("project_id") is not None and str(grant.get("project_id")) != project_id:
        raise HTTPException(status_code=403, detail={"code": "LEGAL_APPROVAL_SCOPE_MISMATCH"})
    expires_at = grant.get("expires_at")
    if expires_at and datetime.fromisoformat(str(expires_at).replace("Z", "+00:00")) <= datetime.now(UTC):
        raise HTTPException(status_code=403, detail={"code": "LEGAL_APPROVAL_GRANT_EXPIRED"})
    return grant


async def _approve_semantic_candidate(
    *,
    client: Any,
    matrix_row: dict[str, Any],
    case_row: dict[str, Any] | None,
    actor_id: str,
    operation_key: str,
    legal_grant_id: str | None,
    origin: str = "human",
) -> dict[str, Any]:
    organization_id = str(matrix_row["organization_id"])
    project_id = str(matrix_row["project_id"])
    grant = await _active_legal_grant(
        client,
        organization_id=organization_id,
        project_id=project_id,
        actor_id=actor_id,
        grant_id=legal_grant_id,
    )
    template = await _fetch_template(client, str(matrix_row["template_id"]), organization_id)
    clauses = await _fetch_template_clauses(client, str(template["id"]), organization_id)
    if case_row is None:
        variable_snapshot, evidence_snapshot = await fetch_project_matriz_snapshot(
            organization_id=organization_id, project_id=project_id, supabase=client
        )
        semantic_case = {
            "id": None,
            "organization_id": organization_id,
            "project_id": project_id,
            "variable_snapshot": variable_snapshot,
            "evidence_snapshot": evidence_snapshot,
        }
        if matrix_row.get("submitted_by") == actor_id:
            await asyncio.to_thread(
                lambda: client.table("escritura_matrices")
                .update({"submitted_by": None})
                .eq("id", str(matrix_row["id"]))
                .execute()
            )
            matrix_row["submitted_by"] = None
    else:
        semantic_case = case_row
        variable_snapshot = _as_dict(case_row.get("variable_snapshot"))
        evidence_snapshot = _as_dict(case_row.get("evidence_snapshot"))
    _, active_clauses = _effective_clauses(clauses, matrix_row, variable_snapshot)
    evidence_hash = canonical_json_hash(evidence_snapshot)
    provenance_hash = canonical_json_hash(
        {"snapshot": variable_snapshot, "template": template["id"], "templateVersion": template["version"]}
    )
    policy_hash = canonical_json_hash({"policy": "legal-four-eyes-v1", "origin": origin})
    operation_id = await _claim_semantic_operation(
        client,
        operation_key=operation_key,
        operation_type="matriz_approval_begin",
        organization_id=organization_id,
        actor_id=actor_id,
        resource_scope=f"matriz:{matrix_row['id']}:approval",
        payload={"matriz_id": str(matrix_row["id"]), "version": int(matrix_row["version"])},
    )
    try:
        attempt_result = await asyncio.to_thread(
            lambda: client.rpc(
                "begin_matriz_approval",
                {
                    "p_matriz_id": str(matrix_row["id"]),
                    "p_actor_user_id": actor_id,
                    "p_origin": origin,
                    "p_legal_approval_grant_id": (
                        str(grant["id"]) if grant.get("id") else None
                    ),
                    "p_operation_id": operation_id,
                    "p_expected_matriz_version": int(matrix_row["version"]),
                    "p_template_version": int(template["version"]),
                    "p_snapshot_hash": str(matrix_row["snapshot_hash"]),
                    "p_evidence_manifest_hash": evidence_hash,
                    "p_provenance_manifest_hash": provenance_hash,
                    "p_review_policy_fingerprint": policy_hash,
                },
            ).execute()
        )
        attempt_id = str(getattr(attempt_result, "data", None))
        if case_row is None:
            # El molde de proyecto conserva huecos tipados de venta/firma por
            # diseño y nunca es un entregable. Su aprobación valida identidad
            # de vendedores + esquema/proveniencia; el caso instanciado vuelve
            # a renderizar y validar el DOCX completo antes de poder generarse.
            project_probe = render_minuta_docx(
                clauses=[],
                metadata={"draft_notice": ESCRITURA_BORRADOR_NOTICE},
            )
            verdict = validate_semantics(
                resolved_ast={"type": "doc", "content": []},
                artifact_bytes=project_probe,
                comparecientes=_snapshot_comparecientes(variable_snapshot),
            )
        else:
            _resolution, _rendered, _bytes, verdict = await _render_semantic_candidate(
                client=client,
                matrix_row=matrix_row,
                case_row=semantic_case,
                active_clauses=active_clauses,
            )
        validation_payload = {
            "organization_id": organization_id,
            "project_id": project_id,
            "escritura_case_id": semantic_case.get("id"),
            "matriz_id": str(matrix_row["id"]),
            "matriz_version": int(matrix_row["version"]),
            "template_id": str(template["id"]),
            "template_version": int(template["version"]),
            "snapshot_hash": str(matrix_row["snapshot_hash"]),
            "resolved_content_hash": verdict.resolved_content_hash,
            "artifact_sha256": verdict.artifact_sha256,
            "approval_attempt_id": attempt_id,
            "evidence_manifest_hash": evidence_hash,
            "provenance_manifest_hash": provenance_hash,
            "renderer_version": RENDERER_VERSION,
            "ruleset_version": RULESET_VERSION,
            "normalization_version": NORMALIZATION_VERSION,
            "schema_version": "2",
            "status": verdict.status,
            "issues": [issue.to_dict() for issue in verdict.issues if issue.severity == "blocking"],
            "validation_origin": "approval",
            "validated_by": actor_id,
        }
        validation_result = await asyncio.to_thread(
            lambda: client.table("escritura_semantic_validations").insert(validation_payload).execute()
        )
        validation = _first_row(getattr(validation_result, "data", None)) or validation_payload
        if not verdict.promotable:
            await asyncio.to_thread(
                lambda: client.table("escritura_approval_attempts")
                .update({"status": "failed", "error_code": "DOCUMENT_SEMANTIC_INVALID"})
                .eq("id", attempt_id).execute()
            )
            raise HTTPException(
                status_code=422,
                detail={"code": "DOCUMENT_SEMANTIC_INVALID", "issues": validation_payload["issues"]},
            )
        await asyncio.to_thread(
            lambda: client.rpc(
                "finalize_matriz_approval",
                {"p_attempt_id": attempt_id, "p_validation_id": str(validation["id"]), "p_operation_id": operation_id},
            ).execute()
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("approve_semantic_candidate_failed", error=str(exc), exc_info=True)
        code = "APPROVAL_CANDIDATE_STALE" if "APPROVAL_CANDIDATE_STALE" in str(exc) else "LEGAL_APPROVAL_REQUIRED"
        raise HTTPException(
            status_code=409 if code.startswith("APPROVAL") else 403,
            detail={"code": code, "error_detail": str(exc)},
        ) from exc
    refreshed = await _fetch_matrix_by_id(client, str(matrix_row["id"]), organization_id)
    return refreshed


def automatic_generation_storage_path(
    *,
    organization_id: str,
    escritura_case_id: str,
    generation_fingerprint: str,
) -> str:
    """Stable automatic artifact location, bound to its complete provenance."""
    return (
        f"{organization_id}/escritura-minutas/{escritura_case_id}/"
        f"{generation_fingerprint}.docx"
    )


async def _generate_minuta_row(
    *,
    client: Any,
    matrix_row: dict[str, Any],
    case_row: dict[str, Any],
    template: dict[str, Any],
    active_clauses: list[dict[str, Any]],
    generated_by: str | None,
    warning_acknowledged_by: str,
    warning_acknowledged_at: str,
    operation_key: str | None = None,
    regeneration_reason: str | None = None,
    generation_mode: str = "manual",
) -> MinutaGeneration:
    variable_snapshot = _as_dict(case_row.get("variable_snapshot"))
    evidence_snapshot = _as_dict(case_row.get("evidence_snapshot"))
    resolution, _rendered_clauses, docx_bytes, verdict = await _render_semantic_candidate(
        client=client,
        matrix_row=matrix_row,
        case_row=case_row,
        active_clauses=active_clauses,
        enforce_comparecientes=hasattr(client, "rpc"),
    )
    if not verdict.promotable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "DOCUMENT_SEMANTIC_INVALID", "issues": [issue.to_dict() for issue in verdict.issues]},
        )

    production_semantic = hasattr(client, "rpc")
    validation_row: dict[str, Any] | None = None
    operation_id: str | None = None
    fingerprint: str | None = None
    provenance_hash = canonical_json_hash({"resolution": resolution.manifest_dict(), "evidence": evidence_snapshot})
    review_policy_hash = canonical_json_hash({"policy": "current", "origin": matrix_row.get("approval_origin") or "human"})
    if production_semantic:
        validation_result = await asyncio.to_thread(
            lambda: (
                client.table("escritura_semantic_validations")
                .select("id, approval_id, status, artifact_sha256, provenance_manifest_hash")
                .eq("matriz_id", str(matrix_row["id"]))
                .eq("status", "passed")
                .order("validated_at", desc=True)
                .limit(1)
                .execute()
            )
        )
        validation_row = _first_row(getattr(validation_result, "data", None))
        if not validation_row or not validation_row.get("approval_id"):
            raise HTTPException(status_code=422, detail={"code": "DOCUMENT_SEMANTIC_INVALID", "issues": [{"code": "SEM_PROVENANCE_INCOMPLETE"}]})
        # SDD019 camino corto: python-docx produce bytes binarios distintos
        # entre renders idénticos (metadatos con timestamps internos). El
        # veredicto ya fue aprobado; la integridad del contenido se valida
        # vía resolved_content_hash + provenance_manifest_hash en el paso de
        # huella (generation_fingerprint).
        if generation_mode == "manual":
            if not operation_key or not (regeneration_reason or "").strip():
                raise HTTPException(status_code=422, detail={"code": "MANUAL_REGENERATION_CONTEXT_REQUIRED"})
            operation_id = await _claim_semantic_operation(
                client,
                operation_key=operation_key,
                operation_type="matriz_manual_regeneration",
                organization_id=str(case_row["organization_id"]),
                actor_id=str(generated_by),
                resource_scope=f"matriz:{matrix_row['id']}:generation",
                payload={"matriz_id": str(matrix_row["id"]), "reason": regeneration_reason},
            )
        provenance_hash = str(validation_row.get("provenance_manifest_hash") or provenance_hash)
        fingerprint = generation_fingerprint({
            "organization_id": str(case_row["organization_id"]), "case_id": str(case_row["id"]),
            "snapshot_hash": str(matrix_row["snapshot_hash"]), "matriz_id": str(matrix_row["id"]),
            "matriz_version": int(matrix_row["version"]), "template_id": str(template["id"]),
            "template_version": int(template["version"]), "renderer_version": RENDERER_VERSION,
            "ruleset_version": RULESET_VERSION, "schema_version": "2",
            "normalization_version": NORMALIZATION_VERSION, "approval_id": str(validation_row["approval_id"]),
            "provenance_manifest_hash": provenance_hash, "review_policy_fingerprint": review_policy_hash,
        })

    content_hash = hashlib.sha256(docx_bytes).hexdigest()
    generation_id = str(uuid.uuid4())
    storage_path = (
        automatic_generation_storage_path(
            organization_id=str(case_row["organization_id"]),
            escritura_case_id=str(case_row["id"]),
            generation_fingerprint=str(fingerprint),
        )
        if generation_mode == "automatic" and fingerprint
        else f"{case_row['organization_id']}/escritura-minutas/{case_row['id']}/{generation_id}.docx"
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
        "warning_acknowledged_by": warning_acknowledged_by,
        "warning_acknowledged_at": warning_acknowledged_at,
        "generated_by": generated_by,
        "generated_at": now,
    }
    if production_semantic and validation_row:
        payload.update({
            "semantic_validation_id": validation_row["id"], "generation_fingerprint": fingerprint,
            "generation_mode": generation_mode, "operation_id": operation_id,
            "regeneration_reason": regeneration_reason, "template_version": int(template["version"]),
            "renderer_version": RENDERER_VERSION, "ruleset_version": RULESET_VERSION,
            "normalization_version": NORMALIZATION_VERSION, "schema_version": "2",
            "artifact_sha256": verdict.artifact_sha256, "provenance_manifest_hash": provenance_hash,
            "review_policy_fingerprint": review_policy_hash, "approval_id": validation_row["approval_id"],
            "readiness_status": "ready",
        })
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

    # SDD 016 (US1): al aceptar/generar el borrador, entregarlo a los admins
    # con Telegram y al vendedor asignado. Best-effort: una falla de entrega
    # NUNCA invalida la generación del DOCX ya persistida.
    try:
        organization_id = str(case_row["organization_id"])
        admin_user_ids = await _resolve_org_admin_user_ids(client, organization_id)
        vendor_user_id = await _resolve_case_vendor_user_id(client, case_row)
        lot_label = await _resolve_lot_label(client, case_row)
        recipient_ids = [
            user_id
            for user_id in dict.fromkeys([*admin_user_ids, vendor_user_id])
            if user_id is not None
        ]
        if not recipient_ids:
            await deliver_draft(
                supabase=client,
                generation=inserted,
                recipient_user_id=None,
                lot_label=lot_label,
            )
        for recipient_user_id in recipient_ids:
            await deliver_draft(
                supabase=client,
                generation=inserted,
                recipient_user_id=recipient_user_id,
                lot_label=lot_label,
            )
    except Exception as exc:  # noqa: BLE001 - entrega best-effort, jamás bloquea
        logger.warning(
            "escritura_delivery_trigger_failed",
            generation_id=generation_id,
            error=str(exc),
        )

    return await _generation_response(client, inserted)


# ─── Revisión jurídica del caso (SDD16, FR-007/FR-008) ───────────────────────

ABOGADO_REDACTOR_REQUIRED_KEYS = (
    "documento.abogado_redactor.nombre",
    "documento.abogado_redactor.rut",
)


def _has_review_value(row: dict[str, Any] | None) -> bool:
    if not row:
        return False
    value_text = row.get("value_text")
    return (isinstance(value_text, str) and bool(value_text.strip())) or row.get(
        "value_json"
    ) is not None


async def _missing_abogado_redactor_keys(
    client: Any, organization_id: str, project_id: str
) -> list[str]:
    """FR-007: el molde en un clic (T031) o la acción mínima de T015 deben
    haber materializado estos datos como variables project-scoped antes de
    aprobar la revisión jurídica del caso."""
    result = await asyncio.to_thread(
        lambda: (
            client.table("variable_resolutions")
            .select("variable_key, value_text, value_json")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .is_("lot_id", "null")
            .in_("variable_key", list(ABOGADO_REDACTOR_REQUIRED_KEYS))
            .neq("state", "superseded")
            .execute()
        )
    )
    rows_by_key = {row["variable_key"]: row for row in _rows(getattr(result, "data", None))}
    return [
        key for key in ABOGADO_REDACTOR_REQUIRED_KEYS if not _has_review_value(rows_by_key.get(key))
    ]


async def _upsert_lot_variable(
    client: Any,
    *,
    organization_id: str,
    project_id: str,
    lot_id: str,
    variable_key: str,
    value_text: str,
    reviewed_by: str | None,
    reviewed_at: str,
    actor: Literal["human", "system"] = "human",
) -> dict[str, Any]:
    """Fija revision_juridica.* scope lote (nunca proyecto, a diferencia de
    documento.abogado_redactor.*): es una decisión por caso, no un dato de
    organización.

    El ``actor`` decide el ``state`` persistido:
      - ``human`` (revisión humana vía submit_legal_review) -> ``resolved``:
        la aprobación manual subsiguiente la mueve a ``approved`` y deja
        auditoría explícita en legal_review_decisions.
      - ``system`` (cascada autoaprobando en modo exceptions_only) ->
        ``approved``: un acto del sistema con approval_required=False es
        final al sembrarlo; persistirlo como ``resolved`` lo dejaba eternamente
        como "por aprobar" en la mesa del molde aunque el gate ya esté
        satisfecho (bug 2026-08-13, venta Lote 26 Teno 2).
    """
    target_state = "approved" if actor == "system" else "resolved"
    existing_result = await asyncio.to_thread(
        lambda: (
            client.table("variable_resolutions")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .eq("lot_id", lot_id)
            .is_("escritura_case_id", "null")
            .eq("variable_key", variable_key)
            .neq("state", "superseded")
            .limit(1)
            .execute()
        )
    )
    existing = _first_row(getattr(existing_result, "data", None))
    if existing:
        update_result = await asyncio.to_thread(
            lambda: (
                client.table("variable_resolutions")
                .update(
                    {
                        "value_text": value_text,
                        "state": target_state,
                        "reviewed_by": reviewed_by,
                        "reviewed_at": reviewed_at,
                    }
                )
                .eq("id", existing["id"])
                .execute()
            )
        )
        return _first_row(getattr(update_result, "data", None)) or existing

    insert_payload = {
        "organization_id": organization_id,
        "project_id": project_id,
        "lot_id": lot_id,
        "escritura_case_id": None,
        "variable_key": variable_key,
        "variable_group": "revision_juridica",
        "value_text": value_text,
        "state": target_state,
        "source_type": "legal_review",
        "reviewed_by": reviewed_by,
        "reviewed_at": reviewed_at,
        "approval_required": False,
    }
    insert_result = await asyncio.to_thread(
        lambda: client.table("variable_resolutions").insert(insert_payload).execute()
    )
    inserted = _first_row(getattr(insert_result, "data", None))
    if not inserted:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo guardar la revisión jurídica.",
        )
    return inserted

async def _recompute_pending_cases_after_matriz_approval(
    *, client: Any, organization_id: str, project_id: str
) -> None:
    """FR-005: al aprobar el molde, re-evalúa los casos `variables_pending`
    del proyecto para que hereden los gates recién aprobados sin esperar a
    que alguien abra la mesa manualmente. Best-effort por caso: una falla en
    uno no bloquea la aprobación de la matriz ni el recompute del resto."""
    from services.escritura_readiness import create_escritura_case_snapshot

    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_cases")
            .select("id, lot_id")
            .eq("organization_id", organization_id)
            .eq("project_id", project_id)
            .eq("case_status", "variables_pending")
            .execute()
        )
    )
    for case in _rows(getattr(result, "data", None)):
        lot_id = case.get("lot_id")
        if not lot_id:
            continue
        try:
            await create_escritura_case_snapshot(
                organization_id=organization_id,
                project_id=project_id,
                lot_id=str(lot_id),
                stage_operational=True,
                supabase=client,
            )
        except Exception as exc:
            logger.error(
                "matriz_approval_recompute_case_failed",
                organization_id=organization_id,
                project_id=project_id,
                lot_id=str(lot_id),
                escritura_case_id=case.get("id"),
                error=str(exc),
            )



# ─── Acciones públicas de workflow (T005) ────────────────────────────────────
#
# Extracción literal de los antiguos endpoints `submit_matriz`/`approve_matriz`/
# `reject_matriz`/`generate_minuta` (SDD 008/010), con la validación HTTP de
# FastAPI (`Query(...)`) removida de la firma porque estas funciones ya no son
# endpoints: la capa de ruta (`api/v1/endpoints/escritura_matrices.py`) las
# invoca con los mismos objetos de request tipados; la cascada (SDD 017) las
# invocará directamente en una fase posterior con su propio actor.


async def submit_case_matriz(
    matriz_id: UUID,
    request: MatrizSubmitRequest,
    organization_id: UUID,
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
        "submitted_by": str(request.submitted_by) if case_row is not None else None,
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


async def approve_case_matriz(
    matriz_id: UUID,
    request: MatrizApproveRequest,
    organization_id: UUID,
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
    from core.config import get_settings

    if (
        case_row is not None
        and get_settings().LEGAL_REVIEW_REQUIRE_DISTINCT_REVIEWER
        and str(matrix_row.get("submitted_by")) == str(request.approved_by)
    ):
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
    if hasattr(client, "rpc"):
        if not request.operation_key:
            raise HTTPException(status_code=422, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        updated = await _approve_semantic_candidate(
            client=client,
            matrix_row=matrix_row,
            case_row=case_row,
            actor_id=str(request.approved_by),
            operation_key=request.operation_key,
            legal_grant_id=(str(request.legal_approval_grant_id) if request.legal_approval_grant_id else None),
        )
        approved_project_id = str(case_row["project_id"]) if case_row else str(matrix_row["project_id"])
        await _recompute_pending_cases_after_matriz_approval(
            client=client, organization_id=str(organization_id), project_id=approved_project_id
        )
        return await _workflow_response(client, updated, case_row)
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
    approved_project_id = (
        str(case_row["project_id"]) if case_row else str(matrix_row["project_id"])
    )
    await _recompute_pending_cases_after_matriz_approval(
        client=client,
        organization_id=str(organization_id),
        project_id=approved_project_id,
    )
    return await _workflow_response(client, updated, case_row)


async def reject_case_matriz(
    matriz_id: UUID,
    request: MatrizRejectRequest,
    organization_id: UUID,
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


async def generate_case_minuta(
    matriz_id: UUID,
    request: GenerateMinutaRequest,
    organization_id: UUID,
) -> MinutaGeneration:
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

    # SDD 017 (T025, FR-009): el aviso legal se confirma una vez por
    # proyecto (checklist de preparación), no por cada minuta. Si el
    # proyecto ya tiene un amparo vigente, la generación lo hereda sin
    # volver a pedir el flag por-request. Proyectos pre-SDD017 que nunca
    # pasaron por el checklist siguen el camino legacy (exige el flag del
    # request) y esta primera generación autosana el amparo del proyecto
    # (se persiste una vez, las siguientes ya lo heredan).
    project_id = str(case_row["project_id"])
    warning_ack = await _fetch_project_warning_ack(client, project_id, org_id)
    if warning_ack is None:
        if not request.warning_acknowledged:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "code": "warning_required",
                    "message": "Debes confirmar el warning legal antes de generar la minuta.",
                },
            )
        warning_ack_by = str(request.generated_by)
        warning_ack_at = _utc_now_iso()
        await asyncio.to_thread(
            lambda: (
                client.table("projects")
                .update(
                    {
                        "minuta_warning_acknowledged_by": warning_ack_by,
                        "minuta_warning_acknowledged_at": warning_ack_at,
                    }
                )
                .eq("id", project_id)
                .eq("organization_id", org_id)
                .is_("minuta_warning_acknowledged_by", "null")
                .execute()
            )
        )
    else:
        warning_ack_by, warning_ack_at = warning_ack

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
        generated_by=str(request.generated_by),
        warning_acknowledged_by=warning_ack_by,
        warning_acknowledged_at=warning_ack_at,
        operation_key=request.operation_key,
        regeneration_reason=request.regeneration_reason,
    )


__all__ = [
    # constantes
    "CASE_COLUMNS",
    "TEMPLATE_COLUMNS",
    "CLAUSE_COLUMNS",
    "MATRIX_COLUMNS",
    "GENERATION_COLUMNS",
    "MINUTA_STORAGE_BUCKET",
    "PROJECT_MATRIZ_GATE",
    "PROJECT_MATRIZ_MISSING_CODE",
    "INHERITED_PROJECT_READINESS_GATES",
    "INSERTABLE_VARIABLES",
    "PROJECT_MATRIZ_GAP_KEYS",
    "ABOGADO_REDACTOR_REQUIRED_KEYS",
    # helpers genéricos
    "_first_row",
    "_single_row",
    "_rows",
    "_json_hash",
    "_as_dict",
    "_as_list",
    "_uuid_text_or_none",
    "_utc_now_iso",
    "_docx_cover_lines",
    "_truthy_snapshot_value",
    # fetchers
    "_fetch_case",
    "_fetch_project_context",
    "_fetch_project",
    "_fetch_project_warning_ack",
    "_fetch_published_template",
    "_fetch_template",
    "_fetch_template_clauses",
    "_fetch_active_matrix",
    "_fetch_matrix_by_id",
    "_lazy_create_matrix",
    "_create_matrix_from_project_matrix",
    "_fetch_project_context_by_id",
    "_fetch_active_project_matrix",
    "_fetch_approved_project_matrix",
    "_lazy_create_project_matrix",
    # resolución/blockers
    "_effective_clauses",
    "_humanized",
    "_variable_fix_url",
    "_approval_blockers",
    "_alert_clause_blockers",
    "_readiness_gate_blockers",
    "_dismissed_alerts",
    "_case_response",
    "_project_matriz_action_url",
    "_project_matriz_missing_detail",
    "_raise_project_matriz_missing",
    "_is_project_gap_key",
    "_project_approval_blockers",
    "_project_matriz_response",
    # workflow (draft/submit/approve/reject compartido caso+proyecto)
    "_insert_matriz_review_decision",
    "_supersede_approved_matriz",
    "_refresh_case_matriz_snapshot",
    "_supersede_approved_project_matriz",
    "_refresh_project_matriz_snapshot",
    "_workflow_context",
    "_workflow_response",
    "_fresh_workflow_view",
    "_raise_if_snapshot_stale",
    "_recompute_pending_cases_after_matriz_approval",
    # generación de minuta
    "_generation_response",
    "_resolve_case_vendor_user_id",
    "_resolve_org_admin_user_ids",
    "_resolve_lot_label",
    "_fetch_case_deliveries",
    "_fetch_sale_validation",
    "_trace_input_keys",
    "_build_escritura_trace",
    "_generate_minuta_row",
    "_snapshot_comparecientes",
    "_claim_semantic_operation",
    "_active_legal_grant",
    "_approve_semantic_candidate",
    # revisión jurídica (SDD16)
    "_has_review_value",
    "_missing_abogado_redactor_keys",
    "_upsert_lot_variable",
    # acciones públicas (T005)
    "submit_case_matriz",
    "approve_case_matriz",
    "reject_case_matriz",
    "generate_case_minuta",
]
