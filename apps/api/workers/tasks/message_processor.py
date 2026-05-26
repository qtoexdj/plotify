from core.logger import get_logger
from schemas.message_job import MessageJobPayload
from agent.graph import get_graph_for_org
from langchain_core.messages import HumanMessage
from langchain_core.runnables.config import RunnableConfig
from core.database import get_supabase_client
from integrations.meta_client import meta_client
from integrations.telegram_client import get_telegram_client_for_org
from utils.sanitize import sanitize_user_input

logger = get_logger(__name__)


async def resolve_vendor_telegram_context(
    org_id: str, telegram_chat_id: str
) -> dict | None:
    """Resolve an assigned vendor context from a Telegram chat id."""
    supabase = get_supabase_client()
    vendor_res = (
        supabase.table("vendors")
        .select("id, organization_id, nombre, phone, active")
        .eq("phone", telegram_chat_id)
        .eq("organization_id", org_id)
        .limit(1)
        .execute()
    )
    if not vendor_res.data:
        return None

    vendor = vendor_res.data[0]
    if vendor.get("active") is False:
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
        if telegram_client:
            await telegram_client.send_text(
                telegram_chat_id,
                "No tienes proyectos asignados para operar desde Telegram.",
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
        if telegram_client:
            lot_labels = ", ".join(f"Lote {lot['numero_lote']}" for lot in lots)
            await telegram_client.send_text(
                telegram_chat_id,
                lot_labels or "No hay lotes disponibles asignados.",
            )
        return f"AVAILABILITY:{len(lots)}"

    if operation == "reserve":
        lot_id = data.get("lot_id")
        payload = data.get("payload") or {}
        if not lot_id:
            return "MISSING_LOT_ID"

        lot_res = (
            supabase.table("lots")
            .select("id, numero_lote, estado, project_id")
            .eq("id", lot_id)
            .limit(1)
            .execute()
        )
        if not lot_res.data:
            return "LOT_NOT_FOUND"

        lot = lot_res.data[0]
        if lot.get("project_id") not in context["project_ids"]:
            return "FOREIGN_PROJECT"
        if lot.get("estado") != "disponible":
            return "LOT_NOT_AVAILABLE"

        insert_res = (
            supabase.table("approval_requests")
            .insert(
                {
                    "lot_id": lot_id,
                    "organization_id": context["organization_id"],
                    "vendor_id": context["vendor_id"],
                    "vendor_name": context["vendor_name"],
                    "vendor_phone": telegram_chat_id,
                    "vendor_platform": "telegram",
                    "payload": payload,
                    "status": "pending",
                }
            )
            .execute()
        )
        approval_id = (insert_res.data or [{}])[0].get("id")
        redis = ctx.get("redis")
        if redis and approval_id:
            await redis.enqueue_job("notify_admin_approval", approval_id)
        if telegram_client:
            await telegram_client.send_text(
                telegram_chat_id,
                "Solicitud de reserva enviada al administrador.",
            )
        return f"RESERVATION_REQUESTED:{approval_id}"

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

        # Primero buscamos si es un Vendedor B2B
        vendor_res = (
            supabase.table("vendors")
            .select("id, organization_id, nombre")
            .eq("phone", payload.phone_id)
            .execute()
        )
        if vendor_res.data:
            role = "vendor"
            org_id = vendor_res.data[0].get("organization_id")
            lead_name = vendor_res.data[0].get("nombre")
        else:
            # Si no es vendedor, es un Lead. Lo creamos/recuperamos.
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
        initial_state = {
            "messages": [HumanMessage(content=safe_message)],
            "role": role,
            "organization_id": org_id,
            "lead_info": {"phone": payload.phone_id, "name": lead_name},
            "context": "iniciando",
        }

        # Invocar pipeline LLM asíncrono
        graph = await get_graph_for_org(org_id, role)
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
