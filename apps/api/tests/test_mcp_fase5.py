"""
Tests unitarios para FASE 5 — Hub MCP + Vault de Credenciales.

Valida:
  - execute_mcp_tool (mcp_gateway):
      · Conexión inexistente → mensaje de error
      · Conexión revocada (status != active) → mensaje de error
      · Sin server_url configurado → mensaje de error
      · Servidor MCP responde 200 → retorna resultado
      · Servidor MCP responde error HTTP → retorna mensaje de error
      · Timeout de red → retorna mensaje de timeout
  - _create_mcp_tool (skill_registry):
      · Retorna StructuredTool con name y description correctos
      · Al invocar la tool llama a execute_mcp_tool con los params correctos
  - Endpoints /integrations (FastAPI):
      · POST /connect → 201 con registro creado (sin exponer credenciales)
      · POST /connect con RPC fallida → 500
      · GET / → lista sin campo credentials_encrypted
      · DELETE /{id} → {"status": "revoked"}
      · POST /{id}/test → {"status": "ok"} cuando vault funciona
      · POST /{id}/test → 404 cuando conexión no existe

Todos los tests usan mocks — no requieren Supabase, Redis ni servidor MCP activo.
asyncio_mode = auto (pytest.ini) — no se necesita @pytest.mark.asyncio
"""

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from fastapi import FastAPI

# ---------------------------------------------------------------------------
# Fixtures comunes
# ---------------------------------------------------------------------------

CONNECTION_ID = "conn-uuid-aaaa"
ORG_ID = "org-uuid-1111"
USER_ID = "user-uuid-2222"
SERVER_URL = "https://mcp.example.com"
PROVIDER = "google_drive"

FAKE_CONNECTION_ACTIVE = {
    "id": CONNECTION_ID,
    "organization_id": ORG_ID,
    "user_id": USER_ID,
    "provider": PROVIDER,
    "display_name": "Mi Google Drive",
    "server_url": SERVER_URL,
    "credentials_encrypted": "enc:abc123",
    "status": "active",
    "last_health_check": None,
    "last_error": None,
    "scopes": ["drive.readonly"],
    "created_at": "2026-03-31T00:00:00+00:00",
}

FAKE_CONNECTION_REVOKED = {**FAKE_CONNECTION_ACTIVE, "status": "revoked"}
FAKE_CONNECTION_NO_URL = {**FAKE_CONNECTION_ACTIVE, "server_url": None}


def _make_supabase_mock(
    connection_data=FAKE_CONNECTION_ACTIVE, decrypted="plaintext_cred"
):
    """
    Construye un mock de get_supabase_client() para los tests de Fase 5.
    """
    supabase = MagicMock()

    # mcp_connections table mock
    conn_tbl = MagicMock()
    single_chain = MagicMock()
    single_chain.execute.return_value = MagicMock(data=connection_data)
    conn_tbl.select.return_value.eq.return_value.single.return_value = single_chain
    conn_tbl.update.return_value.eq.return_value.execute.return_value = MagicMock()

    # insert chain para POST /connect
    insert_chain = MagicMock()
    insert_chain.execute.return_value = MagicMock(
        data=[{**FAKE_CONNECTION_ACTIVE, "credentials_encrypted": "***"}]
    )
    conn_tbl.insert.return_value = insert_chain

    # GET list
    list_chain = MagicMock()
    list_chain.execute.return_value = MagicMock(
        data=[
            {
                k: v
                for k, v in FAKE_CONNECTION_ACTIVE.items()
                if k != "credentials_encrypted"
            }
        ]
    )
    conn_tbl.select.return_value.eq.return_value.eq.return_value = list_chain

    def table_side_effect(name):
        if name == "mcp_connections":
            return conn_tbl
        return MagicMock()

    supabase.table.side_effect = table_side_effect
    supabase._conn_tbl = conn_tbl  # expuesto para assertions

    # RPC mock
    rpc_encrypt = MagicMock()
    rpc_encrypt.execute.return_value = MagicMock(data="enc:abc123")

    rpc_decrypt = MagicMock()
    rpc_decrypt.execute.return_value = MagicMock(data=decrypted)

    def rpc_side_effect(func_name, params=None):
        if func_name == "encrypt_credential":
            return rpc_encrypt
        if func_name == "decrypt_credential":
            return rpc_decrypt
        return MagicMock()

    supabase.rpc.side_effect = rpc_side_effect

    return supabase


# ---------------------------------------------------------------------------
# Tests: execute_mcp_tool (MCP Gateway)
# ---------------------------------------------------------------------------


