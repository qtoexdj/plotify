from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from core.config import get_settings
from core.logger import get_logger

settings = get_settings()
logger = get_logger(__name__)

# Configuración del Connection Pool para LangGraph.
# Se requiere autocommit=True para la correcta ejecución del saver.
connection_kwargs = {
    "autocommit": True,
    "prepare_threshold": None,
}

pool: AsyncConnectionPool | None = None
_pool_ready = False


def _build_pool() -> AsyncConnectionPool | None:
    if not settings.SUPABASE_DB_URL:
        return None
    return AsyncConnectionPool(
        conninfo=settings.SUPABASE_DB_URL,
        min_size=1,
        max_size=20,
        kwargs=connection_kwargs,
        open=False,
        timeout=settings.CHECKPOINTER_CONNECT_TIMEOUT_SECONDS,
        reconnect_timeout=settings.CHECKPOINTER_CONNECT_TIMEOUT_SECONDS,
    )


def get_checkpointer_pool() -> AsyncConnectionPool | None:
    """Return the PostgreSQL pool only after startup verified it can connect."""
    if _pool_ready:
        return pool
    return None


async def _setup_tables_once() -> None:
    conn = await AsyncConnection.connect(
        settings.SUPABASE_DB_URL,
        connect_timeout=settings.CHECKPOINTER_CONNECT_TIMEOUT_SECONDS,
        **connection_kwargs,
    )
    async with conn:
        saver = AsyncPostgresSaver(conn)
        await saver.setup()


async def setup_checkpointer():
    """Initializes tables for LangGraph checkpoints if they do not exist."""
    global pool, _pool_ready

    if _pool_ready:
        return

    if not settings.SUPABASE_DB_URL:
        logger.warning(
            "⚠️ SUPABASE_DB_URL no configurado. Se usará memoria en RAM como respaldo."
        )
        return

    try:
        await _setup_tables_once()
        if pool is None:
            pool = _build_pool()
        if pool is None:
            return
        await pool.open(
            wait=True,
            timeout=settings.CHECKPOINTER_CONNECT_TIMEOUT_SECONDS,
        )
        _pool_ready = True
        logger.info(
            "✅ Tablas de LangGraph PostgreSQL Checkpointer inicializadas correctamente."
        )
    except Exception as e:
        _pool_ready = False
        if pool:
            try:
                await pool.close(timeout=settings.CHECKPOINTER_CONNECT_TIMEOUT_SECONDS)
            finally:
                pool = None
        if settings.CHECKPOINTER_REQUIRED:
            logger.error(
                "❌ Error inicializando tablas del checkpointer.",
                error=str(e),
            )
            raise
        logger.warning(
            "⚠️ Checkpointer PostgreSQL no disponible. Se usará memoria en RAM como respaldo.",
            error=str(e),
        )


async def close_checkpointer():
    """Cierra el pool de conexiones."""
    global pool, _pool_ready

    if pool:
        await pool.close(timeout=settings.CHECKPOINTER_CONNECT_TIMEOUT_SECONDS)
        pool = None
        _pool_ready = False
        logger.info("🔌 Pool de conexiones PostgreSQL cerrado.")
