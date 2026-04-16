"""
MCP Gateway — Proxy hacia servidores MCP externos.

Descifra credenciales desde `mcp_connections`, conecta al servidor MCP
configurado y ejecuta la tool solicitada, devolviendo el resultado como string.

Fase 5 — M-v2-5.3
"""

import asyncio

import httpx

from core.database import get_supabase_client
from core.logger import get_logger

logger = get_logger(__name__)

# Timeout en segundos para llamadas a servidores MCP externos
MCP_REQUEST_TIMEOUT = 30.0


async def execute_mcp_tool(connection_id: str, tool_name: str, params: dict) -> str:
    """
    Proxy que descifra credenciales, conecta al MCP server y ejecuta la tool.

    1. Obtiene la conexión desde `mcp_connections`.
    2. Descifra credenciales vía RPC `decrypt_credential`.
    3. Hace POST al servidor MCP (<server_url>/tools/<tool_name>).
    4. Retorna el resultado como string para el agente LangGraph.

    Args:
        connection_id: UUID de la conexión en `mcp_connections`.
        tool_name:     Slug de la tool a ejecutar en el servidor MCP.
        params:        Parámetros a pasar a la tool (dict).

    Returns:
        Resultado de la tool como string, o mensaje de error descriptivo.
    """

    def _fetch_and_decrypt():
        supabase = get_supabase_client()

        conn_res = (
            supabase.table("mcp_connections")
            .select("*")
            .eq("id", connection_id)
            .single()
            .execute()
        )
        if not conn_res.data:
            return None, None

        conn = conn_res.data
        if conn.get("status") != "active":
            return conn, None

        decrypted_res = supabase.rpc(
            "decrypt_credential",
            {"p_encrypted": conn["credentials_encrypted"]},
        ).execute()

        return conn, decrypted_res.data if decrypted_res.data else None

    conn, credentials = await asyncio.to_thread(_fetch_and_decrypt)

    if conn is None:
        logger.warning("mcp_connection_not_found", connection_id=connection_id)
        return "Error: Conexión MCP no encontrada."

    if credentials is None:
        status = conn.get("status", "unknown")
        logger.warning(
            "mcp_connection_unavailable",
            connection_id=connection_id,
            status=status,
        )
        return f"Error: Conexión MCP no disponible (estado: {status})."

    server_url = conn.get("server_url")
    if not server_url:
        logger.error(
            "mcp_no_server_url",
            connection_id=connection_id,
            provider=conn.get("provider"),
        )
        return "Error: servidor MCP no configurado para esta conexión."

    try:
        async with httpx.AsyncClient(timeout=MCP_REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{server_url}/tools/{tool_name}",
                json={"credentials": credentials, "params": params},
            )

        if response.status_code != 200:
            logger.error(
                "mcp_tool_error",
                tool=tool_name,
                status=response.status_code,
                connection_id=connection_id,
            )
            return f"Error ejecutando {tool_name}: HTTP {response.status_code}."

        data = response.json()
        result = data.get("result", "Ejecutado sin resultado.")
        logger.info(
            "mcp_tool_executed",
            tool=tool_name,
            connection_id=connection_id,
        )
        return str(result)

    except httpx.TimeoutException:
        logger.error("mcp_tool_timeout", tool=tool_name, connection_id=connection_id)
        return f"Error: tiempo de espera agotado ejecutando {tool_name}."
    except Exception as exc:
        logger.error(
            "mcp_tool_exception",
            tool=tool_name,
            connection_id=connection_id,
            error=str(exc),
        )
        return f"Error inesperado ejecutando {tool_name}: {exc}"
