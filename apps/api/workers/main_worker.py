from arq.connections import RedisSettings
from core.config import get_settings
from core.logger import setup_logging, get_logger
from core.database import get_supabase_client
from workers.tasks.message_processor import (
    process_incoming_message,
    link_telegram_account,
)
from workers.tasks.approval_notifier import notify_admin_approval
from workers.tasks.approval_processor import process_admin_decision, send_decision_notifications
from workers.tasks.notification_worker import (
    retry_generated_document_delivery,
    send_generated_document,
    send_notification,
)

from core.checkpointer import setup_checkpointer, close_checkpointer

import traceback as tb

settings = get_settings()


async def startup(ctx: dict) -> None:
    """Ejecutado al iniciar el worker."""
    setup_logging()
    logger = get_logger(__name__)

    # Inicializar checkpointer para LangGraph
    await setup_checkpointer()

    logger.info("👷 Worker ARQ de Plotify iniciado. Listo para procesar mensajes.")


async def shutdown(ctx: dict) -> None:
    """Ejecutado al apagar el worker."""
    logger = get_logger(__name__)

    # Cerrar conexiones
    await close_checkpointer()

    logger.info("🛑 Worker ARQ apagándose...")


async def on_job_end(ctx: dict) -> None:
    """
    Callback de ARQ invocado cuando un job finaliza.

    Verificamos si el job falló. Si falló y excedió los reintentos
    (job_try >= max_tries), lo movemos a la Dead Letter Queue (M2.2).
    """
    logger = get_logger(__name__)

    # Extraer variables del contexto (depende de la versión de ARQ puede estar en kwargs o ctx)
    success = ctx.get("success", True)
    if success:
        return

    attempts = ctx.get("job_try", 0)
    max_tries = settings.__class__.__dict__.get("max_tries", 3)

    # Si aún le quedan reintentos, ARQ lo volverá a intentar. No es DLQ.
    if attempts < max_tries:
        return

    job_id = ctx.get("job_id", "unknown")
    function = ctx.get("job_name", ctx.get("function", "unknown"))
    job_return = ctx.get("job_return")

    exc = (
        job_return if isinstance(job_return, Exception) else Exception(str(job_return))
    )

    logger.error(
        "job_dead_lettered",
        job_function=function,
        job_id=job_id,
        attempts=attempts,
        error=str(exc),
    )

    try:
        supabase = get_supabase_client()

        # Recuperar args/kwargs del contexto si están presentes, de lo contrario vacío
        job_kwargs = ctx.get("kwargs", {})

        supabase.table("dead_letter_queue").insert(
            {
                "job_function": function,
                "payload": job_kwargs if isinstance(job_kwargs, dict) else {},
                "error_message": str(exc),
                "traceback": tb.format_exc(),
                "attempts": attempts,
            }
        ).execute()
        logger.info("Job movido a dead_letter_queue", job_id=job_id)
    except Exception as db_err:
        # Si la BD también falla, al menos lo registramos en logs
        logger.error(
            "No se pudo persistir en dead_letter_queue",
            job_id=job_id,
            db_error=str(db_err),
        )


# Clase de configuración requerida por CLI de arq
class WorkerSettings:
    """
    Configuración principal del worker.
    Se ejecuta desde consola: `arq workers.main_worker.WorkerSettings`
    """

    # Parseamos la url de Redis "redis://localhost:6379/0" a RedisSettings nativo de arq
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)

    # Registro de tareas en background
    functions = [
        process_incoming_message,
        notify_admin_approval,
        process_admin_decision,
        send_decision_notifications,
        link_telegram_account,
        send_notification,  # Fase 7 — Notificaciones proactivas
        send_generated_document,
        retry_generated_document_delivery,
    ]

    # Eventos de ciclo de vida
    on_startup = startup
    on_shutdown = shutdown

    # Configuraciones de reintentos
    max_tries = 3  # Reintentar hasta 3 veces si un nodo LLM/DB falla intermitentemente

    # M2.2: Callback de Dead Letter Queue — se invoca al finalizar cada job
    on_job_end = on_job_end
