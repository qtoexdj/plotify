"""
Herramienta LangGraph: búsqueda de proyectos de parcelación activos.

IMPORTANTE (M1.4): Todas las consultas están filtradas por organization_id
para garantizar aislamiento multi-tenant. Sin ese campo las queries no
retornan datos, evitando fugas de información entre organizaciones.
"""

from langchain_core.tools import tool
from core.database import get_supabase_client
from core.logger import get_logger
from agent.skill_registry import register_builtin
import asyncio

logger = get_logger(__name__)


@register_builtin("search_projects")
@tool
async def search_projects(organization_id: str) -> str:
    """Usa esta herramienta al principio para informarle al usuario sobre los proyectos o loteos principales que tenemos activos (Ej. Proyecto Juanito).
    Retorna los nombres de los proyectos disponibles y sus detalles básicos.
    Argumento requerido:
    - organization_id: ID de la organización para aislar los datos del tenant correcto.
    """
    if not organization_id:
        logger.error("search_projects llamada sin organization_id")
        return "Error interno: se requiere organization_id para buscar proyectos."

    try:

        def _fetch_projects():
            supabase = get_supabase_client()
            return (
                supabase.table("projects")
                .select("id, name, descripcion, estado")
                .eq("organization_id", organization_id)
                .eq("estado", "activo")
                .execute()
            )

        response = await asyncio.to_thread(_fetch_projects)

        projects = response.data
        if not projects:
            return "No encontré proyectos o loteos activos en este momento."

        result = "Proyectos y Loteos Activos:\n"
        for p in projects:
            desc = p.get("descripcion") or "Sin descripción definida."
            result += f"- Proyecto '{p.get('name')}': {desc}\n"

        logger.info(
            "search_projects ejecutada",
            organization_id=organization_id,
            total_results=len(projects),
        )
        return result

    except Exception as e:
        logger.error(
            "Error en search_projects",
            organization_id=organization_id,
            error=str(e),
        )
        return f"Ocurrió un error al buscar proyectos: {str(e)}"
