import uuid
import asyncio
from fastapi import APIRouter, HTTPException, Depends, status, Header
from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field

from core.config import get_settings
from core.logger import get_logger
from core.database import get_supabase_client
from core.redis import get_arq_pool
from services.reservations import create_reservation_request_service
from services.escritura_delivery import list_vendor_deliveries, renew_delivery_link
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
        chat_id=chat_id,
        vendor_id=user_detail.get("vendor_id")
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
        .select("id, lot_id, created_at, case_status, lots(numero_lote, projects(name)), escritura_cascade_runs(outcome, causes, created_at)")
        .eq("organization_id", str(context.org_id))
        .eq("case_status", "exception")
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
            # Tomar la última corrida de cascada ordenada por created_at
            sorted_runs = sorted(runs, key=lambda r: r.get("created_at") or "", reverse=True)
            latest_run = sorted_runs[0]
            
            # Compatibilidad con mock unitario anterior
            causa_raw = latest_run.get("error_cause")
            if causa_raw:
                causa = causa_raw
            else:
                causes_list = latest_run.get("causes") or []
                if isinstance(causes_list, list) and causes_list:
                    first_cause = causes_list[0]
                    if isinstance(first_cause, dict):
                        causa = first_cause.get("title") or first_cause.get("message") or causa
                    else:
                        causa = str(first_cause)
                else:
                    causa = latest_run.get("outcome") or causa

        items.append(
            BandejaItem(
                id=uuid.UUID(row["id"]),
                tipo="excepcion",
                titulo=f"Lote {numero_lote} — Proyecto: {project_name}",
                causa=causa,
                antiguedad_segundos=_calcular_antiguedad(row["created_at"]),
                estado=row.get("case_status") or row.get("status") or "exception"
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
            evidence_file_id=None
        )
        
    elif tipo == "excepcion":
        # Obtener detalle de la excepción de cascada
        case_res = (
            supabase.table("escritura_cases")
            .select("*, lots(numero_lote, precio, projects(name)), escritura_cascade_runs(outcome, causes, created_at), escritura_deliveries(id, generation_id)")
            .eq("id", str(item_id))
            .eq("organization_id", str(context.org_id))
            .limit(1)
            .execute()
        )
        if not case_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Escritura case not found")
        
        row = case_res.data[0]
        lot_data = row.get("lots") or {}
        lot_id = row.get("lot_id")
        
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
            # Tomar la última corrida ordenada por created_at
            sorted_runs = sorted(runs, key=lambda r: r.get("created_at") or "", reverse=True)
            latest_run = sorted_runs[0]
            
            # Compatibilidad con mock unitario anterior
            causa_raw = latest_run.get("error_cause")
            if causa_raw:
                causa = causa_raw
            else:
                causes_list = latest_run.get("causes") or []
                if isinstance(causes_list, list) and causes_list:
                    first_cause = causes_list[0]
                    if isinstance(first_cause, dict):
                        causa = first_cause.get("title") or first_cause.get("message") or causa
                    else:
                        causa = str(first_cause)
                else:
                    causa = latest_run.get("outcome") or causa
            
            # Intentar leer variables_state de mock si está presente
            variables_state = latest_run.get("variables_state")
            if variables_state and isinstance(variables_state, dict):
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
            
        # Si no se extrajeron conflictos del variables_state (base real), consultamos variable_resolutions
        if not conflictos:
            resolutions_query = (
                supabase.table("variable_resolutions")
                .select("variable_key, value_text, source_type")
                .eq("state", "conflict")
            )
            # Filtrar por case_id o lot_id
            if lot_id:
                resolutions_query = resolutions_query.or_(f"escritura_case_id.eq.{item_id},lot_id.eq.{lot_id}")
            else:
                resolutions_query = resolutions_query.eq("escritura_case_id", str(item_id))
                
            resolutions_res = resolutions_query.execute()
            
            from collections import defaultdict
            proposals_by_key = defaultdict(list)
            for r_row in (resolutions_res.data or []):
                proposals_by_key[r_row["variable_key"]].append(r_row)
            
            for var_key, props in proposals_by_key.items():
                val_vendedor = ""
                val_certificado = ""
                for p in props:
                    if p["source_type"] == "system":
                        val_vendedor = p["value_text"] or ""
                    elif p["source_type"] == "document":
                        val_certificado = p["value_text"] or ""
                
                if not val_vendedor and props:
                    val_vendedor = props[0]["value_text"] or ""
                if not val_certificado and len(props) > 1:
                    val_certificado = props[1]["value_text"] or ""
                    
                conflictos.append(
                    DiscrepanciaVariable(
                        nombre=var_key,
                        valor_certificado=val_certificado,
                        valor_vendedor=val_vendedor,
                        diferencia_detectada="Discrepancia de valores entre expediente y documento digital"
                    )
                )

        # La evidencia se proyecta solo como ID Plotify opaco.
        evidence_file_id = None
        deliveries = row.get("escritura_deliveries") or []
        generation_id = None
        if isinstance(deliveries, list) and deliveries:
            candidate = deliveries[0].get("generation_id")
            try:
                generation_id = str(uuid.UUID(str(candidate))) if candidate else None
            except (ValueError, TypeError, AttributeError):
                generation_id = None
            
        if generation_id:
            evidence_file_id = generation_id
                
        if not evidence_file_id:
            # Fallback a buscar la última generación de este caso
            gen_res = (
                supabase.table("escritura_minuta_generations")
                .select("id")
                .eq("escritura_case_id", str(item_id))
                .order("generated_at", desc=True)
                .limit(1)
                .execute()
            )
            if gen_res.data:
                candidate = gen_res.data[0].get("id")
                try:
                    evidence_file_id = str(uuid.UUID(str(candidate))) if candidate else None
                except (ValueError, TypeError, AttributeError):
                    evidence_file_id = None

        return BandejaDetail(
            id=item_id,
            tipo="excepcion",
            titulo=f"Lote {detalles_lote['numero']} — Proyecto: {detalles_lote['proyecto']}",
            estado=row.get("case_status") or row.get("status") or "exception",
            causa=causa,
            antiguedad_segundos=_calcular_antiguedad(row["created_at"]),
            detalles_lote=detalles_lote,
            comprador=None,
            conflictos=conflictos,
            evidence_file_id=evidence_file_id
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


def normalizar_caso(row: dict[str, Any]) -> dict[str, Any]:
    """Deriva etapa y blockers dinámicamente si no existen como columnas reales."""
    blockers_raw = row.get("blockers")
    if blockers_raw is None:
        blockers_raw = []
        gates = row.get("readiness_gates") or {}
        if isinstance(gates, dict):
            for gate_name, gate_info in gates.items():
                if isinstance(gate_info, dict) and gate_info.get("status") == "blocked":
                    # Si tiene variables bloqueantes, las agregamos
                    vars_blocked = gate_info.get("blocking_variables") or []
                    if vars_blocked:
                        blockers_raw.extend(vars_blocked)
                    else:
                        # Fallback a la key del gate si no tiene variables asociadas
                        blockers_raw.append(gate_name)
    
    # Extraer etapa
    etapa = row.get("current_stage")
    if etapa is None:
        case_status = row.get("case_status") or "variables_pending"
        readiness_status = row.get("readiness_status") or "blocked"
        if case_status == "variables_pending" and readiness_status == "blocked":
            etapa = "validacion"
        elif case_status == "legal_review_pending":
            etapa = "revision"
        elif case_status in ("ready_for_minuta", "approved", "completed"):
            etapa = "minuta"
        else:
            etapa = "venta"
            
    status_val = row.get("status") or row.get("case_status") or "in_progress"
    lot_data = row.get("lots") or {}
    if isinstance(lot_data, list):
        lot_data = lot_data[0] if lot_data else {}
        
    proj_name = row.get("projects", {}).get("name") if row.get("projects") else "Proyecto Desconocido"
    lot_num = lot_data.get("numero_lote") if lot_data else "S/N"
    
    return {
        "id": row["id"],
        "proyecto": proj_name,
        "numero_lote": lot_num,
        "status": status_val,
        "etapa": etapa,
        "blockers": blockers_raw,
        "blockers_humanizados": [humanizar_blocker(b) for b in blockers_raw],
        "created_at": row["created_at"]
    }


@router.get("/ventas", tags=["miniapp"])
async def get_ventas(
    context: MiniappUserContext = Depends(verify_miniapp_session)
):
    """
    Retorna el listado de ventas del vendedor autenticado con su etapa y blockers humanizados.
    """
    logger.info(f"Usuario {context.user_id} consultando sus ventas para org: {context.org_id}")
    supabase = get_supabase_client()
    
    role_lower = context.role.lower()
    if role_lower in ["vendor", "vendedor"]:
        vendor_id_val = context.vendor_id or context.user_id
        assignments = (
            supabase.table("vendor_projects")
            .select("project_id")
            .eq("vendor_id", str(vendor_id_val))
            .execute()
        )
        project_ids = [row["project_id"] for row in (assignments.data or [])]
        if not project_ids:
            return []
        query = (
            supabase.table("escritura_cases")
            .select("id, project_id, lot_id, case_status, readiness_status, readiness_gates, created_at, projects(name), lots(numero_lote, vendedor_id)")
            .eq("organization_id", str(context.org_id))
            .in_("project_id", project_ids)
        )
    else:
        query = (
            supabase.table("escritura_cases")
            .select("id, project_id, lot_id, case_status, readiness_status, readiness_gates, created_at, projects(name), lots(numero_lote, vendedor_id)")
            .eq("organization_id", str(context.org_id))
        )
        
    res = query.execute()
    
    ventas = []
    for row in res.data:
        ventas.append(normalizar_caso(row))
        
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
    
    role_lower = context.role.lower()
    if role_lower in ["vendor", "vendedor"]:
        vendor_id_val = context.vendor_id or context.user_id
        assignments = (
            supabase.table("vendor_projects")
            .select("project_id")
            .eq("vendor_id", str(vendor_id_val))
            .execute()
        )
        project_ids = [row["project_id"] for row in (assignments.data or [])]
        if not project_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venta no encontrada")
        query = (
            supabase.table("escritura_cases")
            .select("id, project_id, lot_id, case_status, readiness_status, readiness_gates, created_at, projects(name), lots(numero_lote, vendedor_id)")
            .eq("id", str(case_id))
            .eq("organization_id", str(context.org_id))
            .in_("project_id", project_ids)
        )
    else:
        query = (
            supabase.table("escritura_cases")
            .select("id, project_id, lot_id, case_status, readiness_status, readiness_gates, created_at, projects(name), lots(numero_lote, vendedor_id)")
            .eq("id", str(case_id))
            .eq("organization_id", str(context.org_id))
        )
        
    res = query.limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venta no encontrada")
        
    return normalizar_caso(res.data[0])


@router.get("/documentos", tags=["miniapp"])
async def get_documentos(
    context: MiniappUserContext = Depends(verify_miniapp_session)
):
    """
    Retorna el listado de documentos/minutas entregados de las ventas del vendedor.
    Genera un enlace firmado temporal para la descarga.
    """
    supabase = get_supabase_client()
    return await list_vendor_deliveries(
        supabase,
        recipient_user_id=str(context.user_id),
        organization_id=str(context.org_id),
    )


@router.post("/documentos/{delivery_id}/renovar", tags=["miniapp"])
async def renovar_documento_miniapp(
    delivery_id: str,
    context: MiniappUserContext = Depends(verify_miniapp_session),
):
    """Regenera el enlace de una entrega propia sin exponer tokens internos."""
    view = await renew_delivery_link(
        get_supabase_client(),
        delivery_id=delivery_id,
        recipient_user_id=str(context.user_id),
        organization_id=str(context.org_id),
    )
    if view is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")
    return view


async def require_miniapp_project_access(
    project_id: str,
    context: MiniappUserContext,
    supabase: Any,
) -> None:
    """Verifica acceso de sesión Mini App sin confiar en RLS del service role.

    El cliente de FastAPI usa service role y por tanto debe reproducir de forma
    explícita la frontera de tenant/proyecto que RLS aplica a clientes finales.
    Para no enumerar proyectos, cualquier ausencia de acceso se responde 404.
    """
    project_res = (
        supabase.table("projects")
        .select("id")
        .eq("id", project_id)
        .eq("organization_id", str(context.org_id))
        .limit(1)
        .execute()
    )
    if not project_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")

    if context.role.lower() not in {"vendor", "vendedor"}:
        return

    if not context.vendor_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")

    assignment_res = (
        supabase.table("vendor_projects")
        .select("vendor_id")
        .eq("vendor_id", str(context.vendor_id))
        .eq("project_id", project_id)
        .limit(1)
        .execute()
    )
    if not assignment_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado")


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
    await require_miniapp_project_access(project_id, context, supabase)

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
            "m2, precio, boundaries_official, projects(name, organization_id), "
            "lot_legal_data(sii_definitive_role, sii_pre_role, sii_role_in_process_text)"
        )
        .eq("id", lot_id)
        .limit(1)
        .execute()
    )

    if not res.data:
        raise HTTPException(status_code=404, detail="Lote no encontrado")

    row = res.data[0]
    project_data = row.get("projects") or {}
    if isinstance(project_data, list):
        project_data = project_data[0] if project_data else {}
    if str(project_data.get("organization_id")) != str(context.org_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lote no encontrado")

    await require_miniapp_project_access(str(row["project_id"]), context, supabase)

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
    Aplica idempotencia durable en Supabase mediante la clave X-Idempotency-Key.
    """
    logger.info(f"Vendedor {session.user_id} intentando crear reserva para lote {body.lot_id}")
    
    if not session.vendor_id:
        raise HTTPException(status_code=403, detail="La sesión no contiene un vendedor operativo.")

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
            vendor_id=str(session.vendor_id),
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
            idempotency_key=x_idempotency_key,
        )
    except HTTPException as exc:
        raise exc
    except Exception as e:
        logger.error(f"Error inesperado al crear reserva en servicio compartido: {e}")
        raise HTTPException(status_code=500, detail="Error interno del sistema procesando la reserva.")

    if record.pop("_created", True):
        await log_agent_action(
            actor=str(session.user_id),
            action="miniapp.reserva_creada",
            entity="approval_requests",
            entity_id=record["id"],
            organization_id=str(session.org_id),
            payload={"lot_id": body.lot_id, "channel": "miniapp"},
        )

    response_data = ReservationResponse(
        approval_id=record["id"],
        status="pending",
        message="Solicitud enviada al administrador."
    )

    return response_data
