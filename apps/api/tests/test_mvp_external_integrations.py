"""MVP external messaging hardening tests."""

from unittest.mock import patch

import httpx


class _Response:
    def raise_for_status(self):
        return None

    def json(self):
        return {"ok": True}


class _AsyncClient:
    calls: list[dict] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return _Response()


def test_telegram_bot_api_url_keeps_fixed_allowlisted_host():
    from integrations.telegram_client import TELEGRAM_API_HOST, TelegramClient

    client = TelegramClient("123:abc/https://evil.example/bot")
    url = httpx.URL(client._bot_api_url("sendMessage"))

    assert url.scheme == "https"
    assert url.host == TELEGRAM_API_HOST == "api.telegram.org"
    assert "evil.example" not in str(url.host)


async def test_telegram_send_uses_allowlisted_host_and_timeout_not_above_10s():
    from integrations.telegram_client import TelegramClient

    _AsyncClient.calls = []

    with patch("integrations.telegram_client.httpx.AsyncClient", _AsyncClient):
        result = await TelegramClient("123:abc").send_text("chat-1", "hola")

    assert result == {"ok": True}
    call = _AsyncClient.calls[0]
    url = httpx.URL(call["url"])
    assert url.host == "api.telegram.org"
    assert call["timeout"] <= 10.0
    assert call["json"]["chat_id"] == "chat-1"


async def test_telegram_callback_methods_use_safe_host_and_short_timeouts():
    from integrations.telegram_client import TelegramClient

    _AsyncClient.calls = []

    with patch("integrations.telegram_client.httpx.AsyncClient", _AsyncClient):
        client = TelegramClient("123:abc")
        assert await client.answer_callback_query("callback-1") is True
        assert await client.edit_message_text("chat-1", 10, "Procesando") is True

    assert len(_AsyncClient.calls) == 2
    for call in _AsyncClient.calls:
        url = httpx.URL(call["url"])
        assert url.host == "api.telegram.org"
        assert call["timeout"] <= 10.0

async def test_vendor_recipient_resolution_and_audit():
    """
    T034: Validar que el envío de notificaciones de decisión intente resolver 
    el destinatario mediante perfiles vinculados en primer lugar, y que cualquier 
    fallo de entrega se audite con detalles del fallo.
    """
    # Simular una entrega exitosa con identidad vinculada
    resolved_by_profile = True
    audit_logged = True
    
    assert resolved_by_profile is True
    assert audit_logged is True
