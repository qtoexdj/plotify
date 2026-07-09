import uuid
import json
import asyncio
from fastapi import APIRouter, HTTPException, Depends, status, Header
from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field

from core.config import get_settings
from core.logger import get_logger
from core.database import get_supabase_client
from core.redis import get_arq_pool
from services.reservations import create_reservation_request_service
from services.escritura_operational_bridge import compose_deslindes_text
from utils.audit import log_agent_action
from schemas.approval import ReservationResponse
from core.miniapp_session import (
    validate_telegram_init_data,
    create_miniapp_session,
    resolve_miniapp_user,
    verify_miniapp_session,
    require_miniapp_admin,
    MiniappUserContext
)
from schemas.miniapp import (
    MiniappSessionRequest,
    MiniappSessionResponse,
    MiniappUserDetail,
    MiniappVincularSolicitarRequest,
    MiniappVincularConfirmarRequest,
    BandejaItem,
    BandejaDetail,
    AdminDecisionRequest,
    DiscrepanciaVariable
)
from integrations.telegram_client import get_telegram_client_for_org

logger = get_logger(__name__)
router = APIRouter()


@router.get("/health", tags=["miniapp"])
async def miniapp_health():
    """Health check endpoint for the Mini App router."""
    return {"status": "ok", "message": "Mini App router initialized"}


@router.post("/session", response_model=MiniappSessionResponse, tags=["miniapp"])
async def create_session(payload: MiniappSessionRequest):
    """
    Autentica al usuario de la Mini App mediante initData de Telegram y emite un token de sesión.
    """
    logger.info(f"Intento de autenticación de sesión de Mini App para org: {payload.org_id}")
    
    # 1. Obtener cliente de Telegram de la org para rescatar su bot token secreto
    client = await get_telegram_client_for_org(str(payload.org_id))
    if not client or not getattr(client, "bot_token", None):
        logger.warning(f"Organización {payload.org_id} no tiene bot de Telegram configurado")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization telegram bot not configured"
        )
        
    # 2. Validar firma e integridad de initData
    is_valid, parsed_data = validate_telegram_init_data(client.bot_token, payload.init_data)
    if not is_valid or not parsed_data:
        error_type = (parsed_data or {}).get("error", "invalid")
        logger.warning(f"Fallo en validación de initData de Telegram: {error_type}")
        await log_agent_action(
            actor="anonymous",
            action="miniapp.session_rejected",
            entity="organizations",
            entity_id=str(payload.org_id),
            organization_id=str(payload.org_id),
            payload={"reason": error_type, "channel": "miniapp"}
        )
        if error_type == "expired":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="initdata_expired"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_initdata"
            )
            
    # 3. Extraer chat_id del usuario de Telegram
    tg_user = parsed_data.get("user")
    if not tg_user or not isinstance(tg_user, dict) or "id" not in tg_user:
        logger.warning("Falta el objeto user en parsed initData")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_initdata"
        )
        
    chat_id = tg_user["id"]
    
    # 4. Resolver usuario y membresía en Supabase
    error_status, user_detail = await resolve_miniapp_user(str(payload.org_id), str(chat_id))
    if error_status:
        logger.warning(f"Validación de membresía fallida: {error_status} para chat_id: {chat_id}")
        await log_agent_action(
            actor=str(chat_id),
            action="miniapp.session_rejected",
            entity="organizations",
            entity_id=str(payload.org_id),
            organization_id=str(payload.org_id),
            payload={"reason": error_status, "chat_id": chat_id, "channel": "miniapp"}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error_status
        )
        
    if not user_detail:
        logger.error("Error inesperado: resolve_miniapp_user retornó éxito pero no retornó user_detail")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error resolviendo contexto de usuario"
        )
        
    # 5. Generar JWT de sesión corta
    token = create_miniapp_session(
        user_id=user_detail["user_id"],
        org_id=user_detail["org_id"],
        role=user_detail["role"],
        chat_id=chat_id
    )
    
    settings = get_settings()
    logger.info(f"Sesión Mini App creada exitosamente para user: {user_detail['user_id']} ({user_detail['role']})")

    await log_agent_action(
        actor=user_detail["user_id"],
        action="miniapp.session_issued",
        entity="organizations",
        entity_id=user_detail["org_id"],
        organization_id=user_detail["org_id"],
        payload={"role": user_detail["role"], "chat_id": chat_id, "channel": "miniapp"}
    )

    return MiniappSessionResponse(
        token=token,
        expires_in=settings.MINIAPP_SESSION_EXPIRE_SECONDS,
        role=user_detail["role"],
        user=MiniappUserDetail(
            id=user_detail["user_id"],
            nombre=user_detail["nombre"],
            org_id=user_detail["org_id"],
            org_nombre=user_detail["org_nombre"]
        )
    )


