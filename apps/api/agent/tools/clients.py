"""
Herramienta LangGraph: búsqueda de leads/clientes.

IMPORTANTE (M1.4): Todas las consultas están filtradas por organization_id
para garantizar aislamiento multi-tenant.

M-v2-3.4
"""

import asyncio
from typing import Optional

from langchain_core.tools import tool

from agent.skill_registry import register_builtin
from core.database import get_supabase_client
from core.logger import get_logger

logger = get_logger(__name__)


@register_builtin("search_clients")
@tool
async def search_clients(
    organization_id: str,
    name: Optional[str] = None,
    phone: Optional[str] = None,
) -> str:
    """Busca leads/clientes por nombre o teléfono en la organización.
    Argumentos:
    - organization_id (requerido): ID de la organización para aislamiento multi-tenant.
    - name (opcional): nombre parcial del cliente a buscar.
    - phone (opcional): teléfono parcial del cliente a buscar.
    """
    if not organization_id:
        return "Error: organization_id es requerido"

    try:

        def _fetch():
            supabase = get_supabase_client()
            query = (
                supabase.table("leads")
                .select("id, name, phone, platform")
                .eq("organization_id", organization_id)
            )
            if name:
                query = query.ilike("name", f"%{name}%")
            if phone:
                query = query.ilike("phone", f"%{phone}%")
            return query.limit(10).execute()

        response = await asyncio.to_thread(_fetch)

        if not response.data:
            return "No se encontraron clientes con esos criterios."

        results = "\n".join(
            [
                f"- {r['name']} ({r.get('phone', 'sin tel')}) [{r.get('platform', '')}]"
                for r in response.data
            ]
        )
        logger.info(
            "search_clients ejecutada",
            organization_id=organization_id,
            total_results=len(response.data),
        )
        return f"Clientes encontrados:\n{results}"

    except Exception as e:
        logger.error(
            "Error en search_clients",
            organization_id=organization_id,
            error=str(e),
        )
        return f"Ocurrió un error al buscar clientes: {str(e)}"
