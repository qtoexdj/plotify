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

from core.logger import get_logger
from services.escritura_case_workflow import (
    _alert_clause_blockers,
    _as_dict,
    _effective_clauses,
    _fetch_active_matrix,
    _fetch_case,
    _fetch_matrix_by_id,
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
)
from services.escritura_delivery import _recipient_chat_id

logger = get_logger(__name__)

CASCADE_TRIGGERS = ("sale_validated", "review_approved", "manual_retry")
CASCADE_OUTCOMES = ("completed", "exception", "awaiting_review")


class CascadeError(Exception):
    """Error de la cascada que no debe tratarse como excepción del caso
    (p. ej. trigger desconocido, caso fuera de tenant): el llamador decide
    cómo reaccionar, no se registra como una corrida."""


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


async def _fetch_project_warning_ack(
    client: Any, project_id: str, organization_id: str
) -> tuple[str, str] | None:
    result = await asyncio.to_thread(
        lambda: (
            client.table("projects")
            .select("minuta_warning_acknowledged_by, minuta_warning_acknowledged_at")
            .eq("id", project_id)
            .eq("organization_id", organization_id)
            .maybe_single()
            .execute()
        )
    )
    row = _first_row(getattr(result, "data", None))
    by = row.get("minuta_warning_acknowledged_by") if row else None
    at = row.get("minuta_warning_acknowledged_at") if row else None
    if not by or not at:
        return None
    return str(by), str(at)


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
    now = _utc_now_iso()
    payload = {
        "status": "approved",
        "approved_by": None,
        "approved_at": now,
        "approval_origin": "system",
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
        decision_type="matriz_approved",
        decision_status="approved",
        decided_by=None,
        reason="cascade_auto_approve",
        origin="system",
        trigger=trigger,
        inherited_from_matriz_id=inherited_from_matriz_id,
        inherited_matriz_version=inherited_matriz_version,
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


async def run_case_cascade(
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

    real_blockers = [b for b in blockers if not _is_review_checkpoint_blocker(b)]
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
    else:
        steps.append({"step": "legal_review", "action": "skipped", "detail": "already_approved"})

    # 4) Aprobar la matriz (system) — hereda el molde vigente.
    if matrix_row.get("status") == "legal_review_pending":
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
        steps.append({"step": "approve", "action": "executed"})
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
    snapshot_hash = str(matrix_row["snapshot_hash"])
    existing_generation = await _find_existing_generation(
        client, escritura_case_id=case_id, organization_id=org_id, snapshot_hash=snapshot_hash
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
            case_row=case_row, fix_url=f"/projects/{project_id}?tab=legal"
        )
        generation_blockers = [
            b
            for b in (*alert_blockers, *readiness_blockers)
            if not _is_review_checkpoint_blocker(b)
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
        )
        steps.append({"step": "generate", "action": "executed"})
        generation_id = str(generation.id)

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
