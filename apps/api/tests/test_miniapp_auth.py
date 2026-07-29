import time
import hmac
import hashlib
import json
import urllib.parse
import pytest
import jwt
import uuid
from unittest.mock import AsyncMock
from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from core.config import get_settings
from core.miniapp_session import (
    validate_telegram_init_data,
    create_miniapp_session,
    verify_miniapp_session,
    require_miniapp_admin,
    MiniappUserContext
)

BOT_TOKEN_PRUEBA = "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"


def _generar_init_data(data_dict: dict, bot_token: str) -> str:
    """Helper para firmar y serializar initData de Telegram para pruebas."""
    # Ordenar y construir data_check_string
    pairs = sorted([f"{k}={v}" for k, v in data_dict.items() if k != "hash"])
    data_check_string = "\n".join(pairs)
    
    # Calcular hash
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    signature = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
    
    # Construir querystring
    full_dict = {**data_dict, "hash": signature}
    return urllib.parse.urlencode(full_dict)


def test_validate_telegram_init_data_valido():
    """Valida que un initData con firma correcta y en tiempo pase exitosamente."""
    user_data = {
        "id": 12345678,
        "first_name": "Juan",
        "last_name": "Perez",
        "username": "juanperez"
    }
    init_params = {
        "auth_date": str(int(time.time())),
        "query_id": "AAHdFtQnAAAAAN0W1Cc",
        "user": json.dumps(user_data)
    }
    
    init_data_qs = _generar_init_data(init_params, BOT_TOKEN_PRUEBA)
    
    success, data = validate_telegram_init_data(BOT_TOKEN_PRUEBA, init_data_qs)
    
    assert success is True
    assert data is not None
    assert data["query_id"] == "AAHdFtQnAAAAAN0W1Cc"
    assert data["user"]["id"] == 12345678
    assert data["user"]["first_name"] == "Juan"


def test_validate_telegram_init_data_hash_invalido():
    """Valida que si el hash es alterado, la validación falle."""
    user_data = {"id": 12345678, "first_name": "Juan"}
    init_params = {
        "auth_date": str(int(time.time())),
        "user": json.dumps(user_data)
    }
    
    init_data_qs = _generar_init_data(init_params, BOT_TOKEN_PRUEBA)
    # Alterar el hash en el querystring
    init_data_qs_alterado = init_data_qs.replace("hash=", "hash=mal")
    
    success, data = validate_telegram_init_data(BOT_TOKEN_PRUEBA, init_data_qs_alterado)
    
    assert success is False
    assert data["error"] == "invalid_signature"


def test_validate_telegram_init_data_expirado():
    """Valida que si el auth_date excede la ventana permitida, sea rechazado."""
    max_age = get_settings().TELEGRAM_INIT_DATA_MAX_AGE_SECONDS
    # Usar fecha pasada fuera de la ventana de 10 minutos
    auth_date_viejo = int(time.time()) - (max_age + 60)
    
    user_data = {"id": 12345678}
    init_params = {
        "auth_date": str(auth_date_viejo),
        "user": json.dumps(user_data)
    }
    
    init_data_qs = _generar_init_data(init_params, BOT_TOKEN_PRUEBA)
    
    success, data = validate_telegram_init_data(BOT_TOKEN_PRUEBA, init_data_qs)
    
    assert success is False
    assert data["error"] == "expired"


def test_validate_telegram_init_data_sin_hash():
    """Valida que si falta el hash, la validación falle."""
    init_data_qs = "auth_date=1710000000&query_id=123"
    success, data = validate_telegram_init_data(BOT_TOKEN_PRUEBA, init_data_qs)
    
    assert success is False
    assert data["error"] == "missing_hash"


def test_validate_telegram_init_data_sin_auth_date():
    """Valida que si falta auth_date, la validación falle."""
    # Crear init params sin auth_date
    init_params = {
        "query_id": "123",
        "user": json.dumps({"id": 1})
    }
    
    # Firmarlo normalmente (aunque le falte auth_date, el helper calculará la firma de lo que hay)
    init_data_qs = _generar_init_data(init_params, BOT_TOKEN_PRUEBA)
    
    success, data = validate_telegram_init_data(BOT_TOKEN_PRUEBA, init_data_qs)
    
    assert success is False
    assert data["error"] == "missing_auth_date"


