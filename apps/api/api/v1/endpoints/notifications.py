from fastapi import APIRouter, Depends, HTTPException, status, Header, Query
from arq.connections import ArqRedis
from dataclasses import asdict
from datetime import datetime, timezone
from uuid import UUID

from schemas.notification import (
    NotificationListResponse,
    NotificationItem,
    NotificationCounts,
    MarkReadResponse,
    DismissResponse,
    BulkReadResponse,
    NotificationDecisionResponse,
    NotificationDecisionRequest
)
from core.database import get_supabase_client
from core.logger import get_logger
from core.redis import get_arq_pool
from api.deps import verify_internal_secret, require_admin_role
from workers.tasks.approval_processor import execute_admin_decision_db
from api.v1.endpoints.approvals import require_approval_organization
from services.escritura_notifications import (
    AdminNotificationCopy,
    draft_ready_for_review_copy,
    sale_pending_validation_copy,
    waiting_project_matriz_copy,
)

router = APIRouter(dependencies=[Depends(verify_internal_secret)])
logger = get_logger(__name__)


def _first_row(data):
    if isinstance(data, list):
        return data[0] if data else None
    return data if isinstance(data, dict) else None


async def _resolve_member_notification_scope(
    supabase, organization_id: str, user_id: str
) -> str:
    """Resuelve el alcance de notificaciones según el modelo real de roles.

    `organization_members.role` solo admite 'admin' | 'user' (no existe
    'vendor' en la base). Un miembro 'user' es vendedor si y solo si tiene
    una fila activa en `vendors` para la organización; su alcance son sus
    propios eventos (recipient_id). Los admins ven los eventos admin de la
    organización. Cualquier otro 'user' (sin fila vendor) queda en alcance
    propio por seguridad.
    """
    member_res = (
        supabase.table("organization_members")
        .select("role")
        .eq("organization_id", organization_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not member_res.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario no es miembro de esta organización.",
        )
    role = member_res.data[0]["role"]
    if role == "admin":
        return "admin"
    vendor_res = (
        supabase.table("vendors")
        .select("id")
        .eq("user_id", user_id)
        .eq("organization_id", organization_id)
        .eq("active", True)
        .limit(1)
        .execute()
    )
    if vendor_res.data:
        return "vendor"
    return "user"


def _sale_approved_notification_copy(
    *,
    supabase=None,
    organization_id: str,
    project_id: str | None,
    lot_id: str,
    lot_label: str,
    case_row: dict | None = None,
    matrix_row: dict | None = None,
) -> AdminNotificationCopy | None:
    if case_row is None and supabase is not None:
        case_res = (
            supabase.table("escritura_cases")
            .select("id, case_status, readiness_status, readiness_gates")
            .eq("organization_id", organization_id)
            .eq("lot_id", lot_id)
            .limit(1)
            .execute()
        )
        case_row = _first_row(
            [
                row
                for row in (case_res.data or [])
                if row.get("case_status") != "cancelled"
            ]
        )
    if not case_row:
        return None

    if matrix_row is None and supabase is not None:
        matrix_res = (
            supabase.table("escritura_matrices")
            .select("id, status, source_project_matriz_id")
            .eq("organization_id", organization_id)
            .eq("escritura_case_id", str(case_row["id"]))
            .limit(1)
            .execute()
        )
        matrix_row = _first_row(
            [
                row
                for row in (matrix_res.data or [])
                if row.get("status") != "superseded"
            ]
        )
    if matrix_row and matrix_row.get("source_project_matriz_id"):
        return draft_ready_for_review_copy(
            escritura_case_id=str(case_row["id"]),
            lot_label=lot_label,
        )

    gates = case_row.get("readiness_gates") or {}
    project_gate = gates.get("project_matriz_approved") or {}
    if project_gate.get("status") == "blocked":
        return waiting_project_matriz_copy(
            project_id=project_id,
            lot_label=lot_label,
        )

    return None


def _notification_copy_for_item(
    *,
    supabase=None,
    organization_id: str,
    request_type: str,
    status_val: str,
    project_id: str | None,
    lot_id: str,
    lot_label: str,
    project_name: str,
    client_name: str,
    case_row: dict | None = None,
    matrix_row: dict | None = None,
) -> AdminNotificationCopy | None:
    if request_type != "sale":
        return None
    if status_val == "pending":
        return sale_pending_validation_copy(
            project_id=project_id,
            lot_label=lot_label,
            project_name=project_name,
            client_name=client_name,
        )
    if status_val == "approved":
        return _sale_approved_notification_copy(
            supabase=supabase,
            organization_id=organization_id,
            project_id=project_id,
            lot_id=lot_id,
            lot_label=lot_label,
            case_row=case_row,
            matrix_row=matrix_row,
        )
    return None

@router.get(
    "/",
    status_code=status.HTTP_200_OK,
    response_model=NotificationListResponse,
    operation_id="listNotifications",
)
async def list_notifications(
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_organization_id: str = Header(..., alias="X-Organization-Id"),
    limit: int = Query(default=50, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
):
    """
    Lista las notificaciones de aprobaciones y solicitudes pendientes/recientes
    según el rol y la organización del usuario autenticado.

    Solo devuelve notificaciones no descartadas, ordenadas de más reciente a
    más antigua y paginadas (máximo 50 por consulta). Los conteos son globales
    del alcance del usuario (excluyen descartadas), no de la página.
    """
    # Validar formato UUID para evitar errores de sintaxis 500 en Postgres
    try:
        UUID(x_user_id)
        UUID(x_organization_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Los identificadores de usuario u organización no tienen un formato UUID válido."
        )

    supabase = get_supabase_client()
    
    # 1. Resolver el alcance de notificaciones del usuario en la organización
    scope = await _resolve_member_notification_scope(
        supabase, x_organization_id, x_user_id
    )
    
    # 2. Conteos globales del alcance (excluyen notificaciones descartadas)
    counts_query = supabase.table("notification_events").select(
        "id, read_at, approval_requests!inner(status)"
    ).eq("organization_id", x_organization_id).is_("dismissed_at", "null")
    
    if scope == "admin":
        counts_query = counts_query.eq("recipient_role", "admin")
    else:
        counts_query = counts_query.eq("recipient_id", x_user_id)
        
    counts_res = counts_query.execute()
    
    pending_cnt = 0
    approved_cnt = 0
    rejected_cnt = 0
    unread_cnt = 0
    
    for row in counts_res.data or []:
        app_req = row.get("approval_requests")
        if not app_req:
            continue
        status_val = app_req.get("status", "pending")
        if status_val == "pending":
            pending_cnt += 1
        elif status_val == "approved":
            approved_cnt += 1
        elif status_val == "rejected":
            rejected_cnt += 1
        if not row.get("read_at"):
            unread_cnt += 1
    
    # 3. Consultar notificaciones (paginadas) en base de datos
    query = supabase.table("notification_events").select(
        "id, approval_id, recipient_role, read_at, dismissed_at, created_at, "
        "approval_requests!inner(id, request_type, status, vendor_name, payload, resolved_at, lot_id, "
        "lots!inner(id, numero_lote, projects!inner(id, name)))"
    ).eq("organization_id", x_organization_id).is_("dismissed_at", "null")
    
    if scope == "admin":
        query = query.eq("recipient_role", "admin")
    else:
        query = query.eq("recipient_id", x_user_id)
        
    res = query.order("created_at", desc=True).order("id", desc=True).range(offset, offset + limit - 1).execute()
    
    if not res.data:
        return NotificationListResponse(
            items=[],
            counts=NotificationCounts(
                pending=pending_cnt,
                approved=approved_cnt,
                rejected=rejected_cnt,
                unread=unread_cnt
            )
        )
    
    # Batch-fetch escritura_cases y matrices para ventas aprobadas (elimina N+1 queries)
    approved_lot_ids = [
        str(row["approval_requests"]["lot_id"])
        for row in res.data
        if row.get("approval_requests")
        and row["approval_requests"].get("request_type") == "sale"
        and row["approval_requests"].get("status") == "approved"
        and row["approval_requests"].get("lot_id")
    ]

    cases_by_lot: dict[str, dict] = {}
    matrices_by_case: dict[str, dict] = {}

    if approved_lot_ids:
        cases_res = (
            supabase.table("escritura_cases")
            .select("id, lot_id, case_status, readiness_status, readiness_gates")
            .eq("organization_id", x_organization_id)
            .in_("lot_id", list(set(approved_lot_ids)))
            .execute()
        )
        for c in cases_res.data or []:
            if c.get("case_status") != "cancelled":
                lot_k = str(c.get("lot_id"))
                if lot_k not in cases_by_lot:
                    cases_by_lot[lot_k] = c

        case_ids = [str(c["id"]) for c in cases_by_lot.values() if c.get("id")]
        if case_ids:
            mat_res = (
                supabase.table("escritura_matrices")
                .select("id, escritura_case_id, status, source_project_matriz_id")
                .eq("organization_id", x_organization_id)
                .in_("escritura_case_id", case_ids)
                .execute()
            )
            for m in mat_res.data or []:
                if m.get("status") != "superseded":
                    case_k = str(m.get("escritura_case_id"))
                    if case_k not in matrices_by_case:
                        matrices_by_case[case_k] = m

    items = []
    
    for row in res.data:
        app_req = row.get("approval_requests")
        if not app_req:
            logger.warning(
                "notification_list_missing_approval_request",
                notification_id=row.get("id"),
                detail="El usuario podría no tener permisos de RLS para ver esta solicitud o fue eliminada."
            )
            continue
            
        lot = app_req.get("lots")
        if not lot:
            logger.warning(
                "notification_list_missing_lot",
                notification_id=row.get("id"),
                approval_id=row.get("approval_id")
            )
            continue
            
        project = lot.get("projects")
        if not project:
            logger.warning(
                "notification_list_missing_project",
                notification_id=row.get("id"),
                lot_id=app_req.get("lot_id")
            )
            continue
            
        payload = app_req.get("payload") or {}
        status_val = app_req.get("status", "pending")
        read_at_val = row.get("read_at")
        request_type = app_req.get("request_type", "reservation")
        lot_label = f"Lote {lot.get('numero_lote', 'N/A')}"
        project_name = project.get("name", "N/A")
        client_name = payload.get("cliente_nombre", "N/A")
        lot_id_str = str(app_req.get("lot_id"))
        prefetched_case = cases_by_lot.get(lot_id_str)
        prefetched_matrix = matrices_by_case.get(str(prefetched_case["id"])) if prefetched_case else None

        copy = _notification_copy_for_item(
            supabase=supabase,
            organization_id=x_organization_id,
            request_type=request_type,
            status_val=status_val,
            project_id=str(project["id"]) if project.get("id") else None,
            lot_id=lot_id_str,
            lot_label=lot_label,
            project_name=project_name,
            client_name=client_name,
            case_row=prefetched_case,
            matrix_row=prefetched_matrix,
        )
        copy_payload = asdict(copy) if copy else {}
        
        items.append(
            NotificationItem(
                id=row["id"],
                approval_id=row["approval_id"],
                request_type=request_type,
                status=status_val,
                project_name=project_name,
                lot_label=lot_label,
                client_name=client_name,
                vendor_name=app_req.get("vendor_name", "N/A"),
                created_at=row["created_at"],
                decided_at=app_req.get("resolved_at"),
                can_decide=(scope == "admin" and status_val == "pending"),
                read_at=read_at_val,
                dismissed_at=row.get("dismissed_at"),
                **copy_payload,
            )
        )
        
    return NotificationListResponse(
        items=items,
        counts=NotificationCounts(
            pending=pending_cnt,
            approved=approved_cnt,
            rejected=rejected_cnt,
            unread=unread_cnt
        )
    )

@router.post(
    "/{notification_id}/read",
    status_code=status.HTTP_200_OK,
    response_model=MarkReadResponse,
    operation_id="markNotificationRead",
)
async def mark_notification_read(
    notification_id: str,
    x_user_id: str = Header(..., alias="X-User-Id"),
):
    """
    Marca una notificación específica como leída por su destinatario.
    """
    # Validar formato UUID para evitar errores de sintaxis 500 en Postgres
    try:
        UUID(notification_id)
        UUID(x_user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Los identificadores no tienen un formato UUID válido."
        )

    supabase = get_supabase_client()
    
    notif_res = (
        supabase.table("notification_events")
        .select("id, recipient_id, organization_id, recipient_role")
        .eq("id", notification_id)
        .limit(1)
        .execute()
    )
    
    if not notif_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notificación no encontrada."
        )
        
    notification = notif_res.data[0]
    
    # Validar membresía del x_user_id en la organización de la notificación (tenant validation)
    scope = await _resolve_member_notification_scope(
        supabase, notification["organization_id"], x_user_id
    )
    
    # Los no-admin (vendedores y usuarios sin rol operativo) solo pueden
    # marcar como leídas sus propias notificaciones.
    if scope != "admin":
        if str(notification["recipient_id"]) != str(x_user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No autorizado para marcar esta notificación."
            )
        
    now_str = datetime.now(timezone.utc).isoformat()
    
    update_res = (
        supabase.table("notification_events")
        .update({"read_at": now_str})
        .eq("id", notification_id)
        .execute()
    )
    
    if not update_res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al actualizar estado de lectura."
        )
        
    return MarkReadResponse(
        success=True,
        read_at=now_str
    )

