from supabase import create_client, Client  # type: ignore
from .config import get_settings
from .logger import get_logger

settings = get_settings()
logger = get_logger(__name__)

# Nota: El cliente oficial de Supabase para Python actualmente es sincrónico bajo el capó
# para operaciones estándar usando postgrest. Para integraciones 100% asíncronas con
# FastAPI, lo envolveremos en funciones async o usaremos httpx directo si es necesario
# un throughput extremo. Por ahora, inicializamos el cliente estándar para Supabase.


def get_supabase_client() -> Client:
    """Obtiene el cliente de Supabase autenticado con el Service Role Key (Admin)."""
    try:
        supabase: Client = create_client(
            settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY
        )
        return supabase
    except Exception as e:
        logger.error("Error inicializando el cliente de Supabase", error=str(e))
        raise e
