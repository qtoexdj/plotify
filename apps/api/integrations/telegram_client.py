import httpx
import asyncio
import time
from urllib.parse import quote
from typing import Optional, Dict, Tuple
from core.config import get_settings
from core.database import get_supabase_client
from core.logger import get_logger
from utils.audit import log_agent_action

logger = get_logger(__name__)

TELEGRAM_API_HOST = "api.telegram.org"
TELEGRAM_SEND_TIMEOUT_SECONDS = 10.0
TELEGRAM_CALLBACK_TIMEOUT_SECONDS = 5.0
_ALLOWED_BOT_METHODS = {"sendMessage", "sendDocument", "answerCallbackQuery", "editMessageText"}


class TelegramClient:
    """Cliente asíncrono básico para interactuar con el Bot API de Telegram."""

    def __init__(self, bot_token: str, org_id: Optional[str] = None):
        self.bot_token = bot_token
        self.org_id = org_id
        self.base_url = f"https://{TELEGRAM_API_HOST}/bot{quote(self.bot_token, safe=':')}"

    def _bot_api_url(self, method: str) -> str:
        if method not in _ALLOWED_BOT_METHODS:
            raise ValueError(f"Telegram method not allowed: {method}")

        url = httpx.URL(f"{self.base_url}/{method}")
        if url.scheme != "https" or url.host != TELEGRAM_API_HOST:
            raise ValueError("Unsafe Telegram Bot API host")
        return str(url)

    async def send_text(
        self, chat_id: str, text: str, reply_markup: Optional[dict] = None
    ) -> Optional[dict]:
        """Envía un mensaje a Telegram. Soporta 'reply_markup' para botones inline."""
        if not self.bot_token:
            logger.warning(
                "TELEGRAM_BOT_TOKEN no configurado. No se enviará el mensaje."
            )
            return None

        payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}

        if reply_markup is not None:
            payload["reply_markup"] = reply_markup  # type: ignore

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self._bot_api_url("sendMessage"),
                    json=payload,
                    timeout=TELEGRAM_SEND_TIMEOUT_SECONDS,
                )
                response.raise_for_status()
                data = response.json()
                logger.debug(
                    f"Mensaje enviado exitosamente a Telegram (Chat ID: {chat_id})."
                )
                return data
            except httpx.HTTPStatusError as e:
                # Log JSON estructurado rico
                logger.error(
                    "Telegram API failure in sendMessage (HTTPStatusError)",
                    extra={
                        "event": "telegram_api_failure",
                        "method": "sendMessage",
                        "chat_id": chat_id,
                        "status_code": e.response.status_code,
                        "error_detail": e.response.text,
                        "retryable": e.response.status_code in [429, 500, 502, 503, 504],
                    }
                )
                
                # Obtener organization_id UUID válido o None
                org_id_val = None
                if self.org_id:
                    try:
                        import uuid
                        uuid.UUID(str(self.org_id))
                        org_id_val = str(self.org_id)
                    except ValueError:
                        pass

                # Auditoría asíncrona no bloqueante con captura de errores
                def _handle_task_result(t: asyncio.Task):
                    try:
                        t.result()
                    except Exception as task_err:
                        logger.error("Audit logging task failed in Telegram Client", error=str(task_err))

                task = asyncio.create_task(
                    log_agent_action(
                        actor="telegram_client",
                        action="telegram.send_failed",
                        entity="telegram_message",
                        entity_id=chat_id,
                        organization_id=org_id_val,  # type: ignore
                        payload={
                            "method": "sendMessage",
                            "status_code": e.response.status_code,
                            "error": e.response.text,
                            "retryable": e.response.status_code in [429, 500, 502, 503, 504],
                        }
                    )
                )
                task.add_done_callback(_handle_task_result)
            except httpx.RequestError as e:
                logger.error(
                    "Telegram API network failure in sendMessage (RequestError)",
                    extra={
                        "event": "telegram_api_failure",
                        "method": "sendMessage",
                        "chat_id": chat_id,
                        "error_detail": str(e),
                        "retryable": True,
                    }
                )

                org_id_val = None
                if self.org_id:
                    try:
                        import uuid
                        uuid.UUID(str(self.org_id))
                        org_id_val = str(self.org_id)
                    except ValueError:
                        pass

                def _handle_task_result_req(t: asyncio.Task):
                    try:
                        t.result()
                    except Exception as task_err:
                        logger.error("Audit logging task failed in Telegram Client", error=str(task_err))

                task = asyncio.create_task(
                    log_agent_action(
                        actor="telegram_client",
                        action="telegram.send_failed",
                        entity="telegram_message",
                        entity_id=chat_id,
                        organization_id=org_id_val,  # type: ignore
                        payload={
                            "method": "sendMessage",
                            "error": str(e),
                            "retryable": True,
                        }
                    )
                )
                task.add_done_callback(_handle_task_result_req)
            except Exception as e:
                logger.error(
                    "Unexpected Telegram Client error in sendMessage",
                    extra={
                        "event": "telegram_api_failure",
                        "method": "sendMessage",
                        "chat_id": chat_id,
                        "error_detail": str(e),
                        "retryable": False,
                    }
                )
        return None

    async def send_document(
        self,
        chat_id: str,
        *,
        document_bytes: bytes,
        filename: str,
        caption: Optional[str] = None,
    ) -> Optional[dict]:
        """Envía un documento (DOCX) por Telegram (Bot API sendDocument, multipart).

        Devuelve la respuesta o None si falla. El llamador decide la caída a
        "mis documentos": la entrega jamás falla en silencio (SDD 011 FR-010).
        """
        if not self.bot_token:
            logger.warning(
                "TELEGRAM_BOT_TOKEN no configurado. No se enviará el documento."
            )
            return None

        data: Dict[str, str] = {"chat_id": chat_id}
        if caption:
            data["caption"] = caption
            data["parse_mode"] = "Markdown"
        files = {
            "document": (
                filename,
                document_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self._bot_api_url("sendDocument"),
                    data=data,
                    files=files,
                    timeout=TELEGRAM_SEND_TIMEOUT_SECONDS,
                )
                response.raise_for_status()
                logger.debug(f"Documento enviado a Telegram (Chat ID: {chat_id}).")
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error(
                    "Telegram API failure in sendDocument (HTTPStatusError)",
                    extra={
                        "event": "telegram_api_failure",
                        "method": "sendDocument",
                        "chat_id": chat_id,
                        "status_code": e.response.status_code,
                        "error_detail": e.response.text,
                        "retryable": e.response.status_code in [429, 500, 502, 503, 504],
                    },
                )
            except httpx.RequestError as e:
                logger.error(
                    "Telegram API network failure in sendDocument (RequestError)",
                    extra={
                        "event": "telegram_api_failure",
                        "method": "sendDocument",
                        "chat_id": chat_id,
                        "error_detail": str(e),
                        "retryable": True,
                    },
                )
            except Exception as e:
                logger.error(
                    "Unexpected Telegram Client error in sendDocument",
                    extra={
                        "event": "telegram_api_failure",
                        "method": "sendDocument",
                        "chat_id": chat_id,
                        "error_detail": str(e),
                        "retryable": False,
                    },
                )
        return None

    async def answer_callback_query(
        self, callback_query_id: str, text: Optional[str] = None
    ) -> bool:
        """Responde a un callback_query para quitar el estado de carga del botón."""
        if not self.bot_token:
            return False

        payload = {"callback_query_id": callback_query_id}
        if text:
            payload["text"] = text

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self._bot_api_url("answerCallbackQuery"),
                    json=payload,
                    timeout=TELEGRAM_CALLBACK_TIMEOUT_SECONDS,
                )
                response.raise_for_status()
                return True
            except Exception as e:
                logger.error(
                    "Telegram API failure in answerCallbackQuery",
                    extra={
                        "event": "telegram_api_failure",
                        "method": "answerCallbackQuery",
                        "callback_query_id": callback_query_id,
                        "error_detail": str(e),
                        "retryable": not isinstance(e, httpx.HTTPStatusError) or e.response.status_code in [429, 500, 502, 503, 504],
                    }
                )
        return False

    async def edit_message_text(
        self,
        chat_id: str,
        message_id: int,
        text: str,
        reply_markup: Optional[dict] = None,
    ) -> bool:
        """Edita un mensaje existente para cambiar su texto y/o quitar sus botones inline."""
        if not self.bot_token:
            return False

        payload = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": "Markdown",
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self._bot_api_url("editMessageText"),
                    json=payload,
                    timeout=TELEGRAM_CALLBACK_TIMEOUT_SECONDS,
                )
                response.raise_for_status()
                return True
            except Exception as e:
                logger.error(
                    "Telegram API failure in editMessageText",
                    extra={
                        "event": "telegram_api_failure",
                        "method": "editMessageText",
                        "chat_id": chat_id,
                        "message_id": message_id,
                        "error_detail": str(e),
                        "retryable": not isinstance(e, httpx.HTTPStatusError) or e.response.status_code in [429, 500, 502, 503, 504],
                    }
                )
        return False