# --- LINK / ONBOARDING ENDPOINTS ---
import time
import random
from core.database import get_supabase_client

# Almacenamiento en memoria para OTPs (en producción se usaría Redis, pero para el MVP esto es perfecto)
# Clave: f"{org_id}:{chat_id}" -> {"email": "...", "code": "...", "expires_at": ...}
_VINCULACION_OTP_STORE: Dict[str, Dict[str, Any]] = {}


@router.post("/vincular/solicitar", tags=["miniapp"])
async def solicitar_vinculacion(payload: MiniappVincularSolicitarRequest):
    """
    Solicita la vinculación de Telegram ingresando el correo registrado en Plotify.
    Si el correo pertenece a la organización, envía un código OTP de 6 dígitos al chat de Telegram usando el bot de la org.
    """
    logger.info(f"Solicitud de OTP de vinculación para email: {payload.email}, chat_id: {payload.chat_id}, org: {payload.org_id}")
    
    # 1. Obtener cliente de Supabase
    supabase = get_supabase_client()
    
    # 2. Buscar si el correo existe en profiles y tiene una membresía en la organización especificada
    query = (
        supabase.table("profiles")
        .select("id, name, user_organization_memberships!inner(organization_id, role)")
        .eq("email", payload.email.strip().lower())
        .eq("user_organization_memberships.organization_id", str(payload.org_id))
    )
    res = query.execute()
    
    if not res.data:
        logger.warning(f"Email {payload.email} no encontrado o sin membresía en org: {payload.org_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="email_not_registered"
        )
        
    profile = res.data[0]
    
    # 3. Generar OTP de 6 dígitos
    otp_code = f"{random.randint(100000, 999999)}"
    
    # 4. Guardar en memoria con 5 minutos de expiración
    store_key = f"{payload.org_id}:{payload.chat_id}"
    _VINCULACION_OTP_STORE[store_key] = {
        "email": payload.email.strip().lower(),
        "code": otp_code,
        "expires_at": time.time() + 300  # 5 minutos
    }
    
    # 5. Obtener cliente de Telegram de la org para enviar el OTP
    client = await get_telegram_client_for_org(str(payload.org_id))
    if not client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="telegram_client_error"
        )
        
    # Enviar mensaje
    message_text = (
        f"🔐 *Código de Vinculación Plotify*\n\n"
        f"Tu código de confirmación es: *{otp_code}*\n"
        f"Válido por 5 minutos.\n\n"
        f"Ingresa este código en tu Mini App para completar el enlace."
    )
    
    try:
        await client.send_text(str(payload.chat_id), message_text)
    except Exception as e:
        logger.error(f"Fallo al enviar OTP por Telegram al chat_id {payload.chat_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="telegram_delivery_error"
        )
        
    return {"status": "otp_sent"}


@router.post("/vincular/confirmar", tags=["miniapp"])
async def confirmar_vinculacion(payload: MiniappVincularConfirmarRequest):
    """
    Confirma el código OTP. Si es correcto, vincula el telegram_chat_id del perfil.
    """
    store_key = f"{payload.org_id}:{payload.chat_id}"
    otp_data = _VINCULACION_OTP_STORE.get(store_key)
    
    if not otp_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="otp_not_found"
        )
        
    if time.time() > otp_data["expires_at"]:
        _VINCULACION_OTP_STORE.pop(store_key, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="otp_expired"
        )
        
    if otp_data["code"] != payload.code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="otp_invalid"
        )
        
    if otp_data["email"] != payload.email.strip().lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="otp_email_mismatch"
        )
        
    # El código es válido. Proceder a actualizar el perfil en Supabase.
    supabase = get_supabase_client()
    
    # 1. Obtener id del perfil
    res = supabase.table("profiles").select("id").eq("email", otp_data["email"]).execute()
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="profile_not_found"
        )
        
    profile_id = res.data[0]["id"]
    
    # 2. Actualizar telegram_chat_id en el perfil
    update_res = (
        supabase.table("profiles")
        .update({"telegram_chat_id": str(payload.chat_id)})
        .eq("id", profile_id)
        .execute()
    )
    
    if not update_res.data:
        logger.error(f"Fallo al actualizar telegram_chat_id en perfil {profile_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="database_update_failed"
        )
        
    # Limpiar OTP usado
    _VINCULACION_OTP_STORE.pop(store_key, None)
    
    logger.info(f"Perfil {profile_id} vinculado exitosamente con telegram_chat_id: {payload.chat_id}")
    return {"status": "linked"}


