import importlib.util
from pathlib import Path
from unittest.mock import AsyncMock


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "dev-only"
    / "update_ngrok_webhook.py"
)


def _load_script_module():
    spec = importlib.util.spec_from_file_location("update_ngrok_webhook", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_update_env_file_sincroniza_api_y_miniapp_sin_tocar_secretos(tmp_path):
    module = _load_script_module()
    env_path = tmp_path / ".env"
    env_path.write_text(
        'API_PUBLIC_URL="https://old.ngrok-free.app"\n'
        'TELEGRAM_MINI_APP_URL="https://old.ngrok-free.app"\n'
        'MINIAPP_SESSION_SECRET="keep-me-secret"\n'
    )

    assert module.update_env_file(env_path, "https://new.ngrok-free.app") is True

    content = env_path.read_text()
    assert 'API_PUBLIC_URL="https://new.ngrok-free.app"' in content
    assert 'TELEGRAM_MINI_APP_URL="https://new.ngrok-free.app"' in content
    assert 'MINIAPP_SESSION_SECRET="keep-me-secret"' in content


def test_update_bot_menu_reutiliza_configuracion_canonica(monkeypatch):
    module = _load_script_module()
    setup_defaults = AsyncMock()
    monkeypatch.setattr(module, "setup_bot_defaults", setup_defaults)

    module.update_bot_menu(bot_token="123:ABC", org_id="org-1")

    setup_defaults.assert_awaited_once_with(bot_token="123:ABC", org_id="org-1")
