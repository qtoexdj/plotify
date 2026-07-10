import asyncio
from typing import Optional, Dict, Any
from fastapi import HTTPException
from arq.connections import ArqRedis

from core.database import get_supabase_client
from core.logger import get_logger
from api.deps import require_lot_organization

logger = get_logger(__name__)

async def create_reservation_request_service(
    lot_id: str,
    organization_id: str,
    vendor_id: str,
    vendor_name: str,
    vendor_phone: Optional[str],
    vendor_platform: str,
    buyer_payload: Dict[str, Any],
    redis: ArqRedis,
    supabase: Any = None,
    idempotency_key: str | None = None,
) -> Dict[str, Any]:
    """
    Servicio centralizado de creación de solicitudes de reserva.
    1. Valida lote disponible.
    2. Valida asignación del vendedor al proyecto.
    3. Valida duplicados de reservas pendientes.
    4. Resuelve teléfono del vendedor si no es provisto.
    5. Inserta solicitud de aprobación.
    6. Encola notificación al Admin en Redis.
    """
    client = supabase or get_supabase_client()

    # 1. Validar existencia del lote y que esté disponible
    def _fetch_lot():
        return (
            client.table("lots")
            .select("id, estado, numero_lote, project_id, precio, valor_reserva, projects!inner(organization_id)")
            .eq("id", lot_id)
            .limit(1)
            .execute()
        )
    
    lot_res = await asyncio.to_thread(_fetch_lot)
    if not lot_res.data:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")
    
    lot = lot_res.data[0]
    
    # 2. Validar pertenencia multi-tenant
    resolved_org_id = await require_lot_organization(
        lot_id, organization_id, supabase=client
    )

    if lot["estado"] != "disponible":
        raise HTTPException(
            status_code=409,
            detail=f"El lote no está disponible (estado actual: {lot['estado']}).",
        )

    # 3. Validar asignación del vendedor al proyecto (vendor_projects)
    def _fetch_vendor_project():
        return (
            client.table("vendor_projects")
            .select("vendor_id")
            .eq("vendor_id", vendor_id)
            .eq("project_id", lot["project_id"])
            .limit(1)
            .execute()
        )
    
    vp_res = await asyncio.to_thread(_fetch_vendor_project)
    if not vp_res.data:
        raise HTTPException(
            status_code=403,
            detail="El vendedor no está asignado a este proyecto.",
        )

    # 4. Validar reservas duplicadas pendientes para ese lote
    def _fetch_pending_reservations():
        return (
            client.table("approval_requests")
            .select("id")
            .eq("lot_id", lot_id)
            .eq("status", "pending")
            .limit(1)
            .execute()
        )
    
    pending_res = await asyncio.to_thread(_fetch_pending_reservations)
    if pending_res.data:
        raise HTTPException(
            status_code=409,
            detail="Ya existe una solicitud de reserva pendiente para este lote.",
        )

    # 5. Resolver teléfono/chat del vendedor si viene vacío
    resolved_vendor_phone = vendor_phone
    if not resolved_vendor_phone:
        def _fetch_profile():
            return (
                client.table("profiles")
                .select("phone, telegram_chat_id")
                .eq("id", vendor_id)
                .limit(1)
                .execute()
            )
        profile_res = await asyncio.to_thread(_fetch_profile)
        if profile_res.data:
            profile = profile_res.data[0]
            if vendor_platform == "telegram" and profile.get("telegram_chat_id"):
                resolved_vendor_phone = str(profile["telegram_chat_id"])
            elif profile.get("phone"):
                resolved_vendor_phone = profile["phone"]

    # 6. Preparar payload del comprador
    payload_data = buyer_payload.copy()
    if "valor_reserva" not in payload_data or not payload_data["valor_reserva"]:
        payload_data["valor_reserva"] = float(lot.get("valor_reserva") or 0.0)

    insert_data = {
        "lot_id": lot_id,
        "organization_id": resolved_org_id,
        "vendor_id": vendor_id,
        "vendor_name": vendor_name,
        "vendor_phone": resolved_vendor_phone,
        "vendor_platform": vendor_platform,
        "payload": payload_data,
        "status": "pending",
        "idempotency_key": idempotency_key,
    }

    def _insert_approval():
        if not idempotency_key:
            return client.table("approval_requests").insert(insert_data).execute()
        return (
            client.table("approval_requests")
            .upsert(
                insert_data,
                on_conflict="organization_id,vendor_id,idempotency_key",
                ignore_duplicates=True,
            )
            .execute()
        )
    
    insert_res = await asyncio.to_thread(_insert_approval)
    created = bool(insert_res.data)
    if created:
        approval_record = insert_res.data[0]
    elif idempotency_key:
        def _fetch_idempotent_request():
            return (
                client.table("approval_requests")
                .select("*")
                .eq("organization_id", resolved_org_id)
                .eq("vendor_id", vendor_id)
                .eq("idempotency_key", idempotency_key)
                .limit(1)
                .execute()
            )

        existing_res = await asyncio.to_thread(_fetch_idempotent_request)
        if not existing_res.data:
            raise HTTPException(status_code=500, detail="Error al recuperar la solicitud idempotente.")
        approval_record = existing_res.data[0]
    else:
        raise HTTPException(status_code=500, detail="Error al crear la solicitud de aprobación.")

    approval_record["_created"] = created
    approval_id = approval_record["id"]

    # 7. Encolar notificación al admin vía Redis
    if created:
        await redis.enqueue_job("notify_admin_approval", approval_id)
    
    logger.info(
        "Solicitud de reserva creada exitosamente vía servicio compartido.",
        approval_id=approval_id,
        lot_id=lot_id,
    )

    return approval_record
