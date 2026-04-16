"""
API de gestión de conexiones MCP (Hub MCP).

Permite a los admins conectar, listar, revocar y testear integraciones
externas (Google Drive, Gmail, Notion, custom MCP servers).

Las credenciales se cifran en el servidor mediante la RPC `encrypt_credential`
antes de guardarse en `mcp_connections`.

Fase 5 — M-v2-5.2
"""

from datetime import datetime, timezone

import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import verify_internal_secret
from core.database import get_supabase_client
from core.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/integrations",
    tags=["integrations"],
    dependencies=[Depends(verify_internal_secret)],
)


class ConnectRequest(BaseModel):
    organization_id: str
    user_id: str
    provider: str
    display_name: str
    credentials: str  # Plaintext — se cifra en el servidor antes de persistir
    server_url: str | None = None
    scopes: list[str] | None = None


@router.post("/connect", status_code=201)
async def connect_integration(body: ConnectRequest):
    """Cifra credenciales y guarda la conexión MCP para un usuario/org."""

    def _insert():
        supabase = get_supabase_client()

        # Cifrar credenciales mediante RPC (pgp_sym_encrypt vía vault)
        encrypted_res = supabase.rpc(
            "encrypt_credential", {"p_plaintext": body.credentials}
        ).execute()

        if not encrypted_res.data:
            raise HTTPException(status_code=500, detail="Error al cifrar credenciales")

        result = (
            supabase.table("mcp_connections")
            .insert(
                {
                    "organization_id": body.organization_id,
                    "user_id": body.user_id,
                    "provider": body.provider,
                    "display_name": body.display_name,
                    "credentials_encrypted": encrypted_res.data,
                    "server_url": body.server_url,
                    "scopes": body.scopes or [],
                    "status": "active",
                }
            )
            .execute()
        )
        return result.data[0] if result.data else None

    record = await asyncio.to_thread(_insert)
    if not record:
        raise HTTPException(status_code=500, detail="No se pudo crear la conexión")

    logger.info(
        "mcp_connection_created",
        org_id=body.organization_id,
        user_id=body.user_id,
        provider=body.provider,
    )
    return record


@router.get("/")
async def list_integrations(organization_id: str, user_id: str):
    """Lista conexiones MCP de un usuario en una organización (sin exponer credenciales)."""

    def _fetch():
        supabase = get_supabase_client()
        return (
            supabase.table("mcp_connections")
            .select(
                "id, provider, display_name, status, last_health_check, "
                "last_error, scopes, server_url, created_at"
            )
            .eq("organization_id", organization_id)
            .eq("user_id", user_id)
            .execute()
        )

    result = await asyncio.to_thread(_fetch)
    return result.data


@router.delete("/{connection_id}")
async def revoke_integration(connection_id: str):
    """Revoca una conexión MCP (marca como revoked, no borra datos)."""

    def _revoke():
        supabase = get_supabase_client()
        supabase.table("mcp_connections").update({"status": "revoked"}).eq(
            "id", connection_id
        ).execute()

    await asyncio.to_thread(_revoke)
    logger.info("mcp_connection_revoked", connection_id=connection_id)
    return {"status": "revoked"}


@router.post("/{connection_id}/test")
async def test_integration(connection_id: str):
    """Health check de una conexión MCP. Actualiza last_health_check y status."""

    def _test():
        supabase = get_supabase_client()

        conn_res = (
            supabase.table("mcp_connections")
            .select("*")
            .eq("id", connection_id)
            .single()
            .execute()
        )
        if not conn_res.data:
            raise HTTPException(status_code=404, detail="Conexión no encontrada")

        conn = conn_res.data

        # Descifrar credenciales para verificar que el vault funciona
        decrypted_res = supabase.rpc(
            "decrypt_credential",
            {"p_encrypted": conn["credentials_encrypted"]},
        ).execute()

        if not decrypted_res.data:
            raise HTTPException(
                status_code=500, detail="Error al descifrar credenciales"
            )

        return conn

    try:
        conn = await asyncio.to_thread(_test)

        def _mark_ok():
            supabase = get_supabase_client()
            supabase.table("mcp_connections").update(
                {
                    "last_health_check": datetime.now(timezone.utc).isoformat(),
                    "status": "active",
                    "last_error": None,
                }
            ).eq("id", connection_id).execute()

        await asyncio.to_thread(_mark_ok)
        logger.info(
            "mcp_health_check_ok",
            connection_id=connection_id,
            provider=conn.get("provider"),
        )
        return {"status": "ok"}

    except HTTPException:
        raise
    except Exception as exc:
        error_msg = str(exc)

        def _mark_error():
            supabase = get_supabase_client()
            supabase.table("mcp_connections").update(
                {
                    "last_health_check": datetime.now(timezone.utc).isoformat(),
                    "status": "error",
                    "last_error": error_msg,
                }
            ).eq("id", connection_id).execute()

        await asyncio.to_thread(_mark_error)
        logger.error(
            "mcp_health_check_failed", connection_id=connection_id, error=error_msg
        )
        return {"status": "error", "error": error_msg}