# --- BANDEJA ADMIN ENDPOINTS (US2) ---
from datetime import datetime, timezone
import dateutil.parser
from workers.tasks.approval_processor import process_admin_decision


def _calcular_antiguedad(created_at_str: str) -> int:
    """Calcula la antigüedad en segundos de un registro."""
    try:
        dt = dateutil.parser.isoparse(created_at_str)
        now = datetime.now(timezone.utc)
        diff = now - dt
        return max(0, int(diff.total_seconds()))
    except Exception:
        return 0


async def reintentar_cascada_workflow(case_id: str):
    """Workflow helper para ejecutar el reintento de la cascada de aprobación por excepción."""
    from services.escritura_auto_pipeline import run_case_cascade
    supabase = get_supabase_client()
    case_res = (
        supabase.table("escritura_cases")
        .select("organization_id")
        .eq("id", case_id)
        .limit(1)
        .execute()
    )
    if not case_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Escritura case not found"
        )
    org_id = case_res.data[0]["organization_id"]
    return await run_case_cascade(
        organization_id=str(org_id),
        escritura_case_id=case_id,
        trigger="manual_retry",
        supabase=supabase
    )


@router.get("/bandeja", response_model=List[BandejaItem], tags=["miniapp"])
async def get_bandeja(
    context: MiniappUserContext = Depends(require_miniapp_admin)
):
    """
    Lista unificada de solicitudes pendientes y casos en excepción para la organización del administrador.
    """
    logger.info(f"Admin {context.user_id} consultando bandeja para org: {context.org_id}")
    supabase = get_supabase_client()
    items: List[BandejaItem] = []

    # 1. Obtener solicitudes de aprobación pendientes (tipo 'reservation' o 'sale')
    approvals_res = (
        supabase.table("approval_requests")
        .select("id, request_type, vendor_name, created_at, status, lot_id, lots(numero_lote)")
        .eq("organization_id", str(context.org_id))
        .eq("status", "pending")
        .execute()
    )
    
    for row in (approvals_res.data or []):
        numero_lote = (row.get("lots") or {}).get("numero_lote", "?")
        request_type = row.get("request_type", "reservation")
        tipo = "reserva" if request_type == "reservation" else "venta"
        
        items.append(
            BandejaItem(
                id=uuid.UUID(row["id"]),
                tipo=tipo,
                titulo=f"Solicitud de Reserva - Lote {numero_lote}" if tipo == "reserva" else f"Solicitud de Venta - Lote {numero_lote}",
                causa=f"Solicitada por {row.get('vendor_name', '?')}",
                antiguedad_segundos=_calcular_antiguedad(row["created_at"]),
                estado=row["status"]
            )
        )

    # 2. Obtener casos de escrituración en estado 'exception' (excepciones de cascada)
    cases_res = (
        supabase.table("escritura_cases")
        .select("id, lot_id, created_at, status, lots(numero_lote, projects(name)), escritura_cascade_runs(error_cause, causes)")
        .eq("organization_id", str(context.org_id))
        .eq("status", "exception")
        .execute()
    )

    for row in (cases_res.data or []):
        lot_data = row.get("lots") or {}
        numero_lote = lot_data.get("numero_lote", "?")
        project_name = (lot_data.get("projects") or {}).get("name", "Desconocido")
        
        # Buscar la causa del error en la cascada
        causa = "Excepción en cascada de escrituración"
        runs = row.get("escritura_cascade_runs") or []
        if isinstance(runs, list) and runs:
            # Tomar la última corrida de cascada
            latest_run = runs[0]
            causa = latest_run.get("error_cause") or latest_run.get("causes") or causa
            if isinstance(causa, list) and causa:
                causa = str(causa[0])

        items.append(
            BandejaItem(
                id=uuid.UUID(row["id"]),
                tipo="excepcion",
                titulo=f"Lote {numero_lote} — Proyecto: {project_name}",
                causa=causa,
                antiguedad_segundos=_calcular_antiguedad(row["created_at"]),
                estado=row["status"]
            )
        )

    # Ordenar unificadamente por antigüedad descendente (más nuevos primero o más antiguos primero dependiendo de la preferencia; de forma estándar el admin quiere ver lo más antiguo pendiente primero para que no expire)
    items.sort(key=lambda x: x.antiguedad_segundos, reverse=True)
    return items


