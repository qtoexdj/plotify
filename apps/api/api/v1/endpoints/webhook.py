from fastapi import APIRouter, Request, Response, status, HTTPException, Depends, Header
from schemas.meta_webhook import MetaWebhookPayload
from schemas.message_job import MessageJobPayload
from core.config import get_settings
from core.logger import get_logger
from core.redis import get_arq_pool
from core.rate_limiter import limiter
from arq.connections import ArqRedis

router = APIRouter()
logger = get_logger(__name__)
settings = get_settings()


@router.get("/meta")
@limiter.limit("50/second")
async def verify_meta_webhook(
    request: Request,
):
    """
    Endpoint de Verificación de Meta (Hub Challenge).
    Obligatorio para configurar el Webhook en la app de Meta.
    Verifica que el hub.verify_token coincida con el ".env" y retorna el hub.challenge.
    """
    mode = request.query_params.get("hub.mode")
    verify_token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and verify_token == settings.META_VERIFY_TOKEN:
        logger.info("Webhook Meta verificado exitosamente.")
        # Meta requiere que se retorne el challenge en formato integer/text directo sin JSON
        return Response(
            content=challenge, media_type="text/plain", status_code=status.HTTP_200_OK
        )
    else:
        logger.warning(
            "Intento de verificación fallida",
            ip=request.client.host if request.client else "unknown",
            mode=mode,
            token=verify_token,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tokens de verificación inválidos",
        )


@router.post("/meta", status_code=status.HTTP_200_OK)
@limiter.limit("50/second")
async def receive_meta_webhook(
    request: Request,
    payload: MetaWebhookPayload,
    redis: ArqRedis = Depends(get_arq_pool),
):
    """
    Endpoint para recibir Webhooks de Meta (Mensajes entrantes y estados).
    Regla de Oro: Siempre retornar 200 OK de inmediato a Meta.
    Todo el procesamiento pesado va asíncrono vía la cola Redis (arq).
    """
    # Siempre respondemos 200 OK inmediatamente para evitar reintentos masivos de Meta.
    logger.debug("Payload de webhook recibido", entry_count=len(payload.entry))

    # Iterar cada "entry"
    for entry in payload.entry:
        for change in entry.changes:
            val = change.value
            if val.messages:
                # Es un mensaje entrante de un usuario
                for msg in val.messages:
                    if msg.type == "text" and msg.text:
                        # Extraer datos útiles para el job
                        # Podríamos extraer contactos también desde val.contacts, asumiendo lo básico acá:
                        phone_number = msg.from_  # Número del usuario que nos escribe
                        message_id = msg.id
                        text_body = msg.text.body

                        logger.info(
                            "Mensaje de WhatsApp interceptado",
                            phone=phone_number,
                            msg_id=message_id,
                        )

                        # Crear el Job en nuestra forma agnóstica para LangGraph
                        job_payload = MessageJobPayload(
                            platform="whatsapp",
                            phone_id=phone_number,
                            message_text=text_body,
                            message_id=message_id,
                            raw_payload=payload.model_dump(),
                        )

                        # Encolar en Redis (`arq`)
                        # El worker escuchando interceptará el string "process_incoming_message"
                        await redis.enqueue_job(
                            "process_incoming_message", job_payload.model_dump()
                        )
                        logger.debug(
                            "Job encolado en Redis exitosamente", msg_id=message_id
                        )
                    else:
                        # Futuro: Soporte a notas de voz (audio), imágenes, buttons, etc.
                        logger.info(
                            "Recibido un tipo de mensaje no soportado aún",
                            type=msg.type,
                        )
            elif val.statuses:
                # Futuro: Actualizaciones de lectura/entrega de mensajes que enviamos (read receipts)
                pass

    return {"status": "ok"}


