"""
Dependencias compartidas de FastAPI.

Centraliza la lógica de autenticación y autorización reutilizable
entre todos los routers de la API.

Ref: Plan M1.1 - §4.1
"""

import asyncio
from typing import Any

from fastapi import Security, HTTPException, Header, Depends
from fastapi.security import APIKeyHeader
from core.config import get_settings

_api_key_header = APIKeyHeader(name="X-Internal-Secret", auto_error=False)


async def verify_internal_secret(
    api_key: str | None = Security(_api_key_header),
) -> str:
    """
    Dependencia de seguridad para endpoints internos.

    Verifica que el header 'X-Internal-Secret' coincida con el
    INTERNAL_API_SECRET configurado en el entorno. Protege los
    endpoints que sólo debe invocar el frontend de Plotify,
    bloqueando cualquier otro origen con 403 Forbidden.

    Args:
        api_key: Valor del header X-Internal-Secret (inyectado por FastAPI).

    Returns:
        El api_key validado.

    Raises:
        HTTPException(403): Si el header falta o no coincide con el secret.
    """
    settings = get_settings()
    if not api_key or api_key != settings.INTERNAL_API_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")
    return api_key


async def verify_super_admin(
    api_key: str = Depends(verify_internal_secret),
    x_user_id: str | None = Header(None, alias="X-User-Id"),
) -> str:
    """
    Verifica que el usuario sea super_admin.

    El frontend Next.js debe enviar el header 'X-User-Id' con el UUID del
    usuario autenticado. Esta dependencia valida que ese usuario tenga
    `is_super_admin = true` en la tabla profiles.

    Raises:
        HTTPException(403): Si falta el header o el usuario no es super_admin.
    """
    if not x_user_id:
        raise HTTPException(status_code=403, detail="Header X-User-Id requerido")

    import asyncio
    from core.database import get_supabase_client

    supabase = get_supabase_client()
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("profiles")
            .select("is_super_admin")
            .eq("id", x_user_id)
            .single()
            .execute()
        )
    )

    if not result.data or not result.data.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Acceso restringido a super admins")

    return x_user_id


def _extract_project_organization_id(row: dict[str, Any]) -> str | None:
    project = row.get("projects")
    if isinstance(project, list):
        project = project[0] if project else None
    if not isinstance(project, dict):
        return None

    organization_id = project.get("organization_id")
    if isinstance(organization_id, str) and organization_id:
        return organization_id

    organization = project.get("organizations")
    if isinstance(organization, list):
        organization = organization[0] if organization else None
    if isinstance(organization, dict):
        organization_id = organization.get("id")
        if isinstance(organization_id, str) and organization_id:
            return organization_id

    return None


async def get_lot_organization_id(lot_id: str, supabase: Any | None = None) -> str:
    """Derive a lot's tenant from the database instead of trusting request payloads."""
    from core.database import get_supabase_client

    client = supabase or get_supabase_client()
    result = await asyncio.to_thread(
        lambda: (
            client.table("lots")
            .select("id, project_id, projects!inner(organization_id)")
            .eq("id", lot_id)
            .single()
            .execute()
        )
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")

    row = result.data[0] if isinstance(result.data, list) else result.data
    organization_id = _extract_project_organization_id(row)
    if not organization_id:
        raise HTTPException(
            status_code=500,
            detail="No se pudo determinar la organización del lote.",
        )
    return organization_id


async def require_lot_organization(
    lot_id: str,
    claimed_organization_id: str,
    supabase: Any | None = None,
) -> str:
    """
    Validate that a request's organization_id matches the lot's real tenant.

    Returns the database-derived organization_id so callers can persist the
    trusted value instead of echoing user-controlled input.
    """
    organization_id = await get_lot_organization_id(lot_id, supabase=supabase)
    if organization_id != claimed_organization_id:
        raise HTTPException(
            status_code=403,
            detail="organization_id no corresponde al lote solicitado.",
        )
    return organization_id
