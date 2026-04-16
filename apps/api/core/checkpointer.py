from typing import Optional
from psycopg_pool import AsyncConnectionPool
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from core.config import get_settings
from core.logger import get_logger

settings = get_settings()
logger = get_logger(__name__)

# Configuración del Connection Pool para LangGraph
# Se requiere autocommit=True para la correcta ejecución del saver.
connection_kwargs = {
    "autocommit": True,
    "prepare_threshold": None,
}

# Variable global del pool
pool: Optional[AsyncConnectionPool] = None

if settings.SUPABASE_DB_URL:
    pool = AsyncConnectionPool(
        conninfo=settings.SUPABASE_DB_URL,
        max_size=20,
        kwargs=connection_kwargs,
        open=False,  # Wait for lifespan to open it
    )


async def setup_checkpointer():
    """Initializes tables for LangGraph checkpoints if they do not exist."""
    if not pool:
        logger.warning(
            "⚠️ SUPABASE_DB_URL no configurado. Se usará memoria en RAM como respaldo."
        )
        return

    try:
        await pool.open()
        # Usar una conexión directa del pool para crear las tablas
        async with pool.connection() as conn:
            saver = AsyncPostgresSaver(conn)
            await saver.setup()
            logger.info(
                "✅ Tablas de LangGraph PostgreSQL Checkpointer inicializadas correctamente."
            )
    except Exception as e:
        logger.error(f"❌ Error inicializando tablas del checkpointer: {e}")


async def close_checkpointer():
    """Cierra el pool de conexiones."""
    if pool:
        await pool.close()
        logger.info("🔌 Pool de conexiones PostgreSQL cerrado.")