# Cache con TTL para evitar llamadas repetidas a DB.
# Formato: { org_id: (TelegramClient, timestamp_creacion) }
# El cliente se recrea automáticamente al expirar el TTL (tokens rotados no persisten).
_client_cache: Dict[str, Tuple[TelegramClient, float]] = {}
_CACHE_TTL_SECONDS: float = 3600.0  # 1 hora


def _fetch_decrypted_token(org_id: str) -> Optional[str]:
    """Extraer DB blocking logic to a thread (supabase client is currently sync)"""
    supabase = get_supabase_client()
    response = supabase.rpc("get_decrypted_bot_token", {"p_org_id": org_id}).execute()
    return str(response.data) if response.data else None


async def get_telegram_client_for_org(org_id: str) -> Optional[TelegramClient]:
    """
    Factory async para obtener cliente de Telegram de una organización específica.

    El cliente se cachea por org_id durante _CACHE_TTL_SECONDS (1 hora).
    Al expirar el TTL el token se relee desde la BD, garantizando que las
    rotaciones de token se reflejen sin reiniciar el servicio (M2.4).
    """
    now = time.monotonic()

    # Verificar si existe en cache y si no ha expirado
    if org_id in _client_cache:
        cached_client, created_at = _client_cache[org_id]
        if now - created_at < _CACHE_TTL_SECONDS:
            return cached_client
        # TTL expirado → invalidar y volver a buscar en BD
        logger.info(f"Cache TTL expirado para org {org_id}, recreando TelegramClient")
        del _client_cache[org_id]

    try:
        # Ejecutar en hilo separado para no bloquear el event loop de FastAPI
        token = await asyncio.to_thread(_fetch_decrypted_token, org_id)

        if token:
            client = TelegramClient(bot_token=token, org_id=org_id)
            _client_cache[org_id] = (client, now)
            return client
    except Exception as e:
        logger.error(f"Error obteniendo token de bot para org {org_id}: {str(e)}")

    # Si no hay token de la org, intentar fallback al token global (para retrocompatibilidad temporal)
    global_token = get_settings().TELEGRAM_BOT_TOKEN
    if global_token:
        logger.info(f"Usando token global para org {org_id} como fallback")
        return TelegramClient(bot_token=global_token, org_id=org_id)

    return None


# Mantenemos esto por compatibilidad, pero idealmente las nuevas funciones
# deberían inyectar el org_id y usar el factory
telegram_client = TelegramClient(bot_token=get_settings().TELEGRAM_BOT_TOKEN, org_id=None)
