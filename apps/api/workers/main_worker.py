from arq import cron
from arq.connections import RedisSettings
from core.config import get_settings
from core.logger import setup_logging, get_logger
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
from workers.tasks.legal_document_ingestion import (
    process_legal_document_ingestion,
    reconcile_legal_document_ingestions,
)
from workers.tasks.legal_title_analysis import analyze_project_title
from workers.tasks.geometry_enrichment import process_geometry_enrichment
from workers.tasks.escritura_workflow_outbox import process_escritura_workflow_outbox
from workers.tasks.llm_model_catalog import sync_llm_model_catalog
from services.worker_job_failures import require_explicit_job_outcome

from core.checkpointer import setup_checkpointer, close_checkpointer

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

    try:
        success = require_explicit_job_outcome(ctx)
    except RuntimeError:
        logger.error(
            "job_outcome_missing",
            job_id=ctx.get("job_id"),
            job_name=ctx.get("job_name"),
        )
        return
    if not success:
        logger.error("job_failed_with_explicit_outcome", job_id=ctx.get("job_id"))


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
        process_legal_document_ingestion,
        analyze_project_title,
        process_geometry_enrichment,
        process_escritura_workflow_outbox,
    ]

    cron_jobs = [
        cron(
            reconcile_legal_document_ingestions,
            name="reconcile_legal_document_ingestions",
            second=20,
            run_at_startup=True,
            unique=True,
            max_tries=1,
        ),
        cron(
            process_escritura_workflow_outbox,
            name="reconcile_escritura_workflow_outbox",
            second=45,
            run_at_startup=True,
            unique=True,
            max_tries=1,
        ),
        cron(
            sync_llm_model_catalog,
            name="sync_llm_model_catalog_daily",
            hour=4,
            minute=15,
            run_at_startup=False,
            unique=True,
            max_tries=1,
        )
    ]

    # Eventos de ciclo de vida
    on_startup = startup
    on_shutdown = shutdown

    # Tope por job. Por defecto arq usa 300s, que cortaba el análisis de título
    # con razonamiento alto (gpt-5 high/xhigh tarda mucho por llamada) ANTES de
    # que actuara el timeout propio del agente. Lo atamos al presupuesto del
    # agente + holgura para gather/persistencia, así subir
    # LEGAL_TITLE_AGENT_TIMEOUT_SECONDS en el entorno sí tiene efecto real.
    job_timeout = settings.LEGAL_TITLE_AGENT_TIMEOUT_SECONDS + 120

    # Configuraciones de reintentos
    max_tries = 3  # Reintentar hasta 3 veces si un nodo LLM/DB falla intermitentemente

    # M2.2: Callback de Dead Letter Queue — se invoca al finalizar cada job
    on_job_end = on_job_end
