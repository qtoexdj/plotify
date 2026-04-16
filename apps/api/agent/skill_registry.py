"""
Skill Registry — Resolución dinámica de tools por org + rol.

Flujo:
  1. Al iniciarse la app, los módulos de tools son importados y sus decoradores
     @register_builtin populan BUILTIN_HANDLERS con los slugs correspondientes.
  2. Por cada mensaje entrante, get_tools_for_org() consulta la BD (o Redis)
     para saber qué skills están activas para esa org + rol.
  3. El grafo LangGraph se compila con esas tools exactas.

M-v2-3.1
"""

import asyncio
import json
from typing import Callable

from langchain_core.tools import StructuredTool

from core.database import get_supabase_client
from core.logger import get_logger
from core.redis import get_arq_pool

logger = get_logger(__name__)

SKILLS_CACHE_KEY = "skills:{org_id}:{role}"
SKILLS_CACHE_TTL = 300  # 5 minutos

# Mapa slug → StructuredTool registrado al importar cada módulo de tools
BUILTIN_HANDLERS: dict[str, StructuredTool] = {}


def register_builtin(slug: str) -> Callable:
    """
    Decorador para registrar un tool builtin en el registry.
    Debe aplicarse sobre el objeto ya envuelto por @tool (orden: @register_builtin / @tool).

    Ejemplo:
        @register_builtin("my_skill")
        @tool
        async def my_skill(...): ...
    """

    def decorator(tool_obj: StructuredTool) -> StructuredTool:
        BUILTIN_HANDLERS[slug] = tool_obj
        logger.debug("Skill registrada en BUILTIN_HANDLERS", slug=slug)
        return tool_obj

    return decorator


async def get_tools_for_org(org_id: str, role: str) -> list[StructuredTool]:
    """
    Retorna las StructuredTool activas para esta org + rol.

    Orden de resolución:
      1. Skills con is_system=True (siempre activas si el rol coincide).
      2. Skills habilitadas explícitamente en org_skill_configs para esta org.
    Resultado se cachea en Redis con TTL 5 min.
    """
    redis = await get_arq_pool()
    cache_key = SKILLS_CACHE_KEY.format(org_id=org_id, role=role)

    cached = await redis.get(cache_key)
    if cached:
        skill_slugs: list[str] = json.loads(cached)
        tools = [BUILTIN_HANDLERS[s] for s in skill_slugs if s in BUILTIN_HANDLERS]
        logger.debug(
            "Skills obtenidas desde cache Redis",
            org_id=org_id,
            role=role,
            count=len(tools),
        )
        return tools

    # Sin cache → query BD
    def _fetch():
        supabase = get_supabase_client()
        system_res = (
            supabase.table("agent_skills")
            .select("slug, requires_role")
            .eq("is_system", True)
            .execute()
        )
        org_res = (
            supabase.table("org_skill_configs")
            .select("agent_skills(slug, requires_role)")
            .eq("organization_id", org_id)
            .eq("enabled", True)
            .execute()
        )
        return system_res, org_res

    system_res, org_res = await asyncio.to_thread(_fetch)

    all_slugs: list[str] = []

    for skill in system_res.data:
        requires = skill.get("requires_role", [])
        if role in requires:
            all_slugs.append(skill["slug"])

    for config in org_res.data:
        skill = config.get("agent_skills")
        if not skill:
            continue
        requires = skill.get("requires_role", [])
        slug = skill.get("slug")
        if slug and role in requires and slug not in all_slugs:
            all_slugs.append(slug)

    await redis.setex(cache_key, SKILLS_CACHE_TTL, json.dumps(all_slugs))

    tools = [BUILTIN_HANDLERS[s] for s in all_slugs if s in BUILTIN_HANDLERS]
    logger.info(
        "Skills cargadas desde BD y cacheadas en Redis",
        org_id=org_id,
        role=role,
        slugs=all_slugs,
        resolved_count=len(tools),
    )
    return tools


async def invalidate_skills_cache(org_id: str) -> None:
    """
    Invalida el cache de skills para una org en todos los roles conocidos.
    Llamar al habilitar/deshabilitar una skill desde org_skill_configs.
    """
    redis = await get_arq_pool()
    for role in ["admin", "user", "lead", "vendor"]:
        key = SKILLS_CACHE_KEY.format(org_id=org_id, role=role)
        await redis.delete(key)
    logger.info("Cache de skills invalidado", org_id=org_id)


def _create_mcp_tool(
    skill_slug: str,
    skill_description: str,
    connection_id: str,
) -> StructuredTool:
    """
    Crea un StructuredTool dinámico que proxea al MCP Gateway.

    El tool resultante acepta `organization_id` y kwargs adicionales,
    y los reenvía al servidor MCP asociado a `connection_id`.

    Fase 5 — M-v2-5.4
    """
    from langchain_core.tools import tool

    from integrations.mcp_gateway import execute_mcp_tool

    @tool
    async def mcp_proxy_tool(organization_id: str, **kwargs) -> str:
        """Ejecuta una skill MCP externa mediante el gateway de integraciones."""
        return await execute_mcp_tool(connection_id, skill_slug, kwargs)

    # Sobreescribir nombre y docstring para que el LLM identifique la tool
    mcp_proxy_tool.name = skill_slug
    mcp_proxy_tool.description = skill_description
    return mcp_proxy_tool