@router.post(
    "/{notification_id}/dismiss",
    status_code=status.HTTP_200_OK,
    response_model=DismissResponse,
    operation_id="dismissNotification",
)
async def dismiss_notification(
    notification_id: str,
    x_user_id: str = Header(..., alias="X-User-Id"),
):
    """
    Descarta (soft-dismiss) una notificación para su destinatario.

    El registro permanece en la base con la marca temporal de descarte para
    auditoría (nunca se elimina físicamente) y la solicitud subyacente no se
    altera: sigue siendo decidible por otros canales. Es idempotente: si la
    notificación ya estaba descartada, devuelve la marca existente.
    """
    # Validar formato UUID para evitar errores de sintaxis 500 en Postgres
    try:
        UUID(notification_id)
        UUID(x_user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Los identificadores no tienen un formato UUID válido."
        )

    supabase = get_supabase_client()

    notif_res = (
        supabase.table("notification_events")
        .select("id, recipient_id, organization_id, recipient_role, dismissed_at")
        .eq("id", notification_id)
        .limit(1)
        .execute()
    )

    if not notif_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notificación no encontrada."
        )

    notification = notif_res.data[0]

    # Validar membresía del x_user_id en la organización de la notificación (tenant validation)
    scope = await _resolve_member_notification_scope(
        supabase, notification["organization_id"], x_user_id
    )

    # Scope idéntico a list/read-all: los no-admin (vendedores y usuarios sin
    # rol operativo) solo descartan sus propias notificaciones; los admin solo
    # filas admin de su organización (FR-004: aislamiento por rol).
    if scope == "admin":
        if notification.get("recipient_role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No autorizado para descartar esta notificación.",
            )
    else:
        if str(notification["recipient_id"]) != str(x_user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No autorizado para descartar esta notificación.",
            )

    # Idempotencia: no reescribir la marca de un descarte previo.
    existing = notification.get("dismissed_at")
    if existing:
        return DismissResponse(success=True, dismissed_at=existing)

    now_str = datetime.now(timezone.utc).isoformat()

    update_res = (
        supabase.table("notification_events")
        .update({"dismissed_at": now_str})
        .eq("id", notification_id)
        .execute()
    )

    if not update_res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al descartar la notificación."
        )

    return DismissResponse(
        success=True,
        dismissed_at=now_str
    )

