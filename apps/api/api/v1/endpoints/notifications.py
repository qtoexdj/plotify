from fastapi import APIRouter, Depends, HTTPException, status, Header
from arq.connections import ArqRedis
from dataclasses import asdict
from datetime import datetime, timezone
from uuid import UUID

from schemas.notification import (
    NotificationListResponse,
    NotificationItem,
    NotificationCounts,
    MarkReadResponse,
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


def _sale_approved_notification_copy(
    *,
    supabase,
    organization_id: str,
    project_id: str | None,
    lot_id: str,
    lot_label: str,
) -> AdminNotificationCopy | None:
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
    supabase,
    organization_id: str,
    request_type: str,
    status_val: str,
    project_id: str | None,
    lot_id: str,
    lot_label: str,
    project_name: str,
    client_name: str,
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
):
    """
    Lista las notificaciones de aprobaciones y solicitudes pendientes/recientes
    según el rol y la organización del usuario autenticado.
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
    
    # 1. Resolver el rol del usuario en la organización
    member_res = (
        supabase.table("organization_members")
        .select("role")
        .eq("organization_id", x_organization_id)
        .eq("user_id", x_user_id)
        .limit(1)
        .execute()
    )
    
    if not member_res.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario no es miembro de esta organización."
        )
        
    user_role = member_res.data[0]["role"]
    
    # 2. Consultar notificaciones en base de datos
    query = supabase.table("notification_events").select(
        "id, approval_id, recipient_role, read_at, dismissed_at, created_at, "
        "approval_requests!inner(id, request_type, status, vendor_name, payload, resolved_at, lot_id, "
        "lots!inner(id, numero_lote, projects!inner(id, name)))"
    ).eq("organization_id", x_organization_id)
    
    if user_role == "vendor":
        query = query.eq("recipient_id", x_user_id)
    else:
        query = query.eq("recipient_role", "admin")
        
    res = query.order("created_at", desc=True).execute()
    
    if not res.data:
        return NotificationListResponse(
            items=[],
            counts=NotificationCounts(pending=0, approved=0, rejected=0, unread=0)
        )
    
    items = []
    pending_cnt = 0
    approved_cnt = 0
    rejected_cnt = 0
    unread_cnt = 0
    
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
        copy = _notification_copy_for_item(
            supabase=supabase,
            organization_id=x_organization_id,
            request_type=request_type,
            status_val=status_val,
            project_id=str(project["id"]) if project.get("id") else None,
            lot_id=str(app_req.get("lot_id")),
            lot_label=lot_label,
            project_name=project_name,
            client_name=client_name,
        )
        copy_payload = asdict(copy) if copy else {}
        
        # Conteo
        if status_val == "pending":
            pending_cnt += 1
        elif status_val == "approved":
            approved_cnt += 1
        elif status_val == "rejected":
            rejected_cnt += 1
            
        if not read_at_val:
            unread_cnt += 1
            
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
                can_decide=(user_role == "admin" and status_val == "pending"),
                read_at=read_at_val,
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
    member_res = (
        supabase.table("organization_members")
        .select("role")
        .eq("organization_id", notification["organization_id"])
        .eq("user_id", x_user_id)
        .limit(1)
        .execute()
    )
    
    if not member_res.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No autorizado para marcar esta notificación. El usuario no pertenece a la organización."
        )
        
    user_role = member_res.data[0]["role"]
    
    # Si el usuario es vendedor, debe coincidir estrictamente su recipient_id para evitar leaks entre vendedores
    if user_role == "vendor":
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
