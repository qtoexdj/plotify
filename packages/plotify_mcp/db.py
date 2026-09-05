import threading
from supabase import create_client, Client
from .config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

_client_lock = threading.Lock()
_client: Client | None = None

def get_supabase() -> Client:
    """Obtiene el cliente singleton de Supabase."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                if not SUPABASE_SERVICE_ROLE_KEY:
                    raise ValueError("SUPABASE_SERVICE_ROLE_KEY no configurada en el entorno")
                _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _client
