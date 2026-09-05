import os
from pathlib import Path
from dotenv import load_dotenv

# Cargar .env de apps/api si existe, o del directorio actual
current_dir = Path(__file__).resolve().parent
api_env_path = current_dir.parent.parent / "apps" / "api" / ".env"

if api_env_path.exists():
    load_dotenv(dotenv_path=api_env_path)
else:
    load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://swkrnjdpnlrgxgotmfxy.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
