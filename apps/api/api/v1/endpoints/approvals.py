from fastapi import APIRouter, Depends, HTTPException, status
from arq.connections import ArqRedis
from schemas.approval import (
    ReservationRequest,
    ReservationResponse,
    DecisionResponse,
    ApprovalRequestDetailResponse,
    SaleRequest,
)
from core.config import get_settings
from core.database import get_supabase_client
from core.logger import get_logger
from core.redis import get_arq_pool
from api.deps import require_lot_organization, verify_internal_secret, require_admin_role
from workers.tasks.approval_processor import execute_admin_decision_db

router = APIRouter(dependencies=[Depends(verify_internal_secret)])
logger = get_logger(__name__)
settings = get_settings()


@router.post(
    "/request-reservation",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ReservationResponse,
    operation_id="requestReservationApproval",
)
async def request_reservation(
    body: ReservationRequest,
    redis: ArqRedis = Depends(get_arq_pool),
):
    """
    Recibe una solicitud de reserva desde el Frontend.
    1. Valida que el lote esté disponible.
    2. Valida que no haya otra solicitud pendiente para ese lote.
    3. Inserta en approval_requests.
    4. Encola notificación al Admin vía Redis.
    """
    supabase = get_supabase_client()

    try:
        # 1. Validar lote disponible
        lot_res = (
            supabase.table("lots")
            .select("id, estado, numero_lote, project_id, precio, valor_reserva, projects!inner(organization_id)")
            .eq("id", body.lot_id)
            .limit(1)
            .execute()
        )
        if not lot_res.data:
            raise HTTPException(status_code=404, detail="Lote no encontrado.")
        lot = lot_res.data[0]
        organization_id = await require_lot_organization(
            body.lot_id, body.organization_id, supabase=supabase
        )
        if lot["estado"] != "disponible":
            raise HTTPException(
                status_code=409,
                detail=f"El lote no está disponible (estado actual: {lot['estado']}).",
            )

        # 1.5. Validar asignación del vendedor al proyecto (vendor_projects)
        vp_res = (
            supabase.table("vendor_projects")
            .select("vendor_id")
            .eq("vendor_id", body.vendor_id)
            .eq("project_id", lot["project_id"])
            .limit(1)
            .execute()
        )
        if not vp_res.data:
            raise HTTPException(
                status_code=403,
                detail="El vendedor no está asignado a este proyecto.",
            )

        # 2. Validar que no haya solicitud pendiente (doble check, el DB constraint lo bloquea igual)
        pending_res = (
            supabase.table("approval_requests")
            .select("id")
            .eq("lot_id", body.lot_id)
            .eq("status", "pending")
            .limit(1)
            .execute()
        )
        if pending_res.data:
            raise HTTPException(
                status_code=409,
                detail="Ya existe una solicitud de reserva pendiente para este lote.",
            )

        # 2.5. Obtener teléfono del vendedor si viene vacío del frontend
        vendor_phone = body.vendor_phone
        if not vendor_phone:
            profile_res = (
                supabase.table("profiles")
                .select("phone, telegram_chat_id")
                .eq("id", body.vendor_id)
                .limit(1)
                .execute()
            )
            if profile_res.data:
                profile = profile_res.data[0]
                # Dependiendo de la plataforma configurada o preferida
                if body.vendor_platform == "telegram" and profile.get(
                    "telegram_chat_id"
                ):
                    vendor_phone = profile["telegram_chat_id"]
                elif profile.get("phone"):
                    vendor_phone = profile["phone"]

        # 3. Insertar solicitud
        insert_data = {
            "lot_id": body.lot_id,
            "organization_id": organization_id,
            "vendor_id": body.vendor_id,
            "vendor_name": body.vendor_name,
            "vendor_phone": vendor_phone,
            "vendor_platform": body.vendor_platform,
            "payload": body.payload.model_dump(mode="json"),
            "status": "pending",
        }
        insert_res = supabase.table("approval_requests").insert(insert_data).execute()

        if not insert_res.data:
            raise HTTPException(
                status_code=500, detail="Error al crear la solicitud de aprobación."
            )

        approval_id = insert_res.data[0]["id"]

        # 4. Encolar notificación al admin
        await redis.enqueue_job("notify_admin_approval", approval_id)
        logger.info(
            "Solicitud de reserva creada y encolada.",
            approval_id=approval_id,
            lot_id=body.lot_id,
        )

        return ReservationResponse(approval_id=approval_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error procesando solicitud de reserva.", error=str(e))
        raise HTTPException(
            status_code=500, detail="Error interno procesando la solicitud."
        )


@router.post(
    "/request-sale",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ReservationResponse,
    operation_id="requestSaleApproval",
)
async def request_sale(
    body: SaleRequest,
    redis: ArqRedis = Depends(get_arq_pool),
):
    """
    Recibe una solicitud de venta desde el Frontend.
    1. Valida que el lote esté reservado.
    2. Valida que no haya otra solicitud de venta pendiente para ese lote.
    3. Inserta en approval_requests.
    4. Encola notificación al Admin vía Redis.
    """
    supabase = get_supabase_client()

    try:
        # 1. Validar lote disponible o reservado
        lot_res = (
            supabase.table("lots")
            .select("id, estado, numero_lote, project_id, precio, projects!inner(organization_id)")
            .eq("id", body.lot_id)
            .limit(1)
            .execute()
        )
        if not lot_res.data:
            raise HTTPException(status_code=404, detail="Lote no encontrado.")
        lot = lot_res.data[0]
        organization_id = await require_lot_organization(
            body.lot_id, body.organization_id, supabase=supabase
        )
        if lot["estado"] not in ["disponible", "reservado"]:
            raise HTTPException(
                status_code=409,
                detail=f"El lote no está disponible ni reservado (estado actual: {lot['estado']}).",
            )

        # 1.5. Validar asignación del vendedor al proyecto (vendor_projects)
        vp_res = (
            supabase.table("vendor_projects")
            .select("vendor_id")
            .eq("vendor_id", body.vendor_id)
            .eq("project_id", lot["project_id"])
            .limit(1)
            .execute()
        )
        if not vp_res.data:
            raise HTTPException(
                status_code=403,
                detail="El vendedor no está asignado a este proyecto.",
            )

        # 2. Validar que no haya NINGUNA solicitud pendiente en total para este lote (bloqueo global)
        pending_res = (
            supabase.table("approval_requests")
            .select("id")
            .eq("lot_id", body.lot_id)
            .eq("status", "pending")
            .limit(1)
            .execute()
        )
        if pending_res.data:
            raise HTTPException(
                status_code=409,
                detail="Ya existe una solicitud pendiente para este lote.",
            )

        # 2.5. Obtener teléfono del vendedor si viene vacío del frontend
        vendor_phone = body.vendor_phone
        if not vendor_phone:
            profile_res = (
                supabase.table("profiles")
                .select("phone, telegram_chat_id")
                .eq("id", body.vendor_id)
                .limit(1)
                .execute()
            )
            if profile_res.data:
                profile = profile_res.data[0]
                if body.vendor_platform == "telegram" and profile.get("telegram_chat_id"):
                    vendor_phone = profile["telegram_chat_id"]
                elif profile.get("phone"):
                    vendor_phone = profile["phone"]

        # 3. Insertar solicitud
        insert_data = {
            "lot_id": body.lot_id,
            "organization_id": organization_id,
            "vendor_id": body.vendor_id,
            "vendor_name": body.vendor_name,
            "vendor_phone": vendor_phone,
            "vendor_platform": body.vendor_platform,
            "payload": body.payload.model_dump(mode="json"),
            "status": "pending",
            "request_type": "sale",
            "sale_mode": "direct" if lot["estado"] == "disponible" else "reserved",
            "previous_lot_state": lot["estado"],
        }
        insert_res = supabase.table("approval_requests").insert(insert_data).execute()

        if not insert_res.data:
            raise HTTPException(
                status_code=500, detail="Error al crear la solicitud de aprobación de venta."
            )

        approval_id = insert_res.data[0]["id"]

        # 4. Encolar notificación al admin
        await redis.enqueue_job("notify_admin_approval", approval_id)
        logger.info(
            "Solicitud de venta creada y encolada.",
            approval_id=approval_id,
            lot_id=body.lot_id,
        )

        return ReservationResponse(approval_id=approval_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error procesando solicitud de venta.", error=str(e))
        raise HTTPException(
            status_code=500, detail="Error interno procesando la solicitud."
        )


import asyncio
from pydantic import BaseModel, Field
from typing import Any

async def get_approval_organization_id(approval_id: str, supabase: Any | None = None) -> str:
    from core.database import get_supabase_client
    client = supabase or get_supabase_client()

    result = await asyncio.to_thread(
        lambda: (
            client.table("approval_requests")
            .select("id, organization_id")
            .eq("id", approval_id)
            .single()
            .execute()
        )
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Solicitud de aprobación no encontrada.")

    row = result.data[0] if isinstance(result.data, list) else result.data
    return row.get("organization_id")


async def require_approval_organization(
    approval_id: str,
    claimed_organization_id: str,
    supabase: Any | None = None,
) -> str:
    organization_id = await get_approval_organization_id(approval_id, supabase=supabase)
    if organization_id != claimed_organization_id:
        raise HTTPException(
            status_code=403,
            detail="organization_id no corresponde a la solicitud de aprobación.",
        )
    return organization_id


@router.get(
    "/{approval_id}",
    status_code=status.HTTP_200_OK,
    response_model=ApprovalRequestDetailResponse,
    operation_id="getApprovalRequest",
)
async def get_approval_request(
    approval_id: str,
    organization_id: str,
):
    """
    Obtiene el detalle de una solicitud de aprobación.
    Valida que pertenezca a la organización reclamada (multi-tenant).
    """
    supabase = get_supabase_client()
    await require_approval_organization(approval_id, organization_id, supabase=supabase)

    res = supabase.table("approval_requests").select("*").eq("id", approval_id).single().execute()
    return res.data


class DecisionRequest(BaseModel):
    action: str = Field(..., pattern=r"^(approve|reject)$")
    organization_id: str
    admin_id: str


@router.post(
    "/{approval_id}/decide",
    status_code=status.HTTP_200_OK,
    response_model=DecisionResponse,
    operation_id="decideApprovalRequest",
)
async def decide_approval_request(
    approval_id: str,
    body: DecisionRequest,
    redis: ArqRedis = Depends(get_arq_pool),
):
    """
    Procesa la decisión de un admin por la vía web.
    Valida multi-tenant y encola el procesamiento.
    """
    supabase = get_supabase_client()
    await require_approval_organization(approval_id, body.organization_id, supabase=supabase)
    
    # Validar que el admin_id tenga rol admin en la organizacion
    await require_admin_role(body.admin_id, body.organization_id, supabase=supabase)

    # Ejecutar la decision en la base de datos de forma sincrona (usando asyncio.to_thread por debajo)
    # Si falla (ej: ya procesado), lanzara HTTPException(status_code=409) o ValueError
    try:
        db_result = await execute_admin_decision_db(
            org_id=body.organization_id,
            approval_id=approval_id,
            action=body.action,
            admin_id=body.admin_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Encolar únicamente el envío de notificaciones en Redis de forma asíncrona.
    # Si Redis falla, logueamos el error pero devolvemos éxito ya que la DB ya mutó exitosamente.
    try:
        await redis.enqueue_job(
            "send_decision_notifications",
            body.organization_id,
            approval_id,
            body.action,
            body.admin_id,
            db_result,
        )
    except Exception as redis_err:
        logger.error(
            "notification_enqueue_failed",
            approval_id=approval_id,
            org_id=body.organization_id,
            error=str(redis_err),
        )

    return DecisionResponse(success=True)

