import math

from core.logger import get_logger
from schemas.message_job import MessageJobPayload
from agent.graph import get_graph_for_org
from langchain_core.messages import HumanMessage
from langchain_core.runnables.config import RunnableConfig
from core.database import get_supabase_client
from integrations.meta_client import meta_client
from integrations.telegram_client import get_telegram_client_for_org
from utils.sanitize import sanitize_user_input
from utils.audit import log_agent_action

logger = get_logger(__name__)

TELEGRAM_VENDOR_ACCESS_DENIED_MESSAGE = (
    "No pudimos validar tu acceso de vendedor o no tienes proyectos asignados "
    "en esta inmobiliaria. Escríbele al administrador de tu equipo para revisar "
    "tu acceso."
)
TELEGRAM_RESERVATION_FORMAT_MESSAGE = (
    'Formato de reserva incompleto. Envía: /reserva <lote_id> "Nombre comprador" '
    '"RUN" <valor_reserva>\n'
    'Ejemplo: /reserva 4f8dbde6-7788-4444-a111-c678a9c04909 '
    '"Juan Pérez" "12.345.678-9" 500000'
)


def _first_data_row(result) -> dict | None:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return data[0] if data else None
    if isinstance(data, dict):
        return data
    return None


def _clean_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _reservation_validation_message(reason: str) -> str:
    return (
        f"No pude crear la solicitud de reserva: {reason}\n\n"
        f"{TELEGRAM_RESERVATION_FORMAT_MESSAGE}"
    )


def _reservation_failure_message(detail: str) -> str:
    return (
        "No se pudo enviar la solicitud de reserva. "
        f"{detail} Revisa el lote y los datos, o consulta /lotes antes de intentar otra vez."
    )


def _validate_reservation_command_data(data: dict) -> tuple[dict | None, str | None]:
    lot_id = _clean_text(data.get("lot_id"))
    if not lot_id:
        return None, "indica el ID del lote que quieres reservar."

    payload_data = data.get("payload")
    if not isinstance(payload_data, dict):
        return None, "faltan los datos del comprador."

    cliente_nombre = _clean_text(payload_data.get("cliente_nombre"))
    if len(cliente_nombre) < 2:
        return None, "indica el nombre del comprador."

    cliente_run = _clean_text(payload_data.get("cliente_run"))
    if len(cliente_run) < 7:
        return None, "indica un RUN válido del comprador."

    try:
        valor_reserva = float(payload_data.get("valor_reserva"))
    except (TypeError, ValueError):
        return None, "el valor de reserva debe ser un número mayor a 0."

    if not math.isfinite(valor_reserva) or valor_reserva <= 0:
        return None, "el valor de reserva debe ser mayor a 0."

    return (
        {
            "lot_id": lot_id,
            "payload": {
                "cliente_nombre": cliente_nombre,
                "cliente_run": cliente_run,
                "valor_reserva": valor_reserva,
                "notaria": payload_data.get("notaria"),
                "fecha_firma": payload_data.get("fecha_firma"),
            },
        },
        None,
    )


async def _audit_telegram_vendor_operation(
    action: str,
    org_id: str,
    telegram_chat_id: str,
    operation: str,
    *,
    context: dict | None = None,
    entity: str = "telegram_vendor_operation",
    entity_id: str | None = None,
    payload: dict | None = None,
) -> None:
    audit_payload = {
        "channel": "telegram",
        "telegram_chat_id": str(telegram_chat_id),
        "operation": operation,
    }
    if context:
        audit_payload.update(
            {
                "vendor_id": context.get("vendor_id"),
                "project_count": len(context.get("project_ids") or []),
            }
        )
    if payload:
        audit_payload.update(payload)

    try:
        await log_agent_action(
            actor=str(telegram_chat_id),
            action=action,
            entity=entity,
            entity_id=entity_id or str(telegram_chat_id),
            organization_id=org_id,
            payload=audit_payload,
        )
    except Exception as err:
        logger.warning(
            "No se pudo registrar auditoría de operación Telegram vendedor.",
            action=action,
            error=str(err),
        )


