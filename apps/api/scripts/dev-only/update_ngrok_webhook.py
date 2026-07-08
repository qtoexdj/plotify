import sys
import os
import httpx
from pathlib import Path

# Add apps/api to path to resolve imports correctly
current_dir = Path(__file__).resolve().parent
api_dir = current_dir.parents[1]
sys.path.insert(0, str(api_dir))

from core.config import get_settings
from core.database import get_supabase_client

def get_current_ngrok_url():
    """Tries to query the local ngrok client API to find the active public URL."""
    try:
        resp = httpx.get("http://localhost:4040/api/tunnels", timeout=2.0)
        if resp.status_code == 200:
            data = resp.json()
            tunnels = data.get("tunnels", [])
            for tunnel in tunnels:
                if tunnel.get("proto") == "https":
                    return tunnel.get("public_url")
    except Exception:
        pass
    return None

def update_env_file(env_path: Path, new_url: str):
    """Updates the API_PUBLIC_URL in the .env file."""
    if not env_path.exists():
        print(f"⚠️  No se encontró el archivo .env en: {env_path}")
        return False

    content = env_path.read_text()
    lines = content.splitlines()
    updated = False
    
    for i, line in enumerate(lines):
        if line.strip().startswith("API_PUBLIC_URL="):
            lines[i] = f'API_PUBLIC_URL="{new_url}"'
            updated = True
            break
            
    if updated:
        env_path.write_text("\n".join(lines) + "\n")
        print(f"✅ Archivo .env actualizado con API_PUBLIC_URL=\"{new_url}\"")
        return True
    else:
        # Append if not found
        lines.append(f'API_PUBLIC_URL="{new_url}"')
        env_path.write_text("\n".join(lines) + "\n")
        print(f"➕ API_PUBLIC_URL agregada al archivo .env: \"{new_url}\"")
        return True

def main():
    # 1. Determine the new URL
    new_url = None
    if len(sys.argv) > 1:
        new_url = sys.argv[1].strip().rstrip("/")
        print(f"ℹ️  Usando URL provista manualmente: {new_url}")
    else:
        new_url = get_current_ngrok_url()
        if new_url:
            new_url = new_url.rstrip("/")
            print(f"📡 ngrok local detectado automáticamente: {new_url}")
        else:
            print("❌ No se pudo detectar ngrok local ejecutándose en http://localhost:4040")
            print("Uso: python scripts/dev-only/update_ngrok_webhook.py [NUEVA_URL_NGROK]")
            sys.exit(1)

    # 2. Update .env file
    env_path = api_dir / ".env"
    update_env_file(env_path, new_url)

    # 3. Reload settings (force load new env)
    # We set environment variables manually so pydantic-settings reads the updated values
    os.environ["API_PUBLIC_URL"] = new_url
    
    # Bypass settings cache by instantiating Settings directly or clearing lru_cache
    from core.config import Settings
    settings = Settings()
    
    print(f"⚙️  Configuración cargada. Public URL: {settings.API_PUBLIC_URL}")

    # 4. Get active bots from database
    supabase = get_supabase_client()
    try:
        bots_resp = supabase.table("telegram_bots").select("organization_id, bot_username, is_active").eq("is_active", True).execute()
        bots = bots_resp.data
    except Exception as e:
        print(f"❌ Error consultando bots en Supabase: {e}")
        sys.exit(1)

    if not bots:
        print("ℹ️  No hay bots activos registrados en la base de datos.")
        sys.exit(0)

    print(f"🤖 Se encontraron {len(bots)} bot(s) activo(s) en la base de datos.")

    # 5. For each bot, decrypt token and update webhook
    for bot in bots:
        org_id = bot["organization_id"]
        username = bot["bot_username"]
        print(f"\n🔄 Procesando bot @{username} (Org: {org_id})...")

        # Decrypt token using DB function
        try:
            token_resp = supabase.rpc("get_decrypted_bot_token", {"p_org_id": org_id}).execute()
            token = token_resp.data
            if not token:
                print(f"⚠️  No se pudo recuperar el token descifrado para el bot @{username}")
                continue
        except Exception as e:
            print(f"❌ Error llamando a get_decrypted_bot_token: {e}")
            continue

        # Set Webhook URL
        webhook_url = f"{new_url}/api/v1/webhook/telegram/{org_id}"
        webhook_payload = {"url": webhook_url}
        if settings.TELEGRAM_WEBHOOK_SECRET:
            webhook_payload["secret_token"] = settings.TELEGRAM_WEBHOOK_SECRET

        # Request to Telegram setWebhook
        try:
            print(f"📞 Registrando webhook con Telegram...")
            resp = httpx.post(
                f"https://api.telegram.org/bot{token}/setWebhook",
                json=webhook_payload,
                timeout=10.0
            )
            resp.raise_for_status()
            print(f"✅ Webhook registrado en Telegram: {webhook_url}")
        except Exception as e:
            print(f"❌ Error registrando webhook en Telegram para @{username}: {e}")
            continue

        # Update database webhook_url
        try:
            supabase.rpc(
                "register_telegram_bot",
                {
                    "p_org_id": org_id,
                    "p_token": token,
                    "p_username": username,
                    "p_webhook_url": webhook_url
                }
            ).execute()
            print(f"✅ Base de datos actualizada con la nueva URL de webhook.")
        except Exception as e:
            print(f"❌ Error actualizando la base de datos para @{username}: {e}")


    print("\n🎉 ¡Proceso finalizado! Si la API está corriendo en segundo plano, te recomendamos reiniciarla para asegurar que cargue la nueva variable de entorno.")

if __name__ == "__main__":
    main()