def test_create_y_verify_miniapp_session(monkeypatch):
    """Prueba la emisión completa y validación del JWT de sesión de la Mini App."""
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    role = "vendor"
    chat_id = 987654321
    
    vendor_id = str(uuid.uuid4())
    token = create_miniapp_session(user_id, org_id, role, chat_id, vendor_id)
    assert isinstance(token, str)
    
    # Verificar token
    auth_credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    
    # Correr dependencia de forma síncrona (es async def, pero podemos llamarla en el event loop)
    import asyncio
    monkeypatch.setattr(
        "core.miniapp_session._revalidate_workspace_authority",
        AsyncMock(return_value=None),
    )
    context = asyncio.run(verify_miniapp_session(auth_credentials))
    
    assert isinstance(context, MiniappUserContext)
    assert str(context.user_id) == user_id
    assert str(context.org_id) == org_id
    assert context.role == role
    assert context.chat_id == chat_id
    assert str(context.vendor_id) == vendor_id


def test_verify_miniapp_session_expirada():
    """Prueba que un token de sesión expirado lance 401 Unauthorized."""
    settings = get_settings()
    # Crear payload expirado
    now = int(time.time())
    payload = {
        "sub": str(uuid.uuid4()),
        "org": str(uuid.uuid4()),
        "role": "admin",
        "chat_id": 1234,
        "iat": now - 7200,
        "exp": now - 3600  # Expiró hace 1 hora
    }
    token_expirado = jwt.encode(payload, settings.MINIAPP_SESSION_SECRET, algorithm="HS256")
    auth_credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token_expirado)
    
    import asyncio
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(verify_miniapp_session(auth_credentials))
        
    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.detail == "Session expired"


def test_verify_miniapp_session_firma_invalida():
    """Prueba que un token firmado con una clave incorrecta lance 401."""
    payload = {
        "sub": str(uuid.uuid4()),
        "org": str(uuid.uuid4()),
        "role": "admin",
        "chat_id": 1234,
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600
    }
    # Firmar con clave incorrecta
    token_invalido = jwt.encode(payload, "clave-incorrecta", algorithm="HS256")
    auth_credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token_invalido)
    
    import asyncio
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(verify_miniapp_session(auth_credentials))
        
    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.detail == "Invalid session token"


def test_require_miniapp_admin_roles():
    """Prueba el comportamiento de la dependencia require_miniapp_admin."""
    import asyncio
    
    # 1. Admin context -> debe pasar sin excepciones
    admin_context = MiniappUserContext(
        user_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        role="admin",
        chat_id=1234
    )
    res = asyncio.run(require_miniapp_admin(admin_context))
    assert res == admin_context
    
    # 2. Vendor context -> debe lanzar 403 Forbidden
    vendor_context = MiniappUserContext(
        user_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        role="vendor",
        chat_id=1234
    )
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(require_miniapp_admin(vendor_context))
        
    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    assert exc_info.value.detail == "Admin role required"


# --- INTEGRATION TESTS ---
from unittest.mock import patch, MagicMock

@patch("api.v1.endpoints.miniapp.get_telegram_client_for_org", create=True)
@patch("api.v1.endpoints.miniapp.resolve_miniapp_user", create=True)
def test_endpoint_session_exito(mock_resolve, mock_get_client):
    """Prueba que el endpoint /session responda 200 con el token de sesión si todo es válido."""
    from fastapi.testclient import TestClient
    from main import app
    from integrations.telegram_client import TelegramClient
    
    # Configurar mocks
    mock_client = MagicMock(spec=TelegramClient)
    mock_client.bot_token = BOT_TOKEN_PRUEBA
    mock_get_client.return_value = mock_client
    
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    mock_resolve.return_value = (None, {
        "user_id": user_id,
        "nombre": "Juan Pérez",
        "org_id": org_id,
        "org_nombre": "Inmobiliaria Norte",
        "role": "admin"
    })
    
    init_params = {
        "auth_date": str(int(time.time())),
        "query_id": "12345",
        "user": json.dumps({"id": 12345, "first_name": "Juan"})
    }
    init_data_qs = _generar_init_data(init_params, BOT_TOKEN_PRUEBA)
    
    client = TestClient(app)
    response = client.post(
        "/api/v1/miniapp/session",
        json={"org_id": org_id, "init_data": init_data_qs}
    )
    
    assert response.status_code == 200
    res_data = response.json()
    assert "token" in res_data
    assert res_data["role"] == "admin"
    assert res_data["user"]["id"] == user_id
    assert res_data["user"]["nombre"] == "Juan Pérez"
    assert res_data["user"]["org_id"] == org_id


