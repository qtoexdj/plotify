from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx
import logging
from core.database import get_supabase_client

router = APIRouter()
logger = logging.getLogger(__name__)


class RegisterBotRequest(BaseModel):
    bot_token: str
    organization_id: str


class BotResponse(BaseModel):
    bot_username: str
    is_active: bool


@router.post("/register", response_model=BotResponse)
async def register_bot(payload: RegisterBotRequest):
    org_id = payload.organization_id
    token = payload.bot_token.strip()

    # 1. Validar el token con Telegram API
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"https://api.telegram.org/bot{token}/getMe", timeout=10.0
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("ok"):
                raise HTTPException(
                    status_code=400, detail="Token no válido en Telegram"
                )
            bot_username = data["result"]["username"]
        except Exception as e:
            logger.error(f"Error validating Telegram token: {e}")
            raise HTTPException(
                status_code=400, detail="No se pudo validar el bot token con Telegram"
            )

    # 2. Set webhook
    import os

    api_url = os.getenv("API_PUBLIC_URL", "https://api.plotify.demo").rstrip("/")
    webhook_url = f"{api_url}/api/v1/webhook/telegram/{org_id}"

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/setWebhook",
                json={"url": webhook_url},
            )
            resp.raise_for_status()
        except Exception as e:
            logger.error(f"Error setting webhook: {e}")
            raise HTTPException(
                status_code=500, detail="No se pudo configurar el webhook en Telegram"
            )

    # 3. Guardar en Base de Datos usando la RPC configurada
    try:
        supabase = get_supabase_client()
        supabase.rpc(
            "register_telegram_bot",
            {
                "p_org_id": org_id,
                "p_token": token,
                "p_username": bot_username,
                "p_webhook_url": webhook_url,
            },
        ).execute()
    except Exception as e:
        logger.error(f"Error DB guardando bot: {e}")
        raise HTTPException(
            status_code=500, detail="Error interno guardando configuración del bot"
        )

    return BotResponse(bot_username=bot_username, is_active=True)


@router.get("/{org_id}", response_model=Optional[BotResponse])
async def get_bot(org_id: str):
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("telegram_bots")
            .select("bot_username, is_active")
            .eq("organization_id", org_id)
            .execute()
        )

        if not result.data:
            return None

        bot = result.data[0]
        return BotResponse(bot_username=bot["bot_username"], is_active=bot["is_active"])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error DB fetching bot: {e}")
        raise HTTPException(status_code=500, detail="Error de base de datos")


@router.delete("/{org_id}")
async def delete_bot(org_id: str):
    try:
        supabase = get_supabase_client()

        # Eliminar el webhook de Telegram antes de borrar la DB
        # Fetch token for deleting...
        token_resp = supabase.rpc(
            "get_decrypted_bot_token", {"p_org_id": org_id}
        ).execute()
        token = token_resp.data
        if token:
            async with httpx.AsyncClient() as client:
                await client.post(f"https://api.telegram.org/bot{token}/deleteWebhook")

        supabase.table("telegram_bots").delete().eq("organization_id", org_id).execute()

        # Clear cache in telegram_client if refactored
        from integrations.telegram_client import _client_cache

        if org_id in _client_cache:
            del _client_cache[org_id]

        return {"success": True}
    except Exception as e:
        logger.error(f"Error eliminando bot: {e}")
        raise HTTPException(status_code=500, detail="Error interno al eliminar")