async def resolve_telegram_actor_context(
    org_id: str, telegram_chat_id: str
) -> dict | None:
    """
    T035 [US5]: Resuelve un actor de Telegram (admin o vendor) a partir de su chat_id.
    Retorna profile_id, role, organization_id y estado de autorización.
    """
    supabase = get_supabase_client()
    profile_res = (
        supabase.table("profiles")
        .select("id")
        .eq("telegram_chat_id", str(telegram_chat_id))
        .limit(1)
        .execute()
    )
    
    if not profile_res.data:
        return None
    
    profile = profile_res.data[0]
    
    # Validar membresía en la organización para confirmar tenant
    member_res = (
        supabase.table("organization_members")
        .select("role, organization_id")
        .eq("organization_id", org_id)
        .eq("user_id", profile["id"])
        .limit(1)
        .execute()
    )
    if not member_res.data:
        return None
        
    member = member_res.data[0]
    return {
        "profile_id": profile["id"],
        "role": member["role"],
        "organization_id": member["organization_id"],
        "authorized": member["role"] == "admin"
    }


async def resolve_vendor_telegram_context(
    org_id: str, telegram_chat_id: str
) -> dict | None:
    """Resolve an assigned vendor context from a Telegram chat id using trusted links."""
    supabase = get_supabase_client()

    profile_res = (
        supabase.table("profiles")
        .select("id, phone")
        .eq("telegram_chat_id", str(telegram_chat_id))
        .limit(1)
        .execute()
    )

    profile = _first_data_row(profile_res)
    vendor = None

    if profile:
        profile_id = profile.get("id")
        if not profile_id:
            return None

        member_res = (
            supabase.table("organization_members")
            .select("role, organization_id")
            .eq("organization_id", org_id)
            .eq("user_id", profile_id)
            .limit(1)
            .execute()
        )
        if not _first_data_row(member_res):
            return None

        vendor_res = (
            supabase.table("vendors")
            .select("id, user_id, organization_id, nombre, phone, active")
            .eq("user_id", profile_id)
            .eq("organization_id", org_id)
            .limit(1)
            .execute()
        )
        vendor = _first_data_row(vendor_res)
        if not vendor:
            return None
    else:
        # Fallback histórico: vendors.phone == telegram_chat_id.
        # Solo aplica cuando no existe un perfil Telegram vinculado.
        vendor_res = (
            supabase.table("vendors")
            .select("id, user_id, organization_id, nombre, phone, active")
            .eq("phone", str(telegram_chat_id))
            .eq("organization_id", org_id)
            .limit(1)
            .execute()
        )
        vendor = _first_data_row(vendor_res)

    if not vendor:
        return None

    if vendor.get("active") is not True:
        return None

    assignments_res = (
        supabase.table("vendor_projects")
        .select("project_id")
        .eq("vendor_id", vendor["id"])
        .execute()
    )
    project_ids = [row["project_id"] for row in (assignments_res.data or [])]
    if not project_ids:
        return None

    return {
        "vendor_id": vendor["id"],
        "vendor_name": vendor.get("nombre") or "Vendedor",
        "organization_id": vendor["organization_id"],
        "telegram_chat_id": telegram_chat_id,
        "project_ids": project_ids,
        "vendor_phone": vendor.get("phone") or "",
    }


