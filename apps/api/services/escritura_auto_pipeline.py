"""SDD 017 (T010): cascada de aprobación por excepción.

Al validarse una venta (o al aprobarse la revisión jurídica, o al reintentar
un caso en excepción), esta cascada intenta llevar el caso de escritura de
punta a punta SIN actos humanos: evalúa pendientes reales → (según la
política de revisión de la organización) aprueba la revisión jurídica y la
matriz a nombre del sistema → genera la minuta → la entrega. Si algo falta de
verdad, el caso queda en excepción con causas accionables y se notifica al
admin — nunca se genera un documento parcial.

No toca el motor (resolutor, gates, puente, renderer, entrega): orquesta
piezas ya probadas de `escritura_case_workflow.py`. Cada paso es idempotente
(re-verifica el estado real antes de actuar), así que un reintento sobre un
caso ya `completed` no duplica nada.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException

from core.logger import get_logger
from services.escritura_case_workflow import (
    _alert_clause_blockers,
    _approve_semantic_candidate,
    _as_dict,
    _effective_clauses,
    _fetch_active_matrix,
    _fetch_case,
    _fetch_matrix_by_id,
    _fetch_project_warning_ack,
    _fetch_template,
    _fetch_template_clauses,
    _first_row,
    _fresh_workflow_view,
    _generate_minuta_row,
    _insert_matriz_review_decision,
    _lazy_create_matrix,
    _missing_abogado_redactor_keys,
    _readiness_gate_blockers,
    _resolve_lot_label,
    _resolve_org_admin_user_ids,
    _upsert_lot_variable,
    _utc_now_iso,
    INHERITED_PROJECT_READINESS_GATES,
)
from services.escritura_delivery import _recipient_chat_id
from services.escritura_readiness import create_escritura_case_snapshot

logger = get_logger(__name__)

CASCADE_TRIGGERS = ("sale_validated", "review_approved", "manual_retry", "workflow_outbox")
CASCADE_OUTCOMES = ("completed", "exception", "awaiting_review")
_CASE_CASCADE_LOCKS: dict[tuple[str, str], asyncio.Lock] = {}


class CascadeError(Exception):
    """Error de la cascada que no debe tratarse como excepción del caso
    (p. ej. trigger desconocido, caso fuera de tenant): el llamador decide
    cómo reaccionar, no se registra como una corrida."""


class CaseOutdatedError(CascadeError):
    """FR-011: el caso ya tiene una minuta entregada y sus datos cambiaron
    después — la cascada NUNCA regenera sola sobre eso. Regenerar es una
    acción humana explícita; el retry responde 409 sin registrar corrida."""


@dataclass(frozen=True)
class CascadeRunResult:
    run_id: str | None
    outcome: str  # completed | exception | awaiting_review
    causes: list[dict[str, Any]] = field(default_factory=list)
    steps: list[dict[str, Any]] = field(default_factory=list)
    generation_id: str | None = None
    created_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "outcome": self.outcome,
            "causes": self.causes,
            "steps": self.steps,
            "generation_id": self.generation_id,
            "created_at": self.created_at,
        }


def _is_review_checkpoint_blocker(blocker: dict[str, Any]) -> bool:
    """Espejo de `isLegalReviewActionOnlyBlocker` (mesa-escritura.tsx, SDD16):
    el gate `legal_review_ready` bloqueado SOLO por la acción de revisión
    misma (`revision_juridica.estado`) no es un dato faltante — es el
    checkpoint de política que decide US2, no una excepción real."""
    return (
        blocker.get("kind") == "readiness_gate"
        and blocker.get("gate") == "legal_review_ready"
        and blocker.get("cause") == "revision_juridica.estado"
    )


def _is_relaxed_readiness_blocker(blocker: dict[str, Any], relaxed: bool) -> bool:
    """Camino corto SDD019: cuando la org relaja readiness, los gates
    heredados del proyecto (title_verified/sii_verified/sag_plano_verified)
    dejan de bloquear la generación y quedan como advertencia trazable."""
    if not relaxed:
        return False
    return (
        blocker.get("kind") == "readiness_gate"
        and blocker.get("gate") in INHERITED_PROJECT_READINESS_GATES
    )


def _relaxed_token_keys(case_row: dict[str, Any], relaxed: bool) -> set[str]:
    """Devuelve las claves de variable que deben relajarse cuando
    los gates heredados están bloqueados pero la org tiene el flag activo."""
    if not relaxed:
        return set()
    readiness_gates = _as_dict(case_row.get("readiness_gates"))
    keys: set[str] = set()
    for gate_key in INHERITED_PROJECT_READINESS_GATES:
        gate = readiness_gates.get(gate_key)
        if isinstance(gate, dict) and gate.get("status") == "blocked":
            for var in gate.get("blocking_variables") or []:
                keys.add(str(var))
    return keys


def _is_relaxed_token_missing(
    blocker: dict[str, Any], relaxed_keys: set[str]
) -> bool:
    """Un `token_missing` cuya clave proviene de un gate heredado relajado
    no debe bloquear la generación."""
    return (
        blocker.get("kind") == "token_missing"
        and str(blocker.get("key") or "") in relaxed_keys
    )


def _inject_relaxed_placeholders(
    case_row: dict[str, Any], relaxed_keys: set[str]
) -> None:
    """Inyecta placeholders en el variable_snapshot para tokens de gates
    relajados, de modo que el resolver de la matriz no los reporte como
    missing y la validación semántica no los rechace.

    El DOCX resultante incluirá el valor "[pendiente]" como marcador visible.
    """
    snapshot = _as_dict(case_row.get("variable_snapshot"))
    injected = 0
    for key in relaxed_keys:
        existing = snapshot.get(key)
        if isinstance(existing, dict):
            if existing.get("state") in ("missing", "unresolved", None):
                existing["state"] = "resolved"
                existing.setdefault("value_text", "(pendiente)")
                existing.setdefault("value_json", None)
                existing["source_type"] = "relaxed"
                existing["confidence"] = 0.0
                existing["variable_key"] = key
                injected += 1
                continue
            continue
        snapshot[key] = {
            "variable_key": key,
            "state": "resolved",
            "value_text": "(pendiente)",
            "value_json": None,
            "source_type": "relaxed",
            "confidence": 0.0,
        }
        injected += 1
    if injected:
        case_row["variable_snapshot"] = snapshot


async def _fetch_org_review_policy(client: Any, organization_id: str) -> str:
    result = await asyncio.to_thread(
        lambda: (
            client.table("organizations")
            .select("escritura_review_policy")
            .eq("id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    row = _first_row(getattr(result, "data", None))
    policy = row.get("escritura_review_policy") if row else None
    return str(policy) if policy else "every_sale"


async def _org_relaxed_readiness(client: Any, organization_id: str) -> bool:
    """Camino corto SDD019: la org puede relajar los gates heredados del
    proyecto (title_verified/sii_verified/sag_plano_verified) para generar
    escrituras con los datos disponibles. Ausencia del flag o error = estricto."""
    try:
        result = await asyncio.to_thread(
            lambda: (
                client.table("organizations")
                .select("escritura_relaxed_readiness")
                .eq("id", organization_id)
                .limit(1)
                .execute()
            )
        )
    except Exception:
        return False
    row = _first_row(getattr(result, "data", None))
    return bool(row.get("escritura_relaxed_readiness")) if row else False


async def _fetch_latest_rejection_reason(
    client: Any, escritura_case_id: str, organization_id: str
) -> str | None:
    result = await asyncio.to_thread(
        lambda: (
            client.table("legal_review_decisions")
            .select("reason, decided_at")
            .eq("escritura_case_id", escritura_case_id)
            .eq("organization_id", organization_id)
            .eq("decision_type", "reject_case")
            .order("decided_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    row = _first_row(getattr(result, "data", None))
    return row.get("reason") if row else None


async def _find_existing_generation(
    client: Any, *, escritura_case_id: str, organization_id: str, snapshot_hash: str
) -> dict[str, Any] | None:
    """Idempotencia D6: no regenerar si ya existe una minuta para este
    snapshot exacto del caso."""
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_minuta_generations")
            .select("id, storage_path")
            .eq("escritura_case_id", escritura_case_id)
            .eq("organization_id", organization_id)
            .eq("snapshot_hash", snapshot_hash)
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    return _first_row(getattr(result, "data", None))


async def _fetch_latest_case_generation(
    client: Any, *, escritura_case_id: str, organization_id: str
) -> dict[str, Any] | None:
    """Última generación del caso sin filtrar por hash: si existe y su hash no
    coincide con el snapshot vigente, el documento entregado quedó
    desactualizado (FR-011)."""
    result = await asyncio.to_thread(
        lambda: (
            client.table("escritura_minuta_generations")
            .select("id, snapshot_hash")
            .eq("escritura_case_id", escritura_case_id)
            .eq("organization_id", organization_id)
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    return _first_row(getattr(result, "data", None))


async def _insert_cascade_run(
    client: Any,
    *,
    organization_id: str,
    escritura_case_id: str,
    trigger: str,
    outcome: str,
    causes: list[dict[str, Any]],
    steps: list[dict[str, Any]],
) -> dict[str, Any]:
    payload = {
        "organization_id": organization_id,
        "escritura_case_id": escritura_case_id,
        "trigger": trigger,
        "outcome": outcome,
        "causes": causes,
        "steps": steps,
    }
    result = await asyncio.to_thread(
        lambda: client.table("escritura_cascade_runs").insert(payload).execute()
    )
    return _first_row(getattr(result, "data", None)) or payload


async def _notify_case_exception(
    client: Any, *, case_row: dict[str, Any], causes: list[dict[str, Any]]
) -> None:
    """Best-effort (D7): aviso Telegram a los admins con Telegram vinculado
    cuando la cascada queda en excepción. Nunca lanza — una falla de
    notificación no debe volver a marcar la corrida como fallida."""
    try:
        from integrations.telegram_client import get_telegram_client_for_org

        organization_id = str(case_row["organization_id"])
        admin_ids = await _resolve_org_admin_user_ids(client, organization_id)
        if not admin_ids:
            return
        telegram_client = await get_telegram_client_for_org(organization_id)
        if telegram_client is None:
            return
        lot_label = await _resolve_lot_label(client, case_row)
        titles = [
            str(cause.get("title") or cause.get("message") or "Dato pendiente")
            for cause in causes[:3]
        ]
        text = f"⚠️ Escritura del {lot_label} necesita tu atención\n" + "\n".join(
            f"• {title}" for title in titles
        )
        for admin_id in admin_ids:
            chat_id = await _recipient_chat_id(client, admin_id)
            if chat_id:
                await telegram_client.send_text(chat_id, text)
    except Exception as exc:  # noqa: BLE001 - notificación best-effort
        logger.warning(
            "escritura_cascade_exception_notify_failed",
            escritura_case_id=str(case_row.get("id")),
            error=str(exc),
        )


async def _system_submit_matriz(
    client: Any, matrix_row: dict[str, Any], case_row: dict[str, Any], *, trigger: str
) -> dict[str, Any]:
    now = _utc_now_iso()
    payload = {
        "status": "legal_review_pending",
        "submitted_by": None,
        "submitted_at": now,
        "approved_by": None,
        "approved_at": None,
        "version": int(matrix_row["version"]) + 1,
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
    updated = _first_row(getattr(result, "data", None)) or {**matrix_row, **payload}
    await _insert_matriz_review_decision(
        client=client,
        matrix_row=updated,
        case_row=case_row,
        decision_type="matriz_submitted",
        decision_status="needs_changes",
        decided_by=None,
        reason="cascade_auto_submit",
        origin="system",
        trigger=trigger,
    )
    return updated


async def _system_approve_matriz(
    client: Any,
    matrix_row: dict[str, Any],
    case_row: dict[str, Any],
    *,
    trigger: str,
    inherited_from_matriz_id: str | None,
    inherited_matriz_version: int | None,
) -> dict[str, Any]:
    # B (bug 3, 2026-08-13): la bifurcación `hasattr(client, "rpc")` dejaba dos
    # caminos — el real (con grant + RPC begin/finalize_matriz_approval + validación
    # semántica del DOCX) y un fallback de tests que sólo UPDATEaba status='approved'
    # sin pasar por ninguna verificación semántica. Los tests que usan fakes sin
    # `.rpc` validaban un camino que NUNCA se ejecuta en producción, por lo que las
    # fallas semánticas pasaban desapercibidas en suite y aparecían como matriz
    # status='draft' con cascade outcome='completed' en vivo (Lote 26 Teno 2).
    # Ahora el sistema siempre exige grant + _approve_semantic_candidate; si no hay
    # grant, levanta LEGAL_APPROVAL_REQUIRED (behavior parejo tests↔prod).
    grant_result = await asyncio.to_thread(
        lambda: (
            client.table("legal_approval_grants")
            .select("id, grantee_user_id")
            .eq("organization_id", str(matrix_row["organization_id"]))
            .eq("active", True)
            .order("granted_at", desc=True)
            .limit(1)
            .execute()
        )
    )
    grant = _first_row(getattr(grant_result, "data", None))
    if not grant:
        raise RuntimeError("LEGAL_APPROVAL_REQUIRED")
    updated = await _approve_semantic_candidate(
        client=client,
        matrix_row=matrix_row,
        case_row=case_row,
        actor_id=str(grant["grantee_user_id"]),
        operation_key=f"system:{matrix_row['id']}:{matrix_row['version']}:{trigger}",
        legal_grant_id=str(grant["id"]),
        origin="system",
    )
    # `_approve_semantic_candidate` mueve la matriz a 'approved' vía RPC, pero
    # no inserta la decisión auditada en legal_review_decisions — la insertamos
    # aquí, preservando la auditoría 'matriz_approved'/'origin=system' que tenía
    # el camino viejo. Best-effort: una falla de auditoría no revierte la
    # aprobación efectiva (igual que en submit_case_matriz/approve_case_matriz).
    try:
        await _insert_matriz_review_decision(
            client=client,
            matrix_row=updated or matrix_row,
            case_row=case_row,
            decision_type="matriz_approved",
            decision_status="approved",
            decided_by=None,
            reason="cascade_auto_approve",
            origin="system",
            trigger=trigger,
            inherited_from_matriz_id=inherited_from_matriz_id,
            inherited_matriz_version=inherited_matriz_version,
        )
    except Exception:  # noqa: BLE001 - auditoría best-effort
        logger.error(
            "system_approve_matriz_audit_failed",
            matriz_id=str(matrix_row.get("id")),
            error="no se pudo insertar legal_review_decisions(matriz_approved)",
        )
    return updated


async def _system_approve_legal_review(
    client: Any, *, case_row: dict[str, Any], trigger: str
) -> None:
    """Espejo del camino 'aprobada' de `submit_legal_review` (SDD16), con
    `decided_by=None`/`origin='system'`. Solo se llama cuando la política es
    `exceptions_only` sin four-eyes (D8) y ya se verificó que el abogado
    redactor está completo — reusa exactamente esa misma verificación
    (`_missing_abogado_redactor_keys`) antes de invocar esta función."""
    org_id = str(case_row["organization_id"])
    project_id = str(case_row["project_id"])
    lot_id = str(case_row["lot_id"])
    now = _utc_now_iso()
    estado_row = await _upsert_lot_variable(
        client,
        organization_id=org_id,
        project_id=project_id,
        lot_id=lot_id,
        variable_key="revision_juridica.estado",
        value_text="aprobada",
        reviewed_by=None,
        reviewed_at=now,
        actor="system",
    )
    await _upsert_lot_variable(
        client,
        organization_id=org_id,
        project_id=project_id,
        lot_id=lot_id,
        variable_key="revision_juridica.aprobada_por",
        value_text="sistema",
        reviewed_by=None,
        reviewed_at=now,
        actor="system",
    )
    await _upsert_lot_variable(
        client,
        organization_id=org_id,
        project_id=project_id,
        lot_id=lot_id,
        variable_key="revision_juridica.aprobada_at",
        value_text=now,
        reviewed_by=None,
        reviewed_at=now,
        actor="system",
    )
    await asyncio.to_thread(
        lambda: (
            client.table("legal_review_decisions")
            .insert(
                {
                    "organization_id": org_id,
                    "project_id": project_id,
                    "lot_id": lot_id,
                    "escritura_case_id": str(case_row["id"]),
                    "variable_resolution_id": estado_row.get("id"),
                    "decision_type": "approve_case",
                    "decision_status": "approved",
                    "reason": "cascade_auto_approve",
                    "decided_by": None,
                    "decided_at": now,
                    "origin": "system",
                    "trigger": trigger,
                }
            )
            .execute()
        )
    )


async def _run_case_cascade(
    *,
    organization_id: str,
    escritura_case_id: str,
    trigger: str,
    supabase: Any | None = None,
) -> CascadeRunResult:
    """Orquesta el caso de escritura hasta donde llegue sin actos humanos.

    Idempotente y reanudable (D6): cada paso re-verifica el estado real en
    base antes de actuar, así que reintentar sobre un caso ya `completed` no
    duplica aprobaciones, minutas ni entregas.
    """
    if trigger not in CASCADE_TRIGGERS:
        raise CascadeError(f"unknown cascade trigger: {trigger!r}")

    if supabase is None:
        from core.database import get_supabase_client

        supabase = get_supabase_client()
    client = supabase
    org_id = str(organization_id)
    case_id = str(escritura_case_id)

    from api.v1.endpoints.legal_variables import ensure_legal_documents_feature_enabled

    case_row = await _fetch_case(client, case_id, org_id)
    project_id = str(case_row["project_id"])
    ensure_legal_documents_feature_enabled(organization_id=org_id, project_id=project_id)

    relaxed_readiness = await _org_relaxed_readiness(client, org_id)
    relaxed_token_keys = _relaxed_token_keys(case_row, relaxed_readiness)
    if relaxed_token_keys:
        _inject_relaxed_placeholders(case_row, relaxed_token_keys)

    matrix_row = await _fetch_active_matrix(client, case_id, org_id, project_id)
    if matrix_row is None:
        matrix_row = await _lazy_create_matrix(client, case_row, org_id)

    steps: list[dict[str, Any]] = []

    async def _exception(causes: list[dict[str, Any]]) -> CascadeRunResult:
        run_row = await _insert_cascade_run(
            client,
            organization_id=org_id,
            escritura_case_id=case_id,
            trigger=trigger,
            outcome="exception",
            causes=causes,
            steps=steps,
        )
        await _notify_case_exception(client, case_row=case_row, causes=causes)
        return CascadeRunResult(
            run_id=str(run_row["id"]) if run_row.get("id") else None,
            outcome="exception",
            causes=causes,
            steps=steps,
            created_at=run_row.get("created_at"),
        )

    async def _awaiting_review() -> CascadeRunResult:
        run_row = await _insert_cascade_run(
            client,
            organization_id=org_id,
            escritura_case_id=case_id,
            trigger=trigger,
            outcome="awaiting_review",
            causes=[],
            steps=steps,
        )
        return CascadeRunResult(
            run_id=str(run_row["id"]) if run_row.get("id") else None,
            outcome="awaiting_review",
            causes=[],
            steps=steps,
            created_at=run_row.get("created_at"),
        )

    # 1) Blockers reales del caso (todo lo que no sea el checkpoint de
    # revisión jurídica misma) — snapshot/gates/datos faltantes.
    _response, blockers, _current_hash = await _fresh_workflow_view(
        client, matrix_row, case_row
    )
    # _fresh_workflow_view puede auto-sanar el snapshot_hash (self-heal en
    # _case_response); releer la fila para operar sobre el estado real.
    matrix_row = (
        await _fetch_active_matrix(client, case_id, org_id, project_id) or matrix_row
    )
    snapshot_hash = str(matrix_row["snapshot_hash"])
    # FR-011: si el caso ya tiene una minuta y los datos cambiaron después
    # (el hash vigente ya no calza con el de la última generación), la
    # cascada no regenera sola — regenerar es una acción humana explícita.
    # Se corta ANTES de registrar corrida para no pisar el estado
    # "completed" que la mesa muestra como entregada.
    latest_generation = await _fetch_latest_case_generation(
        client, escritura_case_id=case_id, organization_id=org_id
    )
    if latest_generation and str(latest_generation.get("snapshot_hash")) != snapshot_hash:
        raise CaseOutdatedError(
            "case_outdated: el caso tiene una minuta entregada con datos "
            "anteriores; regenerar es una acción explícita (FR-011)."
        )
    existing_generation = None
    if matrix_row.get("status") == "approved":
        existing_generation = await _find_existing_generation(
            client,
            escritura_case_id=case_id,
            organization_id=org_id,
            snapshot_hash=snapshot_hash,
        )
    if existing_generation:
        steps.extend(
            [
                {"step": "submit", "action": "skipped", "detail": "approved"},
                {
                    "step": "legal_review",
                    "action": "skipped",
                    "detail": "already_approved",
                },
                {"step": "approve", "action": "skipped", "detail": "already_approved"},
                {"step": "generate", "action": "skipped", "detail": "already_generated"},
            ]
        )
        run_row = await _insert_cascade_run(
            client,
            organization_id=org_id,
            escritura_case_id=case_id,
            trigger=trigger,
            outcome="completed",
            causes=[],
            steps=steps,
        )
        return CascadeRunResult(
            run_id=str(run_row["id"]) if run_row.get("id") else None,
            outcome="completed",
            causes=[],
            steps=steps,
            generation_id=str(existing_generation["id"]),
            created_at=run_row.get("created_at"),
        )

    real_blockers = [
        b
        for b in blockers
        if not _is_review_checkpoint_blocker(b)
        and not _is_relaxed_readiness_blocker(b, relaxed_readiness)
        and not _is_relaxed_token_missing(b, relaxed_token_keys)
    ]
    review_pending = any(_is_review_checkpoint_blocker(b) for b in blockers)

    if real_blockers:
        return await _exception(real_blockers)

    policy = await _fetch_org_review_policy(client, org_id)
    from core.config import get_settings

    four_eyes_active = get_settings().LEGAL_REVIEW_REQUIRE_DISTINCT_REVIEWER
    # D8: exceptions_only + four-eyes activo son dos controles contradictorios
    # — gana el más estricto, la cascada se detiene igual que en every_sale.
    requires_human_review = policy == "every_sale" or (
        policy == "exceptions_only" and four_eyes_active
    )

    project_matriz_id = matrix_row.get("source_project_matriz_id")
    project_matriz_version: int | None = None
    if project_matriz_id:
        try:
            project_matrix_row = await _fetch_matrix_by_id(
                client, str(project_matriz_id), org_id
            )
            project_matriz_version = (
                int(project_matrix_row["version"]) if project_matrix_row else None
            )
        except Exception:  # noqa: BLE001 - trazabilidad best-effort
            project_matriz_version = None

    # 2) Avanzar submit (draft -> legal_review_pending): bookkeeping interno,
    # nunca requiere juicio humano.
    if matrix_row.get("status") == "draft":
        matrix_row = await _system_submit_matriz(
            client, matrix_row, case_row, trigger=trigger
        )
        steps.append({"step": "submit", "action": "executed"})
    else:
        steps.append(
            {"step": "submit", "action": "skipped", "detail": matrix_row.get("status")}
        )

    # 3) Revisión jurídica (SDD16): el único checkpoint de política real.
    if review_pending:
        revision_entry = _as_dict(case_row.get("variable_snapshot")).get(
            "revision_juridica.estado"
        )
        revision_value = (
            revision_entry.get("value_text") if isinstance(revision_entry, dict) else None
        )
        if revision_value == "rechazada":
            # FR-004: un rechazo es una decisión humana negativa, no un
            # checkpoint pendiente — nunca queda en awaiting_review (eso
            # implicaría reintentar solo). Queda en excepción con el
            # comentario del revisor.
            reason = await _fetch_latest_rejection_reason(client, case_id, org_id)
            steps.append({"step": "legal_review", "action": "skipped", "detail": "rejected"})
            return await _exception(
                [
                    {
                        "kind": "legal_review_rejected",
                        "title": "Revisión jurídica rechazada",
                        "description": reason
                        or "El revisor rechazó la revisión jurídica del caso.",
                        "fix_url": f"/projects/{project_id}?tab=legal",
                    }
                ]
            )
        if requires_human_review:
            steps.append({"step": "legal_review", "action": "skipped", "detail": "pending_human"})
            return await _awaiting_review()

        missing_abogado = await _missing_abogado_redactor_keys(client, org_id, project_id)
        if missing_abogado:
            causes = [
                {
                    "kind": "token_missing",
                    "key": key,
                    "title": f"Falta el dato: {key}",
                    "description": (
                        "Ingresa este dato en el estudio de título del proyecto "
                        "antes de que la escritura pueda aprobarse sola."
                    ),
                    "fix_url": f"/projects/{project_id}?tab=legal",
                }
                for key in missing_abogado
            ]
            return await _exception(causes)

        await _system_approve_legal_review(client, case_row=case_row, trigger=trigger)
        steps.append({"step": "legal_review", "action": "executed", "detail": "system_approved"})
        # A2 (bug 2026-08-13): el snapshot del caso (readiness_gates en BD) quedó
        # congelado en la creación previo a la siembra de revision_juridica.*.
        # Refrescarlo ahora (idempotente, stage_operational=False) para que la
        # mesa y las notificaciones vean legal_review_ready.status='ready' en
        # vez del snapshot stale que disparaba el mensaje "Borrador por revisar"
        # contradictorio tras una cascada ya completada (Lote 26 Teno 2).
        lot_id = str(case_row["lot_id"])
        case_row = await create_escritura_case_snapshot(
            organization_id=org_id,
            project_id=project_id,
            lot_id=lot_id,
            stage_operational=False,
            supabase=client,
        )
        if relaxed_token_keys:
            _inject_relaxed_placeholders(case_row, relaxed_token_keys)
    else:
        steps.append({"step": "legal_review", "action": "skipped", "detail": "already_approved"})

    # 4) Aprobar la matriz (system) — hereda el molde vigente.
    if matrix_row.get("status") == "legal_review_pending":
        # C + C-bis (bug 4, 2026-08-13): _approve_semantic_candidate puede
        # lanzar HTTPException DOCUMENT_SEMANTIC_INVALID si el DOCX no pasa
        # validación (p. ej. token lote.rol_tramite sin resolver). Antes la
        # cascada reportaba step approve=executed con status=failed en BD y
        # outcome=completed (bug Lote 26). Ahora se captura la excepción, se
        # mapean los issues semánticos a causes humanizadas y se corta con
        # outcome=exception kind=matriz_approval_failed.
        try:
            matrix_row = await _system_approve_matriz(
                client,
                matrix_row,
                case_row,
                trigger=trigger,
                inherited_from_matriz_id=(
                    str(project_matriz_id) if project_matriz_id else None
                ),
                inherited_matriz_version=project_matriz_version,
            )
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            sem_issues = detail.get("issues") if isinstance(detail.get("issues"), list) else []
            causes = []
            for issue in sem_issues:
                path = str((issue or {}).get("path") or issue.get("code") or "unknown")
                causes.append(
                    {
                        "kind": "matriz_approval_failed",
                        "title": "La aprobación de la matriz no se materializó",
                        "description": (
                            f"Validación semántica del documento falló: "
                            f"{detail.get('code', 'DOCUMENT_SEMANTIC_INVALID')} "
                            f"en '{path}'. Verifica que el token referenciado "
                            f"tenga valor resuelto antes de aprobar."
                        ),
                        "fix_url": f"/projects/{project_id}?tab=legal",
                    }
                )
            if not causes:
                causes.append(
                    {
                        "kind": "matriz_approval_failed",
                        "title": "La aprobación de la matriz no se materializó",
                        "description": str(detail) or "Validación semántica falló.",
                        "fix_url": f"/projects/{project_id}?tab=legal",
                    }
                )
            steps.append(
                {"step": "approve", "action": "skipped", "detail": "semantic_failed"}
            )
            return await _exception(causes)
        # Re-leer la matriz de BD (camino exitoso); si el RPC finalizó pero
        # dejó status != 'approved' por otra razón, también cortar exception.
        refreshed_matrix = await _fetch_active_matrix(
            client, case_id, org_id, project_id
        )
        if refreshed_matrix is not None:
            matrix_row = refreshed_matrix
        if matrix_row.get("status") == "approved":
            steps.append({"step": "approve", "action": "executed"})
        else:
            steps.append(
                {
                    "step": "approve",
                    "action": "skipped",
                    "detail": f"status={matrix_row.get('status')}",
                }
            )
            return await _exception(
                [
                    {
                        "kind": "matriz_approval_failed",
                        "title": "La aprobación de la matriz no se materializó",
                        "description": (
                            f"La matriz del caso no quedó 'approved' tras la "
                            f"aprobación automática (estado real: "
                            f"{matrix_row.get('status')}). Revisa si la validación "
                            f"semántica del documento falló o si no hay un grant "
                            f"de aprobación legal activo para la organización."
                        ),
                        "fix_url": f"/projects/{project_id}?tab=legal",
                    }
                ]
            )
    elif matrix_row.get("status") == "approved":
        steps.append({"step": "approve", "action": "skipped", "detail": "already_approved"})
    else:
        steps.append(
            {"step": "approve", "action": "skipped", "detail": matrix_row.get("status")}
        )
        return await _exception(
            [
                {
                    "kind": "readiness_gate",
                    "title": "La matriz no está en un estado aprobable",
                    "description": f"Estado actual: {matrix_row.get('status')}.",
                    "fix_url": f"/projects/{project_id}?tab=legal",
                }
            ]
        )

    # 5) Aviso legal del proyecto (US4, FR-009): se confirma una vez, no por
    # generación.
    warning_ack = await _fetch_project_warning_ack(client, project_id, org_id)
    if warning_ack is None:
        return await _exception(
            [
                {
                    "kind": "project_warning_missing",
                    "title": "Aviso legal de borrador sin confirmar",
                    "description": (
                        "Un admin debe confirmar una vez el aviso legal de "
                        "borrador del proyecto antes de que la escritura pueda "
                        "generarse sola."
                    ),
                    "fix_url": f"/projects/{project_id}?tab=legal",
                }
            ]
        )
    warning_ack_by, warning_ack_at = warning_ack

    # 6) Generar + entregar (idempotente por snapshot_hash del caso, D6).
    existing_generation = await _find_existing_generation(
        client,
        escritura_case_id=case_id,
        organization_id=org_id,
        snapshot_hash=snapshot_hash,
    )
    if existing_generation:
        steps.append({"step": "generate", "action": "skipped", "detail": "already_generated"})
        generation_id = str(existing_generation["id"])
    else:
        template = await _fetch_template(client, str(matrix_row["template_id"]), org_id)
        template_clauses = await _fetch_template_clauses(client, str(template["id"]), org_id)
        _view_clauses, active_clauses = _effective_clauses(
            template_clauses, matrix_row, _as_dict(case_row.get("variable_snapshot"))
        )
        alert_blockers = _alert_clause_blockers(
            variable_snapshot=_as_dict(case_row.get("variable_snapshot")),
            active_clauses=active_clauses,
            fix_url="/documentos/plantillas",
        )
        readiness_blockers = _readiness_gate_blockers(
            case_row=case_row,
            fix_url=f"/projects/{project_id}?tab=legal",
            inherited_gates=(
                INHERITED_PROJECT_READINESS_GATES
                if matrix_row.get("source_project_matriz_id")
                else None
            ),
        )
        generation_blockers = [
            b
            for b in (*alert_blockers, *readiness_blockers)
            if not _is_review_checkpoint_blocker(b)
            and not _is_relaxed_readiness_blocker(b, relaxed_readiness)
            and not _is_relaxed_token_missing(b, relaxed_token_keys)
        ]
        if generation_blockers:
            return await _exception(generation_blockers)

        generation = await _generate_minuta_row(
            client=client,
            matrix_row=matrix_row,
            case_row=case_row,
            template=template,
            active_clauses=active_clauses,
            generated_by=None,
            warning_acknowledged_by=warning_ack_by,
            warning_acknowledged_at=warning_ack_at,
            generation_mode="automatic",
        )
        steps.append({"step": "generate", "action": "executed"})
        generation_id = str(generation.id)

    # A3 (bug 2026-08-13, defensivo): antes de reportar 'completed', re-snapshotea
    # el caso (idempotente). Garantiza que readiness_gates persistido refleje
    # todos los avances (system_approve_legal_review + system_approve_matriz +
    # _generate_minuta_row), incluso si A2 fallara por alguna rama (p. ej.
    # existing_generation idle, o caso que ya venía 'approved'). Es el mismo
    # patrón que submit_legal_review ya usaba tras el acto humano.
    try:
        lot_id = lot_id if "lot_id" in locals() else str(case_row["lot_id"])
        await create_escritura_case_snapshot(
            organization_id=org_id,
            project_id=project_id,
            lot_id=lot_id,
            stage_operational=False,
            supabase=client,
        )
    except Exception:  # noqa: BLE001 - snapshot best-effort, no revierte completed
        logger.error(
            "escritura_cascade_final_snapshot_failed",
            organization_id=org_id,
            escritura_case_id=case_id,
            exc_info=True,
        )

    run_row = await _insert_cascade_run(
        client,
        organization_id=org_id,
        escritura_case_id=case_id,
        trigger=trigger,
        outcome="completed",
        causes=[],
        steps=steps,
    )
    logger.info(
        "escritura_cascade_completed",
        organization_id=org_id,
        escritura_case_id=case_id,
        trigger=trigger,
        generation_id=generation_id,
    )
    return CascadeRunResult(
        run_id=str(run_row["id"]) if run_row.get("id") else None,
        outcome="completed",
        causes=[],
        steps=steps,
        generation_id=generation_id,
        created_at=run_row.get("created_at"),
    )


async def _defer_workflow_outbox_for_feature_off(
    client: Any, *, workflow_outbox_id: str, reason: str
) -> None:
    """Keep the durable obligation intact when automatic generation is off."""
    await asyncio.to_thread(
        lambda: client.table("workflow_outbox")
        .update(
            {
                "status": "deferred_feature_off",
                "lease_owner": None,
                "lease_expires_at": None,
                "heartbeat_at": None,
                "last_error_code": f"AUTOMATIC_ESCRITURA_{reason.upper()}",
            }
        )
        .eq("id", workflow_outbox_id)
        .execute()
    )


async def _begin_pipeline_outbox_attempt(client: Any, workflow_outbox_id: str) -> None:
    """Record a direct pipeline attempt; worker claims already own this transition."""
    if hasattr(client, "rpc"):
        # The worker has already called this RPC.  This branch supports callers
        # that enter the pipeline directly while retaining its atomic contract.
        return
    await asyncio.to_thread(
        lambda: client.table("workflow_outbox")
        .update({"status": "processing", "attempt_count": 1})
        .eq("id", workflow_outbox_id)
        .execute()
    )


async def _resolve_rollout_from_db(
    client: Any,
    *,
    feature_key: str,
    organization_id: str,
    project_id: str | None,
    hard_off: bool,
) -> bool:
    """Resolve the rollout control from Supabase (source of truth).

    Fail closed: hard-off, lectura con error, o control ausente/off producen
    False. Solo ON o projects-scoped devuelven True, igual que el RPC SQL
    `resolve_feature_rollout` que usa el worker antes del claim.
    """
    if hard_off:
        return False
    try:
        response = await asyncio.to_thread(
            lambda: client.rpc(
                "resolve_feature_rollout",
                {
                    "p_feature_key": feature_key,
                    "p_organization_id": str(organization_id),
                    "p_project_id": project_id,
                },
            ).execute()
        )
    except Exception:
        return False
    data = getattr(response, "data", None)
    if isinstance(data, list):
        data = data[0] if data else False
    if isinstance(data, dict):
        data = next(iter(data.values()), False)
    return data is True


async def run_case_cascade(
    *,
    organization_id: str,
    escritura_case_id: str,
    trigger: str,
    supabase: Any | None = None,
    workflow_outbox_id: str | None = None,
    automatic_escritura_hard_off: bool = True,
) -> CascadeRunResult:
    """Run one serialized cascade and fail closed for durable auto-work."""
    if supabase is None:
        from core.database import get_supabase_client

        supabase = get_supabase_client()
    client = supabase
    org_id, case_id = str(organization_id), str(escritura_case_id)

    if workflow_outbox_id:
        case_row = await _fetch_case(client, case_id, org_id)
        # Resolver el control desde la fuente de verdad (Supabase), no desde
        # un control Python hardcodeado: antes el `control=None` forzaba
        # "missing" y difería el outbox con AUTOMATIC_ESCRITURA_MISSING,
        # impidiendo que la venta→escritura avanzara jamás.
        rollout_enabled = await _resolve_rollout_from_db(
            client,
            feature_key="automatic_escritura",
            organization_id=org_id,
            project_id=str(case_row.get("project_id") or "") or None,
            hard_off=automatic_escritura_hard_off,
        )
        if not rollout_enabled:
            reason = "hard_off" if automatic_escritura_hard_off else "control_off"
            await _defer_workflow_outbox_for_feature_off(
                client, workflow_outbox_id=str(workflow_outbox_id), reason=reason
            )
            return CascadeRunResult(run_id=None, outcome="deferred_feature_off")
        await _begin_pipeline_outbox_attempt(client, str(workflow_outbox_id))

    lock = _CASE_CASCADE_LOCKS.setdefault((org_id, case_id), asyncio.Lock())
    async with lock:
        return await _run_case_cascade(
            organization_id=org_id,
            escritura_case_id=case_id,
            trigger=trigger,
            supabase=client,
        )
