import httpx
import logging
from typing import Optional
from core.config import get_settings

logger = logging.getLogger(__name__)


class MetaClient:
    """Cliente asíncrono básico para interactuar con la WhatsApp Cloud API de Meta."""

    def __init__(self):
        settings = get_settings()
        self.access_token = settings.META_ACCESS_TOKEN
        self.phone_number_id = settings.META_PHONE_NUMBER_ID
        self.api_version = "v18.0"
        self.base_url = (
            f"https://graph.facebook.com/{self.api_version}/{self.phone_number_id}"
        )

    async def send_text(self, to_phone: str, text: str) -> Optional[dict]:
        """Envía un mensaje de texto plano a un número de WhatsApp usando httpx."""
        if not self.access_token or not self.phone_number_id:
            logger.warning(
                "Credenciales de Meta no configuradas. No se enviará el mensaje real."
            )
            return None

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_phone,
            "type": "text",
            "text": {"body": text},
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/messages",
                    json=payload,
                    headers=headers,
                    timeout=10.0,
                )
                response.raise_for_status()
                data = response.json()
                logger.info(
                    f"Mensaje enviado exitosamente a WhatsApp ({to_phone}). WAMID: {data.get('messages', [{}])[0].get('id')}"
                )
                return data
            except httpx.HTTPStatusError as e:
                logger.error(f"Error HTTP de Meta al enviar mensaje: {e.response.text}")
            except httpx.RequestError as e:
                logger.error(f"Error de red enviando a Meta: {str(e)}")
            except Exception as e:
                logger.error(f"Error inesperado usando MetaClient: {str(e)}")

        return None


# Instancia singleton para ser usada por toda la app
meta_client = MetaClient()