@router.post(
    "/read-all",
    status_code=status.HTTP_200_OK,
    response_model=BulkReadResponse,
    operation_id="markAllNotificationsRead",
)
async def mark_all_notifications_read(
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_organization_id: str = Header(..., alias="X-Organization-Id"),
):
    """
    Marca todas las notificaciones sin leer del alcance del usuario como
    leídas en una única operación.

    Excluye las notificaciones descartadas. Para administradores el alcance
    son los eventos de rol admin de su organización; para el resto, solo los
    propios (recipient_id).
    """
    # Validar formato UUID para evitar errores de sintaxis 500 en Postgres
    try:
        UUID(x_user_id)
        UUID(x_organization_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Los identificadores de usuario u organización no tienen un formato UUID válido."
        )

    supabase = get_supabase_client()

    # Validar membresía del usuario en la organización (tenant validation)
    scope = await _resolve_member_notification_scope(
        supabase, x_organization_id, x_user_id
    )

    update_query = (
        supabase.table("notification_events")
        .update({"read_at": datetime.now(timezone.utc).isoformat()})
        .eq("organization_id", x_organization_id)
        .is_("read_at", "null")
        .is_("dismissed_at", "null")
    )

    if scope == "admin":
        update_query = update_query.eq("recipient_role", "admin")
    else:
        update_query = update_query.eq("recipient_id", x_user_id)

    update_res = update_query.execute()

    updated_count = len(update_res.data) if update_res.data else 0

    return BulkReadResponse(
        success=True,
        updated_count=updated_count
    )

