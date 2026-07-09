import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from services.bot_registration import setup_bot_defaults
import services.bot_registration as bot_registration


def _settings(mini_app_url: str) -> SimpleNamespace:
    return SimpleNamespace(TELEGRAM_MINI_APP_URL=mini_app_url)


@pytest.mark.asyncio
async def test_setup_bot_defaults_configura_comandos_y_menu(monkeypatch):
    """Con TELEGRAM_MINI_APP_URL configurada, setup_bot_defaults debe fijar
    los comandos del bot y el botón de menú por defecto (sin chat_id) con la
    URL de la Mini App apuntando a la org registrada."""
    monkeypatch.setattr(bot_registration, "get_settings", lambda: _settings("https://app.plotify.cl"))

    with patch("integrations.telegram_client.TelegramClient.set_my_commands", new=AsyncMock(return_value={"ok": True})) as mock_commands, \
         patch("integrations.telegram_client.TelegramClient.set_menu_button", new=AsyncMock(return_value={"ok": True})) as mock_menu:
        await setup_bot_defaults(bot_token="123:ABC", org_id="org-uuid-1")

    mock_commands.assert_called_once()
    mock_menu.assert_called_once()
    _, kwargs = mock_menu.call_args
    menu_button = kwargs["menu_button"]
    assert menu_button["type"] == "web_app"
    assert menu_button["web_app"]["url"] == "https://app.plotify.cl/mini?org=org-uuid-1"
    assert "chat_id" not in kwargs


@pytest.mark.asyncio
async def test_setup_bot_defaults_sin_mini_app_url_omite_menu_button(monkeypatch):
    """Sin TELEGRAM_MINI_APP_URL, los comandos se configuran igual pero el
    botón de menú se omite sin lanzar excepción (aditivo, no bloqueante)."""
    monkeypatch.setattr(bot_registration, "get_settings", lambda: _settings(""))

    with patch("integrations.telegram_client.TelegramClient.set_my_commands", new=AsyncMock(return_value={"ok": True})) as mock_commands, \
         patch("integrations.telegram_client.TelegramClient.set_menu_button", new=AsyncMock(return_value={"ok": True})) as mock_menu:
        await setup_bot_defaults(bot_token="123:ABC", org_id="org-uuid-1")

    mock_commands.assert_called_once()
    mock_menu.assert_not_called()


@pytest.mark.asyncio
async def test_telegram_client_set_menu_button_sin_chat_id_es_default():
    """set_menu_button sin chat_id debe omitir el campo del payload (Telegram
    lo interpreta como el botón por defecto para todos los chats privados)."""
    from integrations.telegram_client import TelegramClient
    from unittest.mock import MagicMock

    client = TelegramClient(bot_token="123456:ABC-DEF1234ghIkl-zyx")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value={"ok": True, "result": True})

    with patch("httpx.AsyncClient.post", return_value=mock_response) as mock_post:
        await client.set_menu_button(menu_button={"type": "web_app", "text": "Plotify", "web_app": {"url": "https://plotify.cl/mini"}})

    _, call_kwargs = mock_post.call_args
    assert "chat_id" not in call_kwargs["json"]


@pytest.mark.asyncio
async def test_telegram_client_set_my_commands():
    """set_my_commands debe llamar setMyCommands con la lista de comandos."""
    from integrations.telegram_client import TelegramClient
    from unittest.mock import MagicMock

    client = TelegramClient(bot_token="123456:ABC-DEF1234ghIkl-zyx")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value={"ok": True, "result": True})

    with patch("httpx.AsyncClient.post", return_value=mock_response) as mock_post:
        res = await client.set_my_commands([{"command": "start", "description": "Abrir Plotify"}])

    assert res == {"ok": True, "result": True}
    call_args, call_kwargs = mock_post.call_args
    assert call_args[0].endswith("/setMyCommands")
    assert call_kwargs["json"]["commands"] == [{"command": "start", "description": "Abrir Plotify"}]
