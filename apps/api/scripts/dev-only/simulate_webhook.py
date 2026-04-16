import httpx
import asyncio
import os

if os.getenv("ENVIRONMENT") == "production":
    raise RuntimeError("Este script solo puede ejecutarse en desarrollo")

# Un payload típico de Webhook que envía Meta (WhatsApp Cloud API) cuando un usuario manda un mensaje de texto
META_PAYLOAD = {
    "object": "whatsapp_business_account",
    "entry": [
        {
            "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
            "changes": [
                {
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {
                            "display_phone_number": "16505551111",
                            "phone_number_id": "123456123",
                        },
                        "contacts": [
                            {
                                "profile": {"name": "Matias Burgos"},
                                "wa_id": "56912345678",  # Teléfono del usuario
                            }
                        ],
                        "messages": [
                            {
                                "from": "56912345678",  # Igual al wa_id
                                "id": "wamid.HBgLNTY5NDUxMxxxxxxxxx=",  # ID del mensaje en capa Meta
                                "timestamp": "1710000000",
                                "text": {
                                    "body": "Hola, me interesa comprar una parcela en el sur"
                                },
                                "type": "text",
                            }
                        ],
                    },
                    "field": "messages",
                }
            ],
        }
    ],
}


async def send_test_webhook():
    print("Enviando simulación de Webhook...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://localhost:8080/api/v1/webhook/meta", json=META_PAYLOAD
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
        except Exception as e:
            print(f"Error de conexión: {e}")
            print(
                "¿Olvidaste levantar el servidor con 'uvicorn main:app --reload --port 8080'?"
            )


if __name__ == "__main__":
    asyncio.run(send_test_webhook())