async def process_vendor_telegram_operation(
    ctx: dict,
    org_id: str,
    telegram_chat_id: str,
    operation: str,
    data: dict | None = None,
) -> str:
    """
    Minimal deterministic seller Telegram operations used by the MVP foundation.

    The conversational parser can route to this function later; the invariant
    already lives here: only linked vendors with explicit project assignments
    can see lot availability or create reservation intents.
    """
    data = data or {}
    context = await resolve_vendor_telegram_context(org_id, telegram_chat_id)
    telegram_client = await get_telegram_client_for_org(org_id)
    if not context:
        await _audit_telegram_vendor_operation(
            "telegram.vendor.operation_denied",
            org_id,
            telegram_chat_id,
            operation,
            payload={"reason": "vendor_context_unresolved"},
        )
        if telegram_client:
            await telegram_client.send_text(
                telegram_chat_id,
                TELEGRAM_VENDOR_ACCESS_DENIED_MESSAGE,
            )
        return "UNASSIGNED_VENDOR"

    supabase = get_supabase_client()

    if operation == "availability":
        lots_query = (
            supabase.table("lots")
            .select("id, numero_lote, estado, project_id")
            .eq("estado", "disponible")
            .in_("project_id", context["project_ids"])
        )
        lots_res = lots_query.execute()
        lots = lots_res.data or []
        await _audit_telegram_vendor_operation(
            "telegram.vendor.availability_requested",
            org_id,
            telegram_chat_id,
            operation,
            context=context,
            entity="lots",
            entity_id=context["vendor_id"],
            payload={"result_count": len(lots)},
        )
        if telegram_client:
            lot_labels = ", ".join(f"Lote {lot['numero_lote']}" for lot in lots)
            await telegram_client.send_text(
                telegram_chat_id,
                (
                    f"Lotes disponibles asignados: {lot_labels}."
                    if lot_labels
                    else "No hay lotes disponibles en tus proyectos asignados por ahora."
                ),
            )
        return f"AVAILABILITY:{len(lots)}"

    if operation == "reserve":
        normalized_data, validation_error = _validate_reservation_command_data(data)
        if validation_error:
            if telegram_client:
                await telegram_client.send_text(
                    telegram_chat_id,
                    _reservation_validation_message(validation_error),
                )
            await _audit_telegram_vendor_operation(
                "telegram.vendor.operation_denied",
                org_id,
                telegram_chat_id,
                operation,
                context=context,
                payload={
                    "reason": "invalid_reservation_payload",
                    "validation_error": validation_error,
                },
            )
            return "INVALID_RESERVATION_DATA"

        lot_id = normalized_data["lot_id"]
        payload_data = normalized_data["payload"]

        from schemas.approval import ReservationRequest, ReservationPayload
        from api.v1.endpoints.approvals import request_reservation

        try:
            payload_obj = ReservationPayload(
                cliente_nombre=payload_data["cliente_nombre"],
                cliente_run=payload_data["cliente_run"],
                valor_reserva=payload_data["valor_reserva"],
                notaria=payload_data.get("notaria"),
                fecha_firma=payload_data.get("fecha_firma"),
            )
        except Exception as err:
            detail = "los datos de reserva no tienen un formato válido."
            if telegram_client:
                await telegram_client.send_text(
                    telegram_chat_id,
                    _reservation_validation_message(detail),
                )
            await _audit_telegram_vendor_operation(
                "telegram.vendor.operation_denied",
                org_id,
                telegram_chat_id,
                operation,
                context=context,
                payload={
                    "reason": "invalid_reservation_payload",
                    "validation_error": str(err),
                },
            )
            return "INVALID_RESERVATION_DATA"

        body = ReservationRequest(
            lot_id=lot_id,
            organization_id=context["organization_id"],
            vendor_id=context["vendor_id"],
            vendor_name=context["vendor_name"],
            vendor_phone=telegram_chat_id,
            vendor_platform="telegram",
            payload=payload_obj,
        )

        redis_pool = ctx.get("redis")

        try:
            # Llamar directamente al endpoint FastAPI centralizado (M1.2 / US2.1)
            res_val = await request_reservation(body, redis=redis_pool)
            approval_id = res_val.approval_id
            request_status = getattr(res_val, "status", "pending")
            if request_status != "pending":
                raise RuntimeError("La solicitud de reserva no quedó pendiente.")
        except Exception as err:
            logger.error("Error al invocar request_reservation en Telegram.", error=str(err))
            from fastapi import HTTPException
            detail = str(err)
            audit_action = "telegram.vendor.operation_failed"
            reason = "reservation_failed"
            if isinstance(err, HTTPException):
                detail = str(err.detail)
                if 400 <= err.status_code < 500:
                    audit_action = "telegram.vendor.operation_denied"
                    reason = "reservation_rejected"
            await _audit_telegram_vendor_operation(
                audit_action,
                org_id,
                telegram_chat_id,
                operation,
                context=context,
                payload={
                    "reason": reason,
                    "lot_id": lot_id,
                    "error": detail,
                },
            )
            if telegram_client:
                await telegram_client.send_text(
                    telegram_chat_id,
                    _reservation_failure_message(detail),
                )
            return "RESERVATION_FAILED"

        await _audit_telegram_vendor_operation(
            "telegram.vendor.reservation_requested",
            org_id,
            telegram_chat_id,
            operation,
            context=context,
            entity="approval_requests",
            entity_id=approval_id,
            payload={
                "lot_id": lot_id,
                "approval_id": approval_id,
                "status": "pending",
            },
        )
        if telegram_client:
            await telegram_client.send_text(
                telegram_chat_id,
                "Solicitud de reserva enviada. Quedó pendiente de revisión del administrador.",
            )
        return f"RESERVATION_REQUESTED:{approval_id}"

    await _audit_telegram_vendor_operation(
        "telegram.vendor.operation_failed",
        org_id,
        telegram_chat_id,
        operation,
        context=context,
        payload={"reason": "unknown_operation"},
    )
    return "UNKNOWN_OPERATION"