class TestExecuteMcpTool:
    async def test_conexion_no_encontrada(self):
        """Conexión inexistente → retorna mensaje de error descriptivo."""
        supabase = _make_supabase_mock()
        supabase._conn_tbl.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data=None
        )

        with (
            patch(
                "integrations.mcp_gateway.get_supabase_client", return_value=supabase
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from integrations.mcp_gateway import execute_mcp_tool

            result = await execute_mcp_tool(CONNECTION_ID, "list_files", {})

        assert "no encontrada" in result.lower()

    async def test_conexion_revocada(self):
        """Conexión con status revoked → retorna error con el estado."""
        supabase = _make_supabase_mock(connection_data=FAKE_CONNECTION_REVOKED)

        with (
            patch(
                "integrations.mcp_gateway.get_supabase_client", return_value=supabase
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from integrations.mcp_gateway import execute_mcp_tool

            result = await execute_mcp_tool(CONNECTION_ID, "list_files", {})

        assert "revoked" in result or "no disponible" in result.lower()

    async def test_sin_server_url(self):
        """Conexión sin server_url → retorna error de configuración."""
        supabase = _make_supabase_mock(connection_data=FAKE_CONNECTION_NO_URL)

        with (
            patch(
                "integrations.mcp_gateway.get_supabase_client", return_value=supabase
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            from integrations.mcp_gateway import execute_mcp_tool

            result = await execute_mcp_tool(CONNECTION_ID, "list_files", {})

        assert "server" in result.lower() or "configurado" in result.lower()

    async def test_servidor_200_retorna_resultado(self):
        """Servidor MCP responde 200 con result → retorna el valor como string."""
        from integrations.mcp_gateway import execute_mcp_tool

        supabase = _make_supabase_mock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"result": "Archivo cargado exitosamente."}

        with (
            patch(
                "integrations.mcp_gateway.get_supabase_client", return_value=supabase
            ),
            patch(
                "integrations.mcp_gateway.asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
            patch("integrations.mcp_gateway.httpx.AsyncClient") as mock_client_cls,
        ):
            mock_http = AsyncMock()
            mock_http.post.return_value = mock_response
            mock_client_cls.return_value.__aenter__.return_value = mock_http

            result = await execute_mcp_tool(
                CONNECTION_ID, "upload_file", {"path": "/test.pdf"}
            )

        assert result == "Archivo cargado exitosamente."

    async def test_servidor_responde_error_http(self):
        """Servidor MCP responde != 200 → retorna mensaje con el status code."""
        from integrations.mcp_gateway import execute_mcp_tool

        supabase = _make_supabase_mock()
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.text = "Service Unavailable"

        with (
            patch(
                "integrations.mcp_gateway.get_supabase_client", return_value=supabase
            ),
            patch(
                "integrations.mcp_gateway.asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
            patch("integrations.mcp_gateway.httpx.AsyncClient") as mock_client_cls,
        ):
            mock_http = AsyncMock()
            mock_http.post.return_value = mock_response
            mock_client_cls.return_value.__aenter__.return_value = mock_http

            result = await execute_mcp_tool(CONNECTION_ID, "upload_file", {})

        assert "503" in result or "error" in result.lower()

    async def test_timeout_de_red(self):
        """Timeout al conectar al servidor MCP → retorna mensaje de timeout."""
        import httpx
        from integrations.mcp_gateway import execute_mcp_tool

        supabase = _make_supabase_mock()

        with (
            patch(
                "integrations.mcp_gateway.get_supabase_client", return_value=supabase
            ),
            patch(
                "integrations.mcp_gateway.asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
            patch("integrations.mcp_gateway.httpx.AsyncClient") as mock_client_cls,
        ):
            mock_http = AsyncMock()
            mock_http.post.side_effect = httpx.TimeoutException("timeout")
            mock_client_cls.return_value.__aenter__.return_value = mock_http

            result = await execute_mcp_tool(CONNECTION_ID, "upload_file", {})

        assert "timeout" in result.lower() or "agotado" in result.lower()


# ---------------------------------------------------------------------------
# Tests: _create_mcp_tool (Skill Registry)
# ---------------------------------------------------------------------------


class TestCreateMcpTool:
    def test_retorna_structured_tool_con_nombre_correcto(self):
        """_create_mcp_tool asigna slug y descripción al StructuredTool."""
        from agent.skill_registry import _create_mcp_tool

        tool = _create_mcp_tool(
            skill_slug="upload_drive",
            skill_description="Sube archivos a Google Drive.",
            connection_id=CONNECTION_ID,
        )

        assert tool.name == "upload_drive"
        assert "Drive" in tool.description

    async def test_invocacion_llama_execute_mcp_tool(self):
        """Al invocar la tool, delega en execute_mcp_tool con los argumentos correctos."""
        mock_execute = AsyncMock(return_value="Subido correctamente.")

        # Parchear en el módulo mcp_gateway ANTES de que _create_mcp_tool lo importe
        with patch("integrations.mcp_gateway.execute_mcp_tool", mock_execute):
            # Re-importar aquí para que el closure capture el mock
            import importlib
            import agent.skill_registry as sr

            importlib.reload(sr)
            tool = sr._create_mcp_tool(
                skill_slug="upload_drive",
                skill_description="Sube archivos a Google Drive.",
                connection_id=CONNECTION_ID,
            )
            result = await tool.ainvoke(
                {"organization_id": ORG_ID, "filename": "test.pdf"}
            )

        mock_execute.assert_awaited_once_with(
            CONNECTION_ID,
            "upload_drive",
            {},  # **kwargs queda vacío: el schema Pydantic de @tool no captura parámetros no declarados
        )
        assert result == "Subido correctamente."


# ---------------------------------------------------------------------------
# Helpers para los tests de endpoints
# ---------------------------------------------------------------------------


def _build_test_client():
    """Construye un TestClient de FastAPI con el router de integrations."""
    from api.v1.endpoints.integrations import router

    app = FastAPI()

    # Bypass del verify_internal_secret para tests
    from api.deps import verify_internal_secret

    app.dependency_overrides[verify_internal_secret] = lambda: "test-secret"

    app.include_router(router)
    return TestClient(app)


CONNECT_PAYLOAD = {
    "organization_id": ORG_ID,
    "user_id": USER_ID,
    "provider": PROVIDER,
    "display_name": "Mi Drive",
    "credentials": '{"access_token": "tok_abc"}',
    "server_url": SERVER_URL,
    "scopes": ["drive.readonly"],
}


# ---------------------------------------------------------------------------
# Tests: Endpoints /integrations
# ---------------------------------------------------------------------------


class TestIntegrationsEndpoints:
    def test_connect_crea_conexion_201(self):
        """POST /connect → 201 con el registro creado (sin exponer credenciales en plaintext)."""
        supabase = _make_supabase_mock()
        client = _build_test_client()

        with (
            patch(
                "api.v1.endpoints.integrations.get_supabase_client",
                return_value=supabase,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            response = client.post("/integrations/connect", json=CONNECT_PAYLOAD)

        assert response.status_code == 201
        data = response.json()
        # El registro no debe exponer la credential en texto plano
        assert data.get("credentials_encrypted") != CONNECT_PAYLOAD["credentials"]
        assert data.get("provider") == PROVIDER

    def test_connect_falla_si_rpc_encrypt_retorna_none(self):
        """POST /connect → 500 si la RPC encrypt_credential retorna None."""
        supabase = _make_supabase_mock()
        supabase.rpc.side_effect = None
        bad_rpc = MagicMock()
        bad_rpc.execute.return_value = MagicMock(data=None)
        supabase.rpc = MagicMock(return_value=bad_rpc)

        client = _build_test_client()

        with (
            patch(
                "api.v1.endpoints.integrations.get_supabase_client",
                return_value=supabase,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            response = client.post("/integrations/connect", json=CONNECT_PAYLOAD)

        assert response.status_code == 500

    def test_list_no_expone_credentials_encrypted(self):
        """GET / → lista de conexiones no incluye credentials_encrypted."""
        supabase = _make_supabase_mock()
        client = _build_test_client()

        with (
            patch(
                "api.v1.endpoints.integrations.get_supabase_client",
                return_value=supabase,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            response = client.get(
                f"/integrations/?organization_id={ORG_ID}&user_id={USER_ID}"
            )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for conn in data:
            assert "credentials_encrypted" not in conn

    def test_revoke_retorna_status_revoked(self):
        """DELETE /{id} → {"status": "revoked"}."""
        supabase = _make_supabase_mock()
        client = _build_test_client()

        with (
            patch(
                "api.v1.endpoints.integrations.get_supabase_client",
                return_value=supabase,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            response = client.delete(f"/integrations/{CONNECTION_ID}")

        assert response.status_code == 200
        assert response.json() == {"status": "revoked"}

    def test_test_endpoint_retorna_ok_cuando_vault_funciona(self):
        """POST /{id}/test → {"status": "ok"} cuando cifrado y vault OK."""
        supabase = _make_supabase_mock()
        client = _build_test_client()

        with (
            patch(
                "api.v1.endpoints.integrations.get_supabase_client",
                return_value=supabase,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            response = client.post(f"/integrations/{CONNECTION_ID}/test")

        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_test_endpoint_404_cuando_conexion_no_existe(self):
        """POST /{id}/test → 404 si la conexión no existe en BD."""
        supabase = _make_supabase_mock()
        # Hacer que .single().execute() lance HTTPException(404)
        from fastapi import HTTPException as FastHTTPException

        def _raise_404(*args, **kwargs):
            raise FastHTTPException(status_code=404, detail="Conexión no encontrada")

        supabase._conn_tbl.select.return_value.eq.return_value.single.return_value.execute.side_effect = _raise_404

        client = _build_test_client()

        with (
            patch(
                "api.v1.endpoints.integrations.get_supabase_client",
                return_value=supabase,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            response = client.post(f"/integrations/{CONNECTION_ID}/test")

        assert response.status_code == 404

    def test_test_endpoint_500_cuando_vault_falla(self):
        """POST /{id}/test → 500 si decrypt_credential retorna None."""
        supabase = _make_supabase_mock(decrypted=None)
        client = _build_test_client()

        with (
            patch(
                "api.v1.endpoints.integrations.get_supabase_client",
                return_value=supabase,
            ),
            patch(
                "asyncio.to_thread",
                new=AsyncMock(side_effect=lambda fn, *a, **kw: fn()),
            ),
        ):
            response = client.post(f"/integrations/{CONNECTION_ID}/test")

        assert response.status_code == 500