@patch("api.v1.endpoints.miniapp.get_telegram_client_for_org", create=True)
@patch("api.v1.endpoints.miniapp.resolve_miniapp_user", create=True)
def test_endpoint_session_no_vinculado(mock_resolve, mock_get_client):
    """Prueba que el endpoint responda 403 con 'not_linked' si el chat no tiene perfil."""
    from fastapi.testclient import TestClient
    from main import app
    from integrations.telegram_client import TelegramClient
    
    mock_client = MagicMock(spec=TelegramClient)
    mock_client.bot_token = BOT_TOKEN_PRUEBA
    mock_get_client.return_value = mock_client
    
    mock_resolve.return_value = ("not_linked", None)
    
    org_id = str(uuid.uuid4())
    init_params = {
        "auth_date": str(int(time.time())),
        "user": json.dumps({"id": 99999})
    }
    init_data_qs = _generar_init_data(init_params, BOT_TOKEN_PRUEBA)
    
    client = TestClient(app)
    response = client.post(
        "/api/v1/miniapp/session",
        json={"org_id": org_id, "init_data": init_data_qs}
    )
    
    assert response.status_code == 403
    assert response.json()["detail"] == "not_linked"


@patch("api.v1.endpoints.miniapp.get_telegram_client_for_org", create=True)
@patch("api.v1.endpoints.miniapp.resolve_miniapp_user", create=True)
def test_endpoint_session_no_miembro(mock_resolve, mock_get_client):
    """Prueba que el endpoint responda 403 con 'not_member' si el perfil no pertenece a la org."""
    from fastapi.testclient import TestClient
    from main import app
    from integrations.telegram_client import TelegramClient
    
    mock_client = MagicMock(spec=TelegramClient)
    mock_client.bot_token = BOT_TOKEN_PRUEBA
    mock_get_client.return_value = mock_client
    
    mock_resolve.return_value = ("not_member", None)
    
    org_id = str(uuid.uuid4())
    init_params = {
        "auth_date": str(int(time.time())),
        "user": json.dumps({"id": 88888})
    }
    init_data_qs = _generar_init_data(init_params, BOT_TOKEN_PRUEBA)
    
    client = TestClient(app)
    response = client.post(
        "/api/v1/miniapp/session",
        json={"org_id": org_id, "init_data": init_data_qs}
    )
    
    assert response.status_code == 403
    assert response.json()["detail"] == "not_member"


@patch("api.v1.endpoints.miniapp.get_telegram_client_for_org", create=True)
def test_endpoint_session_org_sin_bot(mock_get_client):
    """Prueba que responda 404 si la organización no tiene bot configurado."""
    from fastapi.testclient import TestClient
    from main import app
    
    mock_get_client.return_value = None  # Sin bot
    
    org_id = str(uuid.uuid4())
    client = TestClient(app)
    response = client.post(
        "/api/v1/miniapp/session",
        json={"org_id": org_id, "init_data": "auth_date=123&hash=abc"}
    )
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_telegram_client_set_menu_button():
    """Prueba que el cliente de Telegram set_menu_button realice la llamada HTTP adecuada."""
    from integrations.telegram_client import TelegramClient
    
    bot_token = "123456:ABC-DEF1234ghIkl-zyx"
    client = TelegramClient(bot_token=bot_token)
    
    # Mockear httpx.AsyncClient.post
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value={"ok": True, "result": True})
    
    with patch("httpx.AsyncClient.post", return_value=mock_response) as mock_post:
        res = await client.set_menu_button(
            chat_id="12345678",
            menu_button={
                "type": "web_app",
                "text": "Plotify",
                "web_app": {"url": "https://plotify.cl/mini"}
            }
        )
        
        assert res == {"ok": True, "result": True}
        mock_post.assert_called_once()
        # Verificar que se llamó con el path correcto
        args, kwargs = mock_post.call_args
        assert "setChatMenuButton" in args[0]
        assert kwargs["json"]["chat_id"] == 12345678
        assert kwargs["json"]["menu_button"]["type"] == "web_app"


# --- resolve_miniapp_user: rol operativo (admin | vendor vía tabla vendors) ---
# El enum real de organization_members.role es SOLO "admin" | "user" (no
# existe "vendor"). Un "user" es vendedor si tiene fila activa en `vendors`;
# si no, se rechaza con "not_vendor". Ver memoria de proyecto
# sdd18-miniapp-schema-role-bugs.md para el modelo verificado contra la
# base real (Supabase project swkrnjdpnlrgxgotmfxy).