async def process_incoming_message(ctx: dict, payload_dict: dict) -> str:
    """
    Tarea de arq en background.
    Busca roles, desencapsula el mensaje, invoca al agente de LangGraph
    y envía la salida usando los clientes asíncronos.
    """
    try:
        # Reconstruir el payload validado
        payload = MessageJobPayload(**payload_dict)
        logger.info(
            "Iniciando procesamiento de mensaje",
            platform=payload.platform,
            phone=payload.phone_id,
            message_id=payload.message_id,
        )

        # 1. ORQUESTACIÓN MULTI-ACTOR: Consultar BD para descubrir quién habla
        supabase = get_supabase_client()
        role = "lead"  # Default
        org_id = payload.organization_id
        lead_name = "Cliente"
        profile = None
        vendor_res = None
        actor_ctx = None

        if payload.platform == "telegram":
            # Intentar resolver actor (admin o vendor) de forma segura por vinculación
            actor_ctx = await resolve_telegram_actor_context(payload.organization_id, payload.phone_id)
            if actor_ctx:
                role = actor_ctx["role"]
                org_id = actor_ctx["organization_id"]
                # Cargar datos de perfil del actor
                profile_res = supabase.table("profiles").select("id, first_name, last_name").eq("id", actor_ctx["profile_id"]).limit(1).execute()
                if profile_res.data:
                    profile = profile_res.data[0]
                    lead_name = f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip() or "Usuario"
            else:
                # Si no se resolvió por vinculación directa de admin/membresía, buscar en profiles por telegram_chat_id
                profile_res = supabase.table("profiles").select("id, first_name, last_name").eq("telegram_chat_id", str(payload.phone_id)).limit(1).execute()
                if profile_res.data:
                    profile = profile_res.data[0]
                    vendor_res = supabase.table("vendors").select("id, organization_id, nombre").eq("user_id", profile["id"]).eq("organization_id", payload.organization_id).execute()

        # Fallback o WhatsApp: vendors.phone == payload.phone_id
        if payload.platform != "telegram" or (not actor_ctx and (not vendor_res or not vendor_res.data)):
            vendor_res = (
                supabase.table("vendors")
                .select("id, organization_id, nombre")
                .eq("phone", payload.phone_id)
                .eq("organization_id", payload.organization_id)
                .execute()
            )

        if role == "lead" and vendor_res and vendor_res.data:
            role = "vendor"
            org_id = vendor_res.data[0].get("organization_id")
            lead_name = vendor_res.data[0].get("nombre") or lead_name

        if role == "lead":
            # Si no es vendedor ni admin, es un Lead. Lo creamos/recuperamos.
            lead_res = (
                supabase.table("leads")
                .select("id, name, organization_id")
                .eq("phone", payload.phone_id)
                .execute()
            )
            if lead_res.data:
                lead_data = lead_res.data[0]
                org_id = lead_data.get("organization_id") or org_id
                lead_name = lead_data.get("name") or "Cliente"
            else:
                # Insertar nuevo lead
                new_lead = {
                    "phone": payload.phone_id,
                    "platform": payload.platform,
                    "organization_id": org_id,
                    "name": lead_name,
                }
                supabase.table("leads").insert(new_lead).execute()
                logger.info(
                    "Nuevo lead registrado exitosamente en el CRM.",
                    phone=payload.phone_id,
                )

        # M1.2 / T103: Si es Vendedor o Administrador en Telegram, interceptar comandos estructurados antes del LLM
        if role in ("vendor", "admin") and payload.platform == "telegram":
            text_strip = payload.message_text.strip()
            # T042 / T043 / T045: Interceptar shortcuts deterministas de Telegram de forma segura
            if text_strip.lower() in ("/pendientes", "/aprobadas", "/rechazadas"):
                status_filter = "pending"
                if text_strip.lower() == "/aprobadas":
                    status_filter = "approved"
                elif text_strip.lower() == "/rechazadas":
                    status_filter = "rejected"
                    
                telegram_client = await get_telegram_client_for_org(org_id)
                
                # Consultar solicitudes de base de datos
                query = supabase.table("approval_requests").select(
                    "id, request_type, status, vendor_name, payload, created_at, lot_id, "
                    "lots!inner(numero_lote)"
                ).eq("organization_id", org_id).eq("status", status_filter)
                
                # Vendedores solo ven sus propios registros
                if role == "vendor":
                    # Buscar el vendor_id correspondiente al perfil para filtrar de forma estricta (US5 / tenant protection)
                    if profile:
                        vendor_lookup = supabase.table("vendors").select("id").eq("organization_id", org_id).eq("user_id", profile["id"]).execute()
                        if vendor_lookup.data:
                            query = query.eq("vendor_id", vendor_lookup.data[0]["id"])
                        else:
                            query = query.eq("vendor_phone", payload.phone_id)
                    else:
                        query = query.eq("vendor_phone", payload.phone_id)
                        
                app_res = query.order("created_at", desc=True).limit(5).execute()
                items = app_res.data or []
                
                status_label = "Pendientes" if status_filter == "pending" else ("Aprobadas" if status_filter == "approved" else "Rechazadas")
                
                if not items:
                    msg = f"📋 *Solicitudes {status_label}*\n\nNo tienes solicitudes en este estado en este momento."
                else:
                    msg = f"📋 *Solicitudes {status_label} (Últimas 5)*:\n\n"
                    for idx, item in enumerate(items, 1):
                        lot_num = item["lots"]["numero_lote"]
                        req_type = "Reserva" if item["request_type"] == "reservation" else "Venta"
                        client = item["payload"].get("cliente_nombre", "N/A")
                        msg += f"{idx}. *Lote {lot_num}* — {req_type} ({client})\n"
                
                if telegram_client:
                    await telegram_client.send_text(payload.phone_id, msg)
                return "PENDING_SHORTCUT_SUCCESS"
                
            elif text_strip.lower() == "/docs":
                telegram_client = await get_telegram_client_for_org(org_id)
                # T045: Retorna el enlace directo a la página de documentación del vendedor
                docs_msg = (
                    "📚 *Centro de Ayuda y Documentación*\n\n"
                    "Accede a manuales de venta, plantillas de deslindes y guías operativas oficiales de Plotify aquí:\n\n"
                    "🔗 https://plotify.cl/ayuda/vendedor"
                )
                if telegram_client:
                    await telegram_client.send_text(payload.phone_id, docs_msg)
                return "DOCS_SHORTCUT_SUCCESS"

            if text_strip.startswith("/lotes") or text_strip.lower() in ("lotes", "disponibles", "/disponibles"):
                op_res = await process_vendor_telegram_operation(
                    ctx, org_id, payload.phone_id, "availability"
                )
                return op_res
            
            elif text_strip.startswith("/reserva"):
                # Formato esperado: /reserva <lot_id> <cliente_nombre> <cliente_run> <valor_reserva>
                import shlex
                try:
                    parts = shlex.split(text_strip)
                except Exception as parse_err:
                    logger.warning("Error parsing /reserva command with shlex. Fallback to space-split.", error=str(parse_err))
                    parts = text_strip.split()

                if len(parts) < 5:
                    telegram_client = await get_telegram_client_for_org(org_id)
                    if telegram_client:
                        await telegram_client.send_text(
                            payload.phone_id,
                            TELEGRAM_RESERVATION_FORMAT_MESSAGE,
                        )
                    await _audit_telegram_vendor_operation(
                        "telegram.vendor.operation_denied",
                        org_id,
                        payload.phone_id,
                        "reserve",
                        payload={"reason": "invalid_reservation_format"},
                    )
                    return "MISSING_RESERVE_ARGS"
                
                lot_id = parts[1]
                cliente_nombre = parts[2].strip()
                cliente_run = parts[3].strip()
                valor_reserva_raw = parts[4].strip()
                try:
                    valor_reserva = float(valor_reserva_raw)
                except ValueError:
                    valor_reserva = valor_reserva_raw

                reserve_data = {
                    "lot_id": lot_id,
                    "payload": {
                        "cliente_nombre": cliente_nombre,
                        "cliente_run": cliente_run,
                        "valor_reserva": valor_reserva,
                    }
                }
                op_res = await process_vendor_telegram_operation(
                    ctx, org_id, payload.phone_id, "reserve", data=reserve_data
                )
                return op_res

        # 2. IA / LangGraph: Ejecutar Grafo con State Avanzado
        # M2.1: thread_id con prefijo de org para aislar conversaciones entre tenants.
        # Mismo número en org A y org B → threads completamente separados.
        thread_id = f"{org_id}:{payload.phone_id}" if org_id else payload.phone_id
        config = RunnableConfig(configurable={"thread_id": thread_id})
        logger.debug(
            "thread_id generado",
            thread_id=thread_id,
            org_id=org_id,
            phone=payload.phone_id,
        )

        # Sanitizar input para prevenir prompt injection (M1.6)
        safe_message = sanitize_user_input(payload.message_text)
        logger.debug(
            "Mensaje sanitizado",
            original_len=len(payload.message_text),
            safe_len=len(safe_message),
        )

        # Preparamos el estado inicial extendido
        trusted_profile_id = profile.get("id") if isinstance(profile, dict) else None
        trusted_vendor_id = None
        trusted_vendor_name = lead_name if role == "vendor" else None
        trusted_vendor_phone = payload.phone_id if role == "vendor" else None

        if vendor_res and getattr(vendor_res, "data", None):
            vendor_row = vendor_res.data[0]
            trusted_vendor_id = vendor_row.get("id")
            trusted_vendor_name = vendor_row.get("nombre") or trusted_vendor_name
        elif role == "vendor" and trusted_profile_id:
            vendor_lookup = (
                supabase.table("vendors")
                .select("id, nombre, phone")
                .eq("organization_id", org_id)
                .eq("user_id", trusted_profile_id)
                .limit(1)
                .execute()
            )
            if vendor_lookup.data:
                vendor_row = vendor_lookup.data[0]
                trusted_vendor_id = vendor_row.get("id")
                trusted_vendor_name = vendor_row.get("nombre") or trusted_vendor_name
                trusted_vendor_phone = vendor_row.get("phone") or trusted_vendor_phone

        initial_state = {
            "messages": [HumanMessage(content=safe_message)],
            "role": role,
            "organization_id": org_id,
            "lead_info": {"phone": payload.phone_id, "name": lead_name},
            "context": "iniciando",
            "user_id": trusted_profile_id,
            "profile_id": trusted_profile_id,
            "vendor_id": trusted_vendor_id,
            "vendor_name": trusted_vendor_name,
            "vendor_phone": trusted_vendor_phone,
            "channel": payload.platform,
        }

        # Invocar pipeline LLM asíncrono
        graph = await get_graph_for_org(org_id, role, runtime_state=initial_state)
        result = await graph.ainvoke(initial_state, config=config)

        # Extraer el último mensaje generado por el Agente
        final_messages = result.get("messages", [])
        if final_messages:
            agente_response = final_messages[-1].content
        else:
            agente_response = "Disculpe, ocurrió un error generando la respuesta."

        logger.info(
            f"El agente LLM ({role.upper()}) decidió una respuesta.",
            respuesta=agente_response,
        )

        # 3. ENTREGA (Fase 5): Enrutar según la plataforma origen
        if payload.platform == "whatsapp":
            await meta_client.send_text(payload.phone_id, agente_response)
        elif payload.platform == "telegram":
            # Para telegram el phone_id suele venir como Chat ID numérico
            if org_id:
                telegram_client = await get_telegram_client_for_org(org_id)
                if telegram_client:
                    await telegram_client.send_text(payload.phone_id, agente_response)
                else:
                    logger.error(f"TelegramClient invalido para la org_id {org_id}")
            else:
                logger.error("No se encontro org_id al intentar enviar a Telegram.")
        else:
            logger.warning(f"Plataforma desconocida para el emisor: {payload.platform}")

        logger.info(
            "Mensaje procesado y despachado exitosamente", message_id=payload.message_id
        )
        return "SUCCESS"

    except Exception as e:
        logger.error(
            "Error crítico procesando el mensaje en background",
            error=str(e),
            payload=payload_dict,
        )
        raise e


