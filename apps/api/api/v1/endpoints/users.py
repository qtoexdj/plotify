from fastapi import APIRouter, Depends
from arq.connections import ArqRedis
import uuid
import os
from core.config import get_settings
from core.logger import get_logger
from core.database import get_supabase_client
from core.redis import get_arq_pool
from schemas.telegram_vincule import TelegramTokenRequest, TelegramTokenResponse
from api.deps import verify_internal_secret

router = APIRouter(dependencies=[Depends(verify_internal_secret)])
logger = get_logger(__name__)
settings = get_settings()


@router.post("/telegram-token", response_model=TelegramTokenResponse)
async def generate_telegram_vincule_token(
    payload: TelegramTokenRequest, redis: ArqRedis = Depends(get_arq_pool)
):
    """
    Genera un token temporal para vinculación de Telegram.
    El token se guarda en Redis con un TTL de 15 minutos (900s).
    """
    # Determinar el bot de la organización
    supabase = get_supabase_client()
    # Asume que hay un modo de obtener organization_id a partir de `payload.profile_id`,
    # idealmente `payload` debería incluir `organization_id` explícitamente.
    # Vamos a usar un query para sacarlo desde vendors/profiles if not provided.
    org_id = getattr(payload, "organization_id", None)
    bot_username = os.getenv(
        "TELEGRAM_BOT_USER", "PlotifyBot"
    )  # Fallback Si no se proporciona

    if org_id:
        result = (
            supabase.table("telegram_bots")
            .select("bot_username")
            .eq("organization_id", org_id)
            .eq("is_active", True)
            .execute()
        )
        if result.data:
            bot_username = result.data[0]["bot_username"]

    # IMPORTANTE: Si fallara a pesar de todo, devolvemos un 400 si exigimos que cada org tenga el suyo,
    # pero por ahora seguimos con fallback.

    # 1. Generar token único (short UUID or random hash)
    # Usamos uuid4 hex para que sea amigable en la URL
    link_token = str(uuid.uuid4()).replace("-", "")[:12]

    # 2. Guardar en Redis: LINK_TOKEN -> PROFILE_ID
    # Prefijo para evitar colisiones
    redis_key = f"tg_link:{link_token}"

    # TTL de 15 minutos
    await redis.setex(redis_key, 900, payload.profile_id)

    response = TelegramTokenResponse(
        token=link_token,
        bot_username=bot_username,
        deep_link=f"https://t.me/{bot_username}?start={link_token}",
    )

    logger.info(
        "Token de vinculación de Telegram generado",
        profile_id=payload.profile_id,
        token=link_token,
    )

    return response