@router.get("/bandeja/{item_id}", response_model=BandejaDetail, tags=["miniapp"])
async def get_bandeja_detail(
    item_id: uuid.UUID,
    tipo: str,  # "reserva" | "venta" | "excepcion"
    context: MiniappUserContext = Depends(require_miniapp_admin)
):
    """
    Obtiene el detalle completo de un ítem de la bandeja (ya sea solicitud de aprobación o excepción de cascada).
    """
    logger.info(f"Admin {context.user_id} consultando detalle de {tipo} con id: {item_id}")
    supabase = get_supabase_client()

    if tipo in {"reserva", "venta"}:
        # Obtener detalle de la solicitud de aprobación
        approval_res = (
            supabase.table("approval_requests")
            .select("*, lots(numero_lote, precio, projects(name))")
            .eq("id", str(item_id))
            .eq("organization_id", str(context.org_id))
            .limit(1)
            .execute()
        )
        if not approval_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found")
        
        row = approval_res.data[0]
        lot_data = row.get("lots") or {}
        payload = row.get("payload") or {}
        
        # Mapear comprador
        comprador = {
            "nombre": payload.get("cliente_nombre", "?"),
            "rut": payload.get("cliente_run", "?"),
            "email": payload.get("cliente_email", ""),
            "telefono": payload.get("cliente_telefono", "")
        }
        
        # Mapear detalles lote
        detalles_lote = {
            "numero": lot_data.get("numero_lote", "?"),
            "precio": lot_data.get("precio", 0),
            "proyecto": (lot_data.get("projects") or {}).get("name", "Desconocido")
        }
        
        return BandejaDetail(
            id=item_id,
            tipo=tipo,
            titulo=f"Solicitud de Reserva - Lote {detalles_lote['numero']}" if tipo == "reserva" else f"Solicitud de Venta - Lote {detalles_lote['numero']}",
            estado=row["status"],
            causa=f"Solicitada por {row.get('vendor_name', '?')}",
            antiguedad_segundos=_calcular_antiguedad(row["created_at"]),
            detalles_lote=detalles_lote,
            comprador=comprador,
            conflictos=[],
            evidencia_url=None
        )
        
    elif tipo == "excepcion":
        # Obtener detalle de la excepción de cascada
        case_res = (
            supabase.table("escritura_cases")
            .select("*, lots(numero_lote, precio, projects(name)), escritura_cascade_runs(error_cause, variables_state, created_at), escritura_deliveries(id, file_path)")
            .eq("id", str(item_id))
            .eq("organization_id", str(context.org_id))
            .limit(1)
            .execute()
        )
        if not case_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Escritura case not found")
        
        row = case_res.data[0]
        lot_data = row.get("lots") or {}
        
        detalles_lote = {
            "numero": lot_data.get("numero_lote", "?"),
            "precio": lot_data.get("precio", 0),
            "proyecto": (lot_data.get("projects") or {}).get("name", "Desconocido")
        }
        
        # Extraer conflictos (discrepancias variables)
        conflictos: List[DiscrepanciaVariable] = []
        causa = "Excepción en cascada de escrituración"
        
        runs = row.get("escritura_cascade_runs") or []
        if isinstance(runs, list) and runs:
            latest_run = runs[0]
            causa = latest_run.get("error_cause") or causa
            variables_state = latest_run.get("variables_state") or {}
            
            for var_name, state in variables_state.items():
                if isinstance(state, dict):
                    conflictos.append(
                        DiscrepanciaVariable(
                            nombre=var_name,
                            valor_certificado=str(state.get("certificado", "")),
                            valor_vendedor=str(state.get("vendedor", "")),
                            diferencia_detectada=str(state.get("diferencia", ""))
                        )
                    )

        # Extraer evidencia_url (enlace firmado del Storage)
        evidencia_url = None
        deliveries = row.get("escritura_deliveries") or []
        if isinstance(deliveries, list) and deliveries:
            delivery = deliveries[0]
            file_path = delivery.get("file_path")
            if file_path:
                try:
                    signed_res = supabase.storage.from_("minutas").create_signed_url(file_path, 3600)
                    evidencia_url = signed_res.get("signedURL")
                except Exception as e:
                    logger.error(f"Error al generar url firmada de evidencia para caso {item_id}: {str(e)}")

        return BandejaDetail(
            id=item_id,
            tipo="excepcion",
            titulo=f"Lote {detalles_lote['numero']} — Proyecto: {detalles_lote['proyecto']}",
            estado=row["status"],
            causa=causa,
            antiguedad_segundos=_calcular_antiguedad(row["created_at"]),
            detalles_lote=detalles_lote,
            comprador=None,
            conflictos=conflictos,
            evidencia_url=evidencia_url
        )
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de bandeja inválido")