def _mock_chain(data):
    """MagicMock que soporta cualquier cadena .select().eq().eq().limit().execute()
    y siempre devuelve `data` en el .execute() final, sin importar cuántos
    .eq()/.limit() se encadenen (distinto por tabla en el código real)."""
    from unittest.mock import MagicMock as _MM
    from types import SimpleNamespace

    node = _MM()
    node.select.return_value = node
    node.eq.return_value = node
    node.limit.return_value = node
    node.execute.return_value = SimpleNamespace(data=data)
    return node


def _mock_supabase(profiles=None, members=None, vendors=None):
    from unittest.mock import MagicMock as _MM

    tables = {
        "profiles": _mock_chain(profiles or []),
        "organization_members": _mock_chain(members or []),
        "vendors": _mock_chain(vendors or []),
    }
    supabase = _MM()
    supabase.table.side_effect = lambda name: tables[name]
    return supabase


@pytest.mark.asyncio
async def test_resolve_miniapp_user_admin():
    """organization_members.role='admin' -> role resuelto 'admin', sin vendor_id."""
    from core.miniapp_session import resolve_miniapp_user

    org_id = str(uuid.uuid4())
    profile_id = str(uuid.uuid4())
    supabase = _mock_supabase(
        profiles=[{"id": profile_id, "first_name": "Ana", "last_name": "Admin"}],
        members=[{"role": "admin", "organization_id": org_id, "organizations": {"name": "Org Test"}}],
    )

    with patch("core.database.get_supabase_client", return_value=supabase):
        error, detail = await resolve_miniapp_user(org_id, "111")

    assert error is None
    assert detail["role"] == "admin"
    assert detail["vendor_id"] is None
    assert detail["user_id"] == profile_id


@pytest.mark.asyncio
async def test_resolve_miniapp_user_vendedor_con_fila_activa():
    """organization_members.role='user' + fila activa en vendors -> role='vendor', vendor_id=vendors.id."""
    from core.miniapp_session import resolve_miniapp_user

    org_id = str(uuid.uuid4())
    profile_id = str(uuid.uuid4())
    vendor_id = str(uuid.uuid4())
    supabase = _mock_supabase(
        profiles=[{"id": profile_id, "first_name": "Beto", "last_name": "Vendedor"}],
        members=[{"role": "user", "organization_id": org_id, "organizations": {"name": "Org Test"}}],
        vendors=[{"id": vendor_id}],
    )

    with patch("core.database.get_supabase_client", return_value=supabase):
        error, detail = await resolve_miniapp_user(org_id, "222")

    assert error is None
    assert detail["role"] == "vendor"
    assert detail["vendor_id"] == vendor_id


@pytest.mark.asyncio
async def test_resolve_miniapp_user_user_sin_fila_vendors_es_rechazado():
    """organization_members.role='user' SIN fila en vendors -> 'not_vendor' (sin sesión emitida)."""
    from core.miniapp_session import resolve_miniapp_user

    org_id = str(uuid.uuid4())
    profile_id = str(uuid.uuid4())
    supabase = _mock_supabase(
        profiles=[{"id": profile_id, "first_name": "Cami", "last_name": "SinVentas"}],
        members=[{"role": "user", "organization_id": org_id, "organizations": {"name": "Org Test"}}],
        vendors=[],
    )

    with patch("core.database.get_supabase_client", return_value=supabase):
        error, detail = await resolve_miniapp_user(org_id, "333")

    assert error == "not_vendor"
    assert detail is None


@pytest.mark.asyncio
async def test_resolve_miniapp_user_not_linked():
    from core.miniapp_session import resolve_miniapp_user

    supabase = _mock_supabase(profiles=[])

    with patch("core.database.get_supabase_client", return_value=supabase):
        error, detail = await resolve_miniapp_user(str(uuid.uuid4()), "444")

    assert error == "not_linked"
    assert detail is None


@pytest.mark.asyncio
async def test_resolve_miniapp_user_not_member():
    from core.miniapp_session import resolve_miniapp_user

    profile_id = str(uuid.uuid4())
    supabase = _mock_supabase(
        profiles=[{"id": profile_id, "first_name": "Dani", "last_name": "SinOrg"}],
        members=[],
    )

    with patch("core.database.get_supabase_client", return_value=supabase):
        error, detail = await resolve_miniapp_user(str(uuid.uuid4()), "555")

    assert error == "not_member"
    assert detail is None

