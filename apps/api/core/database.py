import threading

import httpx
from supabase import create_client, Client  # type: ignore
from supabase.lib.client_options import ClientOptions
from .config import get_settings
from .logger import get_logger

logger = get_logger(__name__)

# Timeout explícito por petición PostgREST (segundos). El default de
# supabase-py es 120s: una llamada bloqueada (p. ej. esperando un lock de fila
# de una transacción huérfana) dejaba la conexión abierta 120s y el cliente
# abandonaba la petición a mitad de camino → transacción huérfana en el pooler.
# 30s es generoso para cualquier RPC/query del pipeline (los pasos lentos son
# llamadas LLM que no usan este cliente) y corta el abandono mucho antes.
POSTGREST_TIMEOUT_SECONDS = 30.0

# Singleton por proceso: evita que cada uno de los ~145 call sites cree su
# propio httpx.Client con su propio pool de conexiones TCP. Cada cliente
# abandonado (por timeout) dejaba conexiones reservadas para siempre en
# Supavisor y agotaba el pool → PGRST003.
_client_lock = threading.Lock()
_client: Client | None = None


def _force_http1(supabase: Client) -> None:
    """Fuerza HTTP/1.1 en la sesión PostgREST del cliente.

    postgrest crea su httpx.Client con ``http2=True`` hardcodeado y sin opción
    para desactivarlo. Varios servicios (p. ej. ``escritura_readiness``) hacen
    fan-out de consultas con ``asyncio.gather`` + ``asyncio.to_thread`` sobre el
    MISMO cliente: una única conexión HTTP/2 usada desde varios hilos a la vez
    corrompe el estado de compresión HPACK y Supabase corta la conexión con
    ``RemoteProtocolError: ConnectionTerminated (COMPRESSION_ERROR, code 9)`` →
    500 intermitente. HTTP/1.1 usa un pool de conexiones con locking, seguro
    entre hilos, sin diferencia funcional con la API REST de Supabase.
    """
    try:
        session = supabase.postgrest.session
        if getattr(session, "_http1_forced", False):
            return
        new_session = httpx.Client(
            base_url=session.base_url,
            headers=session.headers,
            timeout=session.timeout,
            follow_redirects=True,
            http2=False,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
        new_session._http1_forced = True  # type: ignore[attr-defined]
        session.close()
        supabase.postgrest.session = new_session
    except Exception as exc:  # pragma: no cover - defensivo: nunca romper el cliente
        logger.warning("No se pudo forzar HTTP/1.1 en el cliente Supabase", error=str(exc))


def _build_client() -> Client:
    """Construye un cliente Supabase con timeout explícito y HTTP/1.1."""
    current_settings = get_settings()
    supabase: Client = create_client(
        current_settings.SUPABASE_URL,
        current_settings.SUPABASE_SERVICE_ROLE_KEY,
        options=ClientOptions(
            postgrest_client_timeout=POSTGREST_TIMEOUT_SECONDS,
        ),
    )
    _force_http1(supabase)
    return supabase


def get_supabase_client() -> Client:
    """Obtiene el cliente de Supabase autenticado con el Service Role Key (Admin).

    Singleton por proceso (thread-safe): reutiliza UN pool de conexiones HTTP.
    Esto evita la proliferación de pools que agotaba el pooler de Supabase con
    conexiones huérfanas (ver diagnosis SDD019: PGRST003).
    """
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                try:
                    _client = _build_client()
                except Exception as e:
                    logger.error("Error inicializando el cliente de Supabase", error=str(e))
                    raise e
    return _client


def reset_supabase_client() -> None:
    """Cierra y descarta el cliente singleton (para tests y reinicios limpios)."""
    global _client
    with _client_lock:
        if _client is not None:
            try:
                _client.postgrest.session.close()
            except Exception:  # pragma: no cover - defensivo
                pass
            _client = None
