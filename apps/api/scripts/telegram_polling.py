import os
import time
import requests  # type: ignore
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_PORT = os.getenv("API_PORT", "8005")
LOCAL_WEBHOOK_URL = f"http://localhost:{API_PORT}/api/v1/webhook/telegram"


def poll_updates():
    offset = 0
    print("🚀 Iniciando polling de Telegram para desarrollo local...")
    print(f"📡 Reenviando actualizaciones a: {LOCAL_WEBHOOK_URL}")

    while True:
        try:
            url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates"
            params = {"offset": offset, "timeout": 30}
            response = requests.get(url, params=params, timeout=35)
            data = response.json()

            if data.get("ok"):
                for update in data.get("result", []):
                    print(f"📥 Nueva actualización recibida: {update.get('update_id')}")

                    # Forward to local webhook
                    try:
                        fw_res = requests.post(
                            LOCAL_WEBHOOK_URL, json=update, timeout=10
                        )
                        print(f"🔄 Reenviado a local: HTTP {fw_res.status_code}")
                    except Exception as e:
                        print(f"❌ Error al reenviar a local: {e}")

                    offset = update["update_id"] + 1
            else:
                print(f"⚠️ Error de Telegram API: {data.get('description')}")

        except Exception as e:
            print(f"❌ Error en polling loop: {e}")

        time.sleep(1)


if __name__ == "__main__":
    if not BOT_TOKEN:
        print("❌ Error: TELEGRAM_BOT_TOKEN no encontrado en el .env")
    else:
        try:
            poll_updates()
        except KeyboardInterrupt:
            print("\n🛑 Polling detenido por el usuario.")
