import httpx
from supabase import create_client, Client  # type: ignore
from .config import get_settings
from .logger import get_logger

settings = get_settings()
logger = get_logger(__name__)

# Nota: El cliente oficial de Supabase para Python actualmente es sincrónico bajo el capó
# para operaciones estándar usando postgrest. Para integraciones 100% asíncronas con
# FastAPI, lo envolveremos en funciones async o usaremos httpx directo si es necesario
# un throughput extremo. Por ahora, inicializamos el cliente estándar para Supabase.


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
        )
        new_session._http1_forced = True  # type: ignore[attr-defined]
        session.close()
        supabase.postgrest.session = new_session
    except Exception as exc:  # pragma: no cover - defensivo: nunca romper el cliente
        logger.warning("No se pudo forzar HTTP/1.1 en el cliente Supabase", error=str(exc))


def get_supabase_client() -> Client:
    """Obtiene el cliente de Supabase autenticado con el Service Role Key (Admin)."""
    try:
        supabase: Client = create_client(
            settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY
        )
        _force_http1(supabase)
        return supabase
    except Exception as e:
        logger.error("Error inicializando el cliente de Supabase", error=str(e))
        raise e