async def link_telegram_account(
    ctx: dict, org_id: str, link_token: str, telegram_chat_id: str
) -> str:
    """
    Job de arq para vincular un profile de Supabase con un Chat ID de Telegram.
    Valida el token contra Redis, obtiene el profile_id y actualiza Supabase.
    """
    try:
        logger.info(
            "Iniciando job de vinculación de cuenta de Telegram",
            token=link_token,
            chat_id=telegram_chat_id,
        )

        telegram_client = await get_telegram_client_for_org(org_id)

        # 1. Recuperar el profile_id desde Redis (arq usa el pool en ctx['redis'])
        redis = ctx["redis"]
        redis_key = f"tg_link:{link_token}"
        profile_id = await redis.get(redis_key)

        if not profile_id:
            logger.warning("Token de vinculación expirado o inválido", token=link_token)
            if telegram_client:
                await telegram_client.send_text(
                    telegram_chat_id,
                    "❌ Este enlace de vinculación ha expirado o es inválido. Genera uno nuevo en el CRM.",
                )
            return "EXPIRED_TOKEN"

        # El valor de redis.get es bytes si no se decodifica
        if isinstance(profile_id, bytes):
            profile_id = profile_id.decode("utf-8")

        logger.info(
            "Vinculando Telegram",
            profile_id=profile_id,
            telegram_chat_id=telegram_chat_id,
        )

        # 2. Actualizar Supabase (Tabla profiles, columna telegram_chat_id)
        supabase = get_supabase_client()

        # Primero verificamos que el perfil destino existe y obtenemos su nombre
        check_res = (
            supabase.table("profiles")
            .select("id, first_name, last_name")
            .eq("id", profile_id)
            .limit(1)
            .execute()
        )
        if not check_res.data:
            logger.error(
                "Perfil no encontrado en Supabase — el profile_id no existe.",
                profile_id=profile_id,
            )
            if telegram_client:
                await telegram_client.send_text(
                    telegram_chat_id,
                    "❌ Ocurrió un error al vincular tu cuenta. Por favor contacta a soporte.",
                )
            return "DB_ERROR"

        user_profile = check_res.data[0]
        full_name = f"{user_profile.get('first_name', '')} {user_profile.get('last_name', '')}".strip()
        display_name = full_name if full_name else "Usuario"

        # 🔑 CRÍTICO: Limpiar el mismo telegram_chat_id de cualquier otro perfil que ya lo tenga.
        # Escenario: el admin desvinculó el teléfono del Vendor A y lo reasignó al Vendor B.
        # Sin este paso, el Vendor A seguiría recibiendo notificaciones con el chat_id del Vendor B.
        orphan_res = (
            supabase.table("profiles")
            .select("id")
            .eq("telegram_chat_id", telegram_chat_id)
            .neq("id", profile_id)  # No tocar el perfil destino
            .execute()
        )
        if orphan_res.data:
            orphan_ids = [row["id"] for row in orphan_res.data]
            supabase.table("profiles").update({"telegram_chat_id": None}).in_(
                "id", orphan_ids
            ).execute()
            logger.warning(
                "telegram_chat_id limpiado de perfiles anteriores (reasignación detectada).",
                orphan_profile_ids=orphan_ids,
                telegram_chat_id=telegram_chat_id,
            )

        # Ejecutar el UPDATE en el perfil destino
        supabase.table("profiles").update({"telegram_chat_id": telegram_chat_id}).eq(
            "id", profile_id
        ).execute()

        logger.info(
            "telegram_chat_id actualizado en base de datos.",
            profile_id=profile_id,
            telegram_chat_id=telegram_chat_id,
            user_name=display_name,
        )

        # 3. Borrar token de Redis para un solo uso
        await redis.delete(redis_key)

        # 4. Confirmar al usuario por Telegram
        if telegram_client:
            # Obtener nombre de la organización y del bot
            org_res = (
                supabase.table("organizations")
                .select("name")
                .eq("id", org_id)
                .single()
                .execute()
            )
            org_name = org_res.data.get("name") if org_res.data else "Plotify"

            bot_res = (
                supabase.table("telegram_bots")
                .select("bot_username")
                .eq("organization_id", org_id)
                .single()
                .execute()
            )
            bot_username = (
                f"@{bot_res.data.get('bot_username')}"
                if bot_res.data
                else "nuestro bot"
            )

            success_msg = (
                f"🎉 *¡Vinculación Exitosa, {display_name}!* 🚀\n\n"
                f"Tu cuenta de Plotify ha sido vinculada correctamente a la inmobiliaria **{org_name}** a través de {bot_username}. De ahora en adelante recibirás notificaciones importantes por este canal."
            )
            await telegram_client.send_text(telegram_chat_id, success_msg)

        logger.info("Cuenta vinculada exitosamente", profile_id=profile_id)
        return "SUCCESS"

    except Exception as e:
        logger.error("Error en link_telegram_account", error=str(e))
        return "ERROR"
