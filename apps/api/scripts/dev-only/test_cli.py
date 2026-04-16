import httpx
import asyncio
import os
import sys

# Configuración básica
API_PORT = os.getenv("API_PORT", "8005")
BASE_URL = f"http://localhost:{API_PORT}/api/v1"
# Usamos la org_id encontrada en la DB para las pruebas
DEFAULT_ORG_ID = "4f066ccc-a31e-4415-8cec-496b0728c44a"

async def simulate_telegram_message(text: str, org_id: str = DEFAULT_ORG_ID):
    print(f"\n🚀 Simulando mensaje de Telegram para Org: {org_id}")
    print(f"📝 Texto: {text}")
    
    payload = {
        "update_id": 1000000,
        "message": {
            "message_id": 99,
            "from": {
                "id": 12345678,
                "is_bot": False,
                "first_name": "Usuario",
                "last_name": "Prueba",
                "username": "user_test"
            },
            "chat": {
                "id": 12345678,
                "first_name": "Usuario",
                "last_name": "Prueba",
                "username": "user_test",
                "type": "private"
            },
            "date": 1641769200,
            "text": text
        }
    }
    
    async with httpx.AsyncClient() as client:
        try:
            url = f"{BASE_URL}/webhook/telegram/{org_id}"
            response = await client.post(url, json=payload)
            print(f"✅ Status: {response.status_code}")
            print(f"📩 Response: {response.json()}")
        except Exception as e:
            print(f"❌ Error: {e}")

async def simulate_whatsapp_message(text: str):
    print(f"\n🚀 Simulando mensaje de WhatsApp (Meta)")
    print(f"📝 Texto: {text}")
    
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "WABA_ID",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "16505551111", "phone_number_id": "123456"},
                    "messages": [{
                        "from": "56912345678",
                        "id": f"wamid.{os.urandom(8).hex()}",
                        "timestamp": "1710000000",
                        "text": {"body": text},
                        "type": "text"
                    }]
                },
                "field": "messages"
            }]
        }]
    }
    
    async with httpx.AsyncClient() as client:
        try:
            url = f"{BASE_URL}/webhook/meta"
            response = await client.post(url, json=payload)
            print(f"✅ Status: {response.status_code}")
            print(f"📩 Response: {response.json()}")
        except Exception as e:
            print(f"❌ Error: {e}")

async def check_health():
    print(f"\n🩺 Verificando salud del sistema...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/health")
            print(f"✅ Status: {response.status_code}")
            print(f"📊 Response: {response.json()}")
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python scripts/dev-only/test_cli.py [health|telegram|whatsapp] [texto]")
        sys.exit(1)
        
    cmd = sys.argv[1].lower()
    text = sys.argv[2] if len(sys.argv) > 2 else "Hola desde la CLI"
    
    if cmd == "health":
        asyncio.run(check_health())
    elif cmd == "telegram":
        asyncio.run(simulate_telegram_message(text))
    elif cmd == "whatsapp":
        asyncio.run(simulate_whatsapp_message(text))
    else:
        print(f"Comando desconocido: {cmd}")
