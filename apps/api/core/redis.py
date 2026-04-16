"""
Pool centralizado de Redis para jobs ARQ.

Un único pool de ArqRedis compartido por todos los endpoints de la API.
Esto evita que cada router cree su propia conexión independiente,
reduce el consumo de sockets y simplifica la configuración.

Ref: Plan M2.3 - §5.2.5
"""

from arq.connections import ArqRedis, RedisSettings, create_pool
from core.config import get_settings
from core.logger import get_logger

logger = get_logger(__name__)

_arq_pool: ArqRedis | None = None


async def get_arq_pool() -> ArqRedis:
    """
    Retorna el pool de ArqRedis compartido (singleton por proceso).

    Crea la conexión la primera vez que se invoca y la reutiliza
    en todas las llamadas siguientes. Seguro para uso concurrente
    en FastAPI con un solo proceso uvicorn.

    Returns:
        ArqRedis: Pool de conexiones listo para encolar jobs.
    """
    global _arq_pool
    if _arq_pool is None:
        settings = get_settings()
        redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
        _arq_pool = await create_pool(redis_settings)
        logger.info(
            "Pool de ArqRedis centralizado creado", redis_url=settings.REDIS_URL
        )
    return _arq_pool


async def close_arq_pool() -> None:
    """
    Cierra el pool de ArqRedis al apagar la aplicación.
    Llamar desde el evento lifespan shutdown de FastAPI.
    """
    global _arq_pool
    if _arq_pool is not None:
        await _arq_pool.aclose()
        _arq_pool = None
        logger.info("Pool de ArqRedis cerrado correctamente")
