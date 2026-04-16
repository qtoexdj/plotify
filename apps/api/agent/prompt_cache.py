"""
Cache de prompts del sistema con Redis (TTL 5 min).

Lee el prompt activo desde la tabla prompt_versions (via Supabase)
y lo almacena en Redis para evitar queries repetidas en cada mensaje.

Uso:
    content = await get_active_prompt("sales_agent")
    await invalidate_prompt_cache("sales_agent")
"""

import asyncio
from core.redis import get_arq_pool
from core.database import get_supabase_client
from core.logger import get_logger

logger = get_logger(__name__)

PROMPT_CACHE_KEY = "prompt:{slug}:active"
PROMPT_CACHE_TTL = 300  # 5 minutos


async def get_active_prompt(slug: str) -> str:
    """
    Retorna el contenido del prompt activo para el slug dado.

    Estrategia cache-aside:
    1. Busca en Redis → hit → retorna inmediatamente.
    2. Miss → consulta Supabase → guarda en Redis con TTL 5 min → retorna.

    Raises:
        ValueError: Si no existe ninguna versión activa para el slug.
    """
    redis = await get_arq_pool()
    cache_key = PROMPT_CACHE_KEY.format(slug=slug)

    cached = await redis.get(cache_key)
    if cached:
        logger.debug("prompt_cache_hit", slug=slug)
        return cached.decode() if isinstance(cached, bytes) else cached

    logger.info("prompt_cache_miss", slug=slug)

    supabase = get_supabase_client()

    # Paso 1: obtener el prompt_id por slug
    prompt_result = await asyncio.to_thread(
        lambda: (
            supabase.table("system_prompts")
            .select("id")
            .eq("slug", slug)
            .single()
            .execute()
        )
    )

    if not prompt_result.data:
        raise ValueError(f"No se encontró system_prompt con slug='{slug}'")

    prompt_id = prompt_result.data["id"]

    # Paso 2: obtener la versión activa
    version_result = await asyncio.to_thread(
        lambda: (
            supabase.table("prompt_versions")
            .select("content")
            .eq("prompt_id", prompt_id)
            .eq("is_active", True)
            .single()
            .execute()
        )
    )

    if not version_result.data:
        raise ValueError(
            f"No hay versión activa para el prompt slug='{slug}'. "
            "Activa una versión en la tabla prompt_versions."
        )

    content: str = version_result.data["content"]

    await redis.setex(cache_key, PROMPT_CACHE_TTL, content)
    logger.info("prompt_cached", slug=slug, ttl=PROMPT_CACHE_TTL)

    return content


async def invalidate_prompt_cache(slug: str) -> None:
    """
    Invalida el cache de un prompt.
    Llamar inmediatamente después de activar una nueva versión.
    """
    redis = await get_arq_pool()
    await redis.delete(PROMPT_CACHE_KEY.format(slug=slug))
    logger.info("prompt_cache_invalidated", slug=slug)