@router.post("/telegram/{org_id}", status_code=status.HTTP_200_OK)
@limiter.limit("50/second")
async def receive_telegram_webhook(
    request: Request,
    org_id: str,
    x_telegram_token: str | None = Header(None, alias="X-Telegram-Bot-Api-Secret-Token"),
    redis: ArqRedis = Depends(get_arq_pool),
):
    """
    Endpoint para recibir Webhooks de Telegram con ruteo por organización.
    Maneja dos tipos de eventos:
    1. Mensajes de texto → se encolan para el agente LangGraph.
    2. callback_query (botones inline) → se encolan para procesar decisiones de aprobación.
    """
    # T056: Validar autenticidad del webhook de Telegram
    if settings.TELEGRAM_WEBHOOK_SECRET:
        if not x_telegram_token or x_telegram_token != settings.TELEGRAM_WEBHOOK_SECRET:
            logger.warning(
                "Intento de llamada webhook de Telegram no autenticada o falsificada",
                org_id=org_id,
                provided_token=x_telegram_token
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Webhook token secreto de autenticación inválido o ausente."
            )

    body = await request.json()
    logger.info("Raw Telegram Payload recibido", payload=body, org_id=org_id)

    # --- CASO 1: Callback Query (Admin presionó un botón de aprobación) ---
    callback_query = body.get("callback_query")
    if callback_query:
        callback_data = callback_query.get("data", "")
        callback_id = callback_query.get("id")
        from_user = callback_query.get("from", {})
        chat_id = str(from_user.get("id", ""))

        logger.info(
            "Callback query recibido de Telegram.",
            callback_data=callback_data,
            chat_id=chat_id,
            org_id=org_id,
        )

        # Usar factory
        from integrations.telegram_client import get_telegram_client_for_org

        client = await get_telegram_client_for_org(org_id)

        # ⚡ CRÍTICO: Responder SIEMPRE al callback_query para quitar el "loading" del botón.
        # Telegram muestra loading indefinido si no se responde dentro de ~30s.
        # Si el cliente de la org falla, esto es un error crítico de configuración.
        if client:
            answered = await client.answer_callback_query(callback_id)
            if not answered:
                logger.error(
                    "Falló answer_callback_query — el botón podría quedar en loading.",
                    callback_id=callback_id,
                    org_id=org_id,
                )
        else:
            logger.error(
                "No se pudo obtener TelegramClient para org. El botón quedará en loading.",
                org_id=org_id,
                callback_id=callback_id,
            )

        # Parsear "approve:{uuid}" o "reject:{uuid}"
        if ":" in callback_data:
            action, approval_id = callback_data.split(":", 1)
            if action in ("approve", "reject"):
                # T037: Validar que el usuario que emite el callback tenga rol admin
                from workers.tasks.message_processor import resolve_telegram_actor_context
                actor_ctx = await resolve_telegram_actor_context(org_id, chat_id)
                
                if not actor_ctx or not actor_ctx.get("authorized"):
                    logger.warning(
                        "Intento de decisión no autorizado vía Telegram callback",
                        chat_id=chat_id,
                        org_id=org_id,
                        approval_id=approval_id
                    )
                    from utils.audit import log_agent_action
                    await log_agent_action(
                        actor=f"telegram:{chat_id}",
                        action="telegram.unauthorized_callback",
                        entity="approval_requests",
                        entity_id=approval_id,
                        organization_id=org_id,
                        payload={
                            "chat_id": chat_id,
                            "action": action,
                            "approval_id": approval_id,
                        }
                    )
                    if client:
                        await client.send_text(
                            chat_id, 
                            "⚠️ *Acción no autorizada.*\nNo tienes permisos de administrador vinculados para procesar aprobaciones."
                        )
                    return {"status": "ok"}

                await redis.enqueue_job(
                    "process_admin_decision",
                    org_id,
                    approval_id,
                    action,
                    chat_id,
                )
                logger.info(
                    "Decisión de admin encolada.",
                    action=action,
                    approval_id=approval_id,
                )

                action_label = "✅ Aprobada" if action == "approve" else "❌ Rechazada"
                message_text = f"Solicitud {action_label}. Procesando..."

                # Editamos el mensaje original para quitar los botones
                message_obj = callback_query.get("message", {})
                message_id = message_obj.get("message_id")
                if message_id and client:
                    await client.edit_message_text(
                        chat_id=chat_id,
                        message_id=message_id,
                        text=message_text,
                        reply_markup={"inline_keyboard": []},
                    )
                elif client:
                    await client.send_text(chat_id, message_text)

        return {"status": "ok"}

    # --- CASO 2: Mensaje de texto regular ---
    message = body.get("message", {})
    text = message.get("text", "")
    chat = message.get("chat", {})
    chat_id = str(chat.get("id", ""))
    message_id = str(message.get("message_id", ""))

    if text and chat_id:
        logger.info(
            "Mensaje de Telegram interceptado.",
            chat_id=chat_id,
            msg_id=message_id,
            org_id=org_id,
        )

        # --- SOPORTE DE VINCULACIÓN DE CUENTAS (DEEP LINKING /START TOKEN) ---
        if text.startswith("/start"):
            parts = text.split(" ", 1)
            link_token = parts[1].strip() if len(parts) > 1 else ""

            if link_token:
                # CASO A: /start TOKEN → deep link desde el CRM, iniciar vinculación
                logger.info(
                    "Token de vinculación detectado en /start",
                    token=link_token,
                    chat_id=chat_id,
                )
                await redis.enqueue_job(
                    "link_telegram_account", org_id, link_token, chat_id
                )
            else:
                # CASO B: /start sin token → usuario abrió el bot directamente sin deep link
                # Responder con instrucciones en lugar de caer silenciosamente al LLM
                logger.info(
                    "Comando /start sin token — usuario accedió al bot directamente.",
                    chat_id=chat_id,
                    org_id=org_id,
                )
                from integrations.telegram_client import get_telegram_client_for_org

                tg_client = await get_telegram_client_for_org(org_id)
                if tg_client:
                    await tg_client.send_text(
                        chat_id,
                        "👋 *¡Bienvenido al bot de Plotify!*\n\n"
                        "Para vincular tu cuenta y recibir notificaciones, "
                        "debes usar el enlace de vinculación generado desde el CRM.\n\n"
                        "📲 Ve a *Configuración → Mi Perfil → Vincular Telegram* y escanea el código QR.",
                    )
            return {"status": "ok"}

        # As needed, adjust the payload
        raw_payload = body.copy()
        raw_payload["org_id"] = org_id

        job_payload = MessageJobPayload(
            platform="telegram",
            phone_id=chat_id,
            message_text=text,
            message_id=message_id,
            organization_id=org_id,  # ← CRÍTICO: necesario para obtener el TelegramClient correcto
            raw_payload=raw_payload,
        )

        await redis.enqueue_job(
            "process_incoming_message",
            job_payload.model_dump(),
        )
        logger.debug("Job de Telegram encolado en Redis.", msg_id=message_id)

    return {"status": "ok"}
