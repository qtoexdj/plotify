from typing import Optional

from core.config import get_settings
from core.logger import get_logger
from integrations.telegram_client import TelegramClient

logger = get_logger(__name__)

DEFAULT_BOT_COMMANDS = [
    {"command": "start", "description": "Abrir Plotify"},
]

_MINI_APP_URL_WARNED = False


async def setup_bot_defaults(bot_token: str, org_id: str) -> None:
    """Configura el menú persistente y los comandos de un bot recién registrado/actualizado.

    Se invoca desde el flujo existente de registro de `telegram_bots`
    (contrato deep-links-notificaciones.md, sección "Menú persistente del
    bot"). Es aditivo: cualquier fallo contra la API de Telegram se loguea
    y NO interrumpe el registro del bot (el token y el webhook ya quedaron
    guardados antes de llegar aquí).
    """
    client = TelegramClient(bot_token=bot_token, org_id=org_id)

    await client.set_my_commands(DEFAULT_BOT_COMMANDS)

    settings = get_settings()
    mini_app_url = settings.TELEGRAM_MINI_APP_URL
    if not mini_app_url:
        global _MINI_APP_URL_WARNED
        if not _MINI_APP_URL_WARNED:
            logger.warning(
                "TELEGRAM_MINI_APP_URL no configurada; se omite setChatMenuButton en el registro del bot."
            )
            _MINI_APP_URL_WARNED = True
        return

    menu_button = {
        "type": "web_app",
        "text": "Abrir Plotify",
        "web_app": {"url": f"{mini_app_url.rstrip('/')}/mini?org={org_id}"},
    }
    await client.set_menu_button(menu_button=menu_button)