@router.post(
    "/{approval_id}/decide",
    status_code=status.HTTP_200_OK,
    response_model=NotificationDecisionResponse,
    operation_id="decideNotificationApproval",
)
async def decide_notification_approval(
    approval_id: str,
    body: NotificationDecisionRequest,
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_organization_id: str = Header(..., alias="X-Organization-Id"),
    redis: ArqRedis = Depends(get_arq_pool),
):
    """
    Procesa la decisión de aprobación/rechazo de un administrador
    directamente desde el dropdown de notificaciones web.
    """
    # Validar formato UUID para evitar errores de sintaxis 500 en Postgres
    try:
        UUID(approval_id)
        UUID(x_user_id)
        UUID(x_organization_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Los identificadores no tienen un formato UUID válido."
        )

    supabase = get_supabase_client()
    await require_approval_organization(approval_id, x_organization_id, supabase=supabase)
    await require_admin_role(x_user_id, x_organization_id, supabase=supabase)
    
    try:
        db_result = await execute_admin_decision_db(
            org_id=x_organization_id,
            approval_id=approval_id,
            action=body.action,
            admin_id=x_user_id,
        )
        
        try:
            await redis.enqueue_job(
                "send_decision_notifications",
                x_organization_id,
                approval_id,
                body.action,
                x_user_id,
                db_result,
            )
        except Exception as redis_err:
            logger.error(
                "notification_decision_enqueue_failed",
                approval_id=approval_id,
                org_id=x_organization_id,
                error=str(redis_err),
            )
            
        return NotificationDecisionResponse(
            success=True,
            status="approved" if body.action == "approve" else "rejected"
        )
        
    except HTTPException as http_ex:
        if http_ex.status_code == 409 or "ya procesada" in str(http_ex.detail).lower():
            return NotificationDecisionResponse(
                success=False,
                code="already_processed",
                error="This request was already processed."
            )
        raise http_ex
    except Exception as e:
        if "ya procesada" in str(e).lower() or "not found" in str(e).lower():
            return NotificationDecisionResponse(
                success=False,
                code="already_processed",
                error="This request was already processed."
            )
        raise HTTPException(status_code=400, detail=str(e))
