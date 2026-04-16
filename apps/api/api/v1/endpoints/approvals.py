from fastapi import APIRouter, Depends, HTTPException, status
from arq.connections import ArqRedis
from schemas.approval import ReservationRequest, ReservationResponse
from core.config import get_settings
from core.database import get_supabase_client
from core.logger import get_logger
from core.redis import get_arq_pool
from api.deps import require_lot_organization, verify_internal_secret

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