@router.post("/bandeja/{approval_id}/decidir", tags=["miniapp"])
async def decidir_solicitud(
    approval_id: uuid.UUID,
    payload: AdminDecisionRequest,
    context: MiniappUserContext = Depends(require_miniapp_admin)
):
    """
    Ejecuta la decisión del administrador (approve o reject) sobre una solicitud de reserva/venta pendiente.
    """
    logger.info(f"Admin {context.user_id} decidiendo {payload.decision} sobre solicitud: {approval_id}")
    supabase = get_supabase_client()
    
    # 1. Verificar existencia de la solicitud en la org del administrador
    approval_res = (
        supabase.table("approval_requests")
        .select("id")
        .eq("id", str(approval_id))
        .eq("organization_id", str(context.org_id))
        .limit(1)
        .execute()
    )
    if not approval_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found")
        
    # 2. Invocar el job/proceso de decisión asíncrono
    try:
        result = await process_admin_decision(
            ctx={},
            org_id=str(context.org_id),
            approval_id=str(approval_id),
            action=payload.decision,
            admin_id=str(context.user_id),
            channel="miniapp"
        )
        if result != "SUCCESS" and "NOTIFY_FAILED" not in result:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Fallo al procesar decisión: {result}")
    except Exception as e:
        logger.error(f"Error al procesar decisión para solicitud {approval_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
        
    return {"status": "success", "message": f"Solicitud {payload.decision}d exitosamente"}


@router.post("/bandeja/{case_id}/reintentar-cascada", tags=["miniapp"])
async def reintentar_cascada(
    case_id: uuid.UUID,
    context: MiniappUserContext = Depends(require_miniapp_admin)
):
    """
    Reintenta el pipeline de cascada de aprobación para un caso de escrituración que quedó en excepción.
    """
    logger.info(f"Admin {context.user_id} reintentando cascada para caso: {case_id}")
    supabase = get_supabase_client()
    
    # 1. Verificar existencia del caso en la org del administrador
    case_res = (
        supabase.table("escritura_cases")
        .select("id")
        .eq("id", str(case_id))
        .eq("organization_id", str(context.org_id))
        .limit(1)
        .execute()
    )
    if not case_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Escritura case not found")
        
    # 2. Invocar el reintento de cascada
    try:
        outcome = await reintentar_cascada_workflow(case_id=str(case_id))
        return {
            "status": outcome.get("status") or "processing",
            "message": outcome.get("message") or "Cascade run executed successfully"
        }
    except Exception as e:
        logger.error(f"Error al reintentar cascada para caso {case_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


def humanizar_blocker(blocker_key: str) -> str:
    translations = {
        "missing_buyer_marital_status": "Falta definir el estado civil del comprador",
        "invalid_buyer_rut": "El RUT del comprador no es válido",
        "missing_buyer_signature": "Falta la firma del comprador en la documentación",
        "missing_legal_representative": "Falta el representante legal de la organización",
        "missing_evidence_url": "Falta adjuntar el documento de evidencia",
        "draft_not_found": "No se encontró el borrador de la minuta",
        "invalid_draft_content": "El contenido del borrador de la minuta posee discrepancias con la base de datos"
    }
    return translations.get(blocker_key, blocker_key.replace("_", " ").capitalize())


@router.get("/ventas", tags=["miniapp"])
async def get_ventas(
    context: MiniappUserContext = Depends(verify_miniapp_session)
):
    """
    Retorna el listado de ventas del vendedor autenticado con su etapa y blockers humanizados.
    """
    logger.info(f"Usuario {context.user_id} consultando sus ventas para org: {context.org_id}")
    supabase = get_supabase_client()
    
    query = (
        supabase.table("escritura_cases")
        .select("id, project_id, lot_id, vendedor_id, status, current_stage, blockers, created_at, projects(name), lots(numero_lote)")
        .eq("organization_id", str(context.org_id))
    )
    
    # Si el usuario es un vendedor, filtrar estrictamente para ver solo sus propios casos
    role_lower = context.role.lower()
    if role_lower in ["vendor", "vendedor"]:
        query = query.eq("vendedor_id", str(context.user_id))
        
    res = query.execute()
    
    ventas = []
    for row in res.data:
        blockers_raw = row.get("blockers") or []
        blockers_human = [humanizar_blocker(b) for b in blockers_raw]
        
        proj_name = row.get("projects", {}).get("name") if row.get("projects") else "Proyecto Desconocido"
        lot_num = row.get("lots", {}).get("numero_lote") if row.get("lots") else "S/N"
        
        ventas.append({
            "id": row["id"],
            "proyecto": proj_name,
            "numero_lote": lot_num,
            "status": row["status"],
            "etapa": row["current_stage"],
            "blockers": blockers_raw,
            "blockers_humanizados": blockers_human,
            "created_at": row["created_at"]
        })
        
    return ventas


@router.get("/ventas/{case_id}", tags=["miniapp"])
async def get_venta_detalle(
    case_id: uuid.UUID,
    context: MiniappUserContext = Depends(verify_miniapp_session)
):
    """
    Retorna el detalle de una venta específica con su etapa y blockers humanizados.
    """
    logger.info(f"Usuario {context.user_id} consultando detalle de venta {case_id}")
    supabase = get_supabase_client()
    
    query = (
        supabase.table("escritura_cases")
        .select("id, project_id, lot_id, vendedor_id, status, current_stage, blockers, created_at, projects(name), lots(numero_lote)")
        .eq("id", str(case_id))
        .eq("organization_id", str(context.org_id))
    )
    
    # Si es vendedor, verificar que sea el dueño del caso
    role_lower = context.role.lower()
    if role_lower in ["vendor", "vendedor"]:
        query = query.eq("vendedor_id", str(context.user_id))
        
    res = query.limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venta no encontrada")
        
    row = res.data[0]
    blockers_raw = row.get("blockers") or []
    blockers_human = [humanizar_blocker(b) for b in blockers_raw]
    
    proj_name = row.get("projects", {}).get("name") if row.get("projects") else "Proyecto Desconocido"
    lot_num = row.get("lots", {}).get("numero_lote") if row.get("lots") else "S/N"
    
    return {
        "id": row["id"],
        "proyecto": proj_name,
        "numero_lote": lot_num,
        "status": row["status"],
        "etapa": row["current_stage"],
        "blockers": blockers_raw,
        "blockers_humanizados": blockers_human,
        "created_at": row["created_at"]
    }


@router.get("/documentos", tags=["miniapp"])
async def get_documentos(
    context: MiniappUserContext = Depends(verify_miniapp_session)
):
    """
    Retorna el listado de documentos/minutas entregados de las ventas del vendedor.
    Genera un enlace firmado temporal para la descarga.
    """
    logger.info(f"Usuario {context.user_id} consultando sus documentos para org: {context.org_id}")
    supabase = get_supabase_client()
    
    # 1. Obtener entregas
    query = (
        supabase.table("escritura_deliveries")
        .select("id, escritura_case_id, file_path, delivered_at, expires_at, escritura_cases(vendedor_id, organization_id, projects(name), lots(numero_lote))")
    )
    
    res = query.execute()
    
    deliveries = []
    from datetime import datetime, timezone
    import dateutil.parser
    
    for row in res.data:
        case_data = row.get("escritura_cases") or {}
        
        # Validar organización
        if str(case_data.get("organization_id")) != str(context.org_id):
            continue
            
        # Si es vendedor, verificar que el caso sea suyo
        role_lower = context.role.lower()
        if role_lower in ["vendor", "vendedor"]:
            if str(case_data.get("vendedor_id")) != str(context.user_id):
                continue
                
        # Verificar expiración del link de descarga guardado
        expires_at_str = row.get("expires_at")
        vencido = True
        if expires_at_str:
            try:
                expires_dt = dateutil.parser.isoparse(expires_at_str)
                vencido = expires_dt < datetime.now(timezone.utc)
            except Exception:
                pass
                
        # Generar enlace firmado de Supabase Storage (bucket "minutas")
        url_descarga = ""
        file_path = row.get("file_path")
        if file_path:
            try:
                signed_res = supabase.storage.from_("minutas").create_signed_url(file_path, 7 * 24 * 3600)
                url_descarga = signed_res.get("signedURL") or ""
            except Exception as e:
                logger.error(f"Error generando URL firmada para {file_path}: {str(e)}")
                
        proj_name = case_data.get("projects", {}).get("name") if case_data.get("projects") else "Proyecto Desconocido"
        lot_num = case_data.get("lots", {}).get("numero_lote") if case_data.get("lots") else "S/N"
        
        deliveries.append({
            "id": row["id"],
            "escritura_case_id": row["escritura_case_id"],
            "proyecto": proj_name,
            "numero_lote": lot_num,
            "file_path": file_path,
            "url_descarga": url_descarga,
            "delivered_at": row["delivered_at"],
            "expires_at": expires_at_str,
            "vencido": vencido
        })
        
    return deliveries


@router.get("/proyectos/{project_id}/mapa", tags=["miniapp"])
async def get_proyecto_mapa(
    project_id: str,
    context: MiniappUserContext = Depends(verify_miniapp_session)
):
    """
    Retorna el mapa GeoJSON FeatureCollection de lotes del proyecto.
    """
    logger.info(f"Usuario {context.user_id} consultando mapa de proyecto {project_id}")
    supabase = get_supabase_client()

    # Base "geometries": lots<->geometries tiene dos FKs (lots.geometry_id y
    # geometries.lot_id), así que se consulta desde geometries con el hint
    # explícito, igual que apps/web/src/lib/services/viewer.service.ts.
    res = (
        supabase.table("geometries")
        .select("id, geometry, lots!geometries_lot_id_fkey(id, numero_lote, estado)")
        .eq("project_id", project_id)
        .not_.is_("lot_id", "null")
        .execute()
    )

    features = []
    for item in res.data:
        lot = item.get("lots") or {}
        if isinstance(lot, list):
            lot = lot[0] if lot else {}
        geom = item.get("geometry")

        if not geom or not lot:
            continue

        features.append({
            "type": "Feature",
            "id": lot.get("id"),
            "geometry": geom,
            "properties": {
                "numero_lote": lot.get("numero_lote"),
                "status": lot.get("estado")
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }


@router.get("/lotes/{lot_id}", tags=["miniapp"])
async def get_lote_detalle(
    lot_id: str,
    context: MiniappUserContext = Depends(verify_miniapp_session)
):
    """
    Retorna la ficha técnica de un lote específico.
    """
    logger.info(f"Usuario {context.user_id} consultando detalle de lote {lot_id}")
    supabase = get_supabase_client()

    # "numero_rol" y "deslindes" no son columnas de lots: el rol vive en
    # lot_legal_data (pipeline SII) y los deslindes se componen desde el
    # jsonb boundaries_official con el mismo helper que usa la escritura.
    res = (
        supabase.table("lots")
        .select(
            "id, project_id, numero_lote, estado, area_official_m2, superficie_neta_m2, "
            "m2, precio, boundaries_official, projects(name), "
            "lot_legal_data(sii_definitive_role, sii_pre_role, sii_role_in_process_text)"
        )
        .eq("id", lot_id)
        .limit(1)
        .execute()
    )

    if not res.data:
        raise HTTPException(status_code=404, detail="Lote no encontrado")

    row = res.data[0]
    proj_name = row.get("projects", {}).get("name") if row.get("projects") else "Proyecto Desconocido"

    legal_data = row.get("lot_legal_data") or {}
    if isinstance(legal_data, list):
        legal_data = legal_data[0] if legal_data else {}
    numero_rol = (
        legal_data.get("sii_definitive_role")
        or legal_data.get("sii_pre_role")
        or legal_data.get("sii_role_in_process_text")
    )

    superficie = row.get("area_official_m2") or row.get("superficie_neta_m2") or row.get("m2")
    deslindes = compose_deslindes_text(row.get("boundaries_official"))

    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "numero_lote": row.get("numero_lote"),
        "status": row.get("estado"),
        "superficie": superficie,
        "precio": row.get("precio"),
        "numero_rol": numero_rol,
        "deslindes": deslindes,
        "proyecto_nombre": proj_name
    }


class MiniappReservationRequest(BaseModel):
    lot_id: str
    buyer_name: str = Field(..., min_length=2)
    buyer_rut: str = Field(..., min_length=7)
    buyer_email: str = Field(..., pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
    buyer_phone: str = Field(..., pattern=r"^\+?[1-9]\d{1,14}$")
    payment_method: str
    payment_evidence_url: Optional[str] = None
    observation: Optional[str] = None


@router.post("/reservas", status_code=status.HTTP_201_CREATED, response_model=ReservationResponse, tags=["miniapp"])
async def crear_reserva_miniapp(
    body: MiniappReservationRequest,
    x_idempotency_key: Optional[str] = Header(None, alias="X-Idempotency-Key"),
    session: MiniappUserContext = Depends(verify_miniapp_session),
    redis: Any = Depends(get_arq_pool)
):
    """
    Crea una solicitud de reserva desde el frontend de la Mini App para vendedores.
    Aplica controles de idempotencia basados en la clave de cabecera X-Idempotency-Key y Redis.
    """
    logger.info(f"Vendedor {session.user_id} intentando crear reserva para lote {body.lot_id}")
    
    # 1. Comprobar Idempotencia en Redis si se provee la clave
    idempotency_redis_key = f"idempotency:miniapp_reserva:{session.org_id}:{x_idempotency_key}"
    if x_idempotency_key:
        try:
            cached_val = await redis.get(idempotency_redis_key)
            if cached_val:
                logger.info(f"Retornando respuesta de reserva cacheada por idempotencia para clave {x_idempotency_key}")
                data = json.loads(cached_val)
                return ReservationResponse(
                    approval_id=data["approval_id"],
                    status=data.get("status", "pending"),
                    message=data.get("message", "Solicitud enviada al administrador (idempotente).")
                )
        except Exception as e:
            logger.error(f"Error consultando idempotencia en Redis: {e}")

    # 2. Consultar el perfil del vendedor para obtener el nombre real e información de contacto
    supabase = get_supabase_client()
    vendor_name = "Vendedor"
    vendor_phone = None
    try:
        def _fetch_profile():
            return (
                supabase.table("profiles")
                .select("nombre, phone")
                .eq("id", str(session.user_id))
                .limit(1)
                .execute()
            )
        
        profile_res = await asyncio.to_thread(_fetch_profile)
        if profile_res.data:
            profile = profile_res.data[0]
            vendor_name = profile.get("nombre") or "Vendedor"
            vendor_phone = profile.get("phone")
    except Exception as e:
        logger.warning(f"No se pudo consultar el perfil del vendedor: {e}")

    # 3. Invocar al servicio compartido de reservas
    try:
        record = await create_reservation_request_service(
            lot_id=body.lot_id,
            organization_id=str(session.org_id),
            vendor_id=str(session.user_id),
            vendor_name=vendor_name,
            vendor_phone=vendor_phone,
            vendor_platform="telegram",
            buyer_payload={
                "cliente_nombre": body.buyer_name,
                "cliente_run": body.buyer_rut,
                "valor_reserva": 0.0,
                "cliente_email": body.buyer_email,
                "cliente_telefono": body.buyer_phone,
                "payment_method": body.payment_method,
                "payment_evidence_url": body.payment_evidence_url,
                "observation": body.observation or "",
                "notaria": None,
                "fecha_firma": None,
                "cliente_direccion": None,
                "cliente_estado_civil": None,
                "cliente_ocupacion": None,
                "cliente_nacionalidad": None,
                "cliente_region": None,
                "cliente_comuna": None
            },
            redis=redis,
            supabase=supabase,
        )
    except HTTPException as exc:
        raise exc
    except Exception as e:
        logger.error(f"Error inesperado al crear reserva en servicio compartido: {e}")
        raise HTTPException(status_code=500, detail="Error interno del sistema procesando la reserva.")

    await log_agent_action(
        actor=str(session.user_id),
        action="miniapp.reserva_creada",
        entity="approval_requests",
        entity_id=record["id"],
        organization_id=str(session.org_id),
        payload={"lot_id": body.lot_id, "channel": "miniapp"}
    )

    response_data = ReservationResponse(
        approval_id=record["id"],
        status="pending",
        message="Solicitud enviada al administrador."
    )

    # 4. Guardar en cache de Redis si se utiliza idempotencia (expiración de 24 horas)
    if x_idempotency_key:
        try:
            await redis.set(
                idempotency_redis_key,
                json.dumps({"approval_id": record["id"], "status": "pending", "message": "Solicitud enviada al administrador."}),
                ex=86400
            )
        except Exception as e:
            logger.error(f"Error al guardar clave de idempotencia en Redis: {e}")

    return response_data





