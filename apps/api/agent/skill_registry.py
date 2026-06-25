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
from dataclasses import asdict, dataclass
from typing import Any, Callable

from langchain_core.tools import StructuredTool

from core.database import get_supabase_client
from core.logger import get_logger
from core.redis import get_arq_pool

logger = get_logger(__name__)

SKILLS_CACHE_KEY = "skills:{org_id}:{role}"
SKILLS_CACHE_TTL = 300  # 5 minutos

SKILL_SELECT_FIELDS = (
    "id, slug, name, description, category, tool_definition, requires_mcp, "
    "mcp_provider, requires_role, is_system, enabled_by_default, organization_id, "
    "definition_markdown, approved_tool_slugs, current_version, validation_status, "
    "validation_errors, updated_at"
)

# Mapa slug → StructuredTool registrado al importar cada módulo de tools
BUILTIN_HANDLERS: dict[str, StructuredTool] = {}


@dataclass(frozen=True)
class ResolvedSkill:
    id: str
    slug: str
    name: str
    description: str
    category: str
    requires_role: tuple[str, ...]
    is_system: bool
    enabled_by_default: bool
    organization_id: str | None = None
    definition_markdown: str | None = None
    approved_tool_slugs: tuple[str, ...] = ()
    current_version: int = 1
    validation_status: str = "valid"
    validation_errors: tuple[dict[str, Any], ...] = ()
    requires_mcp: bool = False
    mcp_provider: str | None = None
    mcp_ready: bool = True
    executable: bool = True
    blocked_reason: str | None = None

    def to_cache_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["requires_role"] = list(self.requires_role)
        payload["approved_tool_slugs"] = list(self.approved_tool_slugs)
        payload["validation_errors"] = list(self.validation_errors)
        return payload

    @classmethod
    def from_cache_dict(cls, payload: dict[str, Any]) -> "ResolvedSkill":
        return cls(
            **{
                **payload,
                "requires_role": tuple(payload.get("requires_role") or ()),
                "approved_tool_slugs": tuple(payload.get("approved_tool_slugs") or ()),
                "validation_errors": tuple(payload.get("validation_errors") or ()),
            }
        )


@dataclass(frozen=True)
class SkillRuntimePayload:
    skills: tuple[ResolvedSkill, ...]

    @property
    def enabled_skill_slugs(self) -> list[str]:
        return [skill.slug for skill in self.skills if skill.executable]

    @property
    def allowed_tool_slugs(self) -> list[str]:
        slugs: list[str] = []
        for skill in self.skills:
            if not skill.executable:
                continue
            if skill.slug in BUILTIN_HANDLERS and skill.slug not in slugs:
                slugs.append(skill.slug)
            for approved_slug in skill.approved_tool_slugs:
                if approved_slug in BUILTIN_HANDLERS and approved_slug not in slugs:
                    slugs.append(approved_slug)
        return slugs

    @property
    def tools(self) -> list[StructuredTool]:
        return [BUILTIN_HANDLERS[slug] for slug in self.allowed_tool_slugs]

    @property
    def markdown_instructions(self) -> str:
        sections: list[str] = []
        for skill in self.skills:
            markdown = (skill.definition_markdown or "").strip()
            if not skill.executable or not markdown:
                continue
            title = f"### {skill.name} ({skill.slug})"
            sections.append(f"{title}\n{markdown}")
        return "\n\n".join(sections)

    def to_cache_json(self) -> str:
        return json.dumps([skill.to_cache_dict() for skill in self.skills])

    @classmethod
    def from_cache_json(cls, payload: str | bytes) -> "SkillRuntimePayload":
        raw_skills = json.loads(payload)
        return cls(tuple(ResolvedSkill.from_cache_dict(item) for item in raw_skills))


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
    runtime = await get_skill_runtime_for_org(org_id, role)
    return runtime.tools


def _role_matches(requires_role: list[str] | tuple[str, ...] | None, role: str) -> bool:
    if not requires_role:
        return True
    return role in requires_role or "all" in requires_role


def _skill_enabled(row: dict[str, Any], enabled_config_ids: set[str]) -> bool:
    if row.get("is_system") is True:
        return True
    skill_id = str(row.get("id") or "")
    if skill_id in enabled_config_ids:
        return True
    return bool(row.get("enabled_by_default"))


def _row_scope_matches(row: dict[str, Any], org_id: str) -> bool:
    organization_id = row.get("organization_id")
    return organization_id is None or organization_id == org_id


def _resolve_skill_rows(
    *,
    skill_rows: list[dict[str, Any]],
    config_rows: list[dict[str, Any]],
    org_id: str,
    role: str,
    active_mcp_providers: set[str] | None = None,
) -> SkillRuntimePayload:
    active_mcp_providers = active_mcp_providers or set()
    enabled_config_ids = {
        str(row.get("skill_id"))
        for row in config_rows
        if row.get("enabled") is True and row.get("skill_id")
    }
    resolved: list[ResolvedSkill] = []

    for row in skill_rows:
        if not _row_scope_matches(row, org_id):
            continue
        if not _role_matches(row.get("requires_role"), role):
            continue
        if not _skill_enabled(row, enabled_config_ids):
            continue

        validation_status = row.get("validation_status") or "valid"
        category = row.get("category") or "builtin"
        requires_mcp = bool(row.get("requires_mcp"))
        mcp_provider = row.get("mcp_provider")
        mcp_ready = (not requires_mcp) or (
            bool(mcp_provider) and str(mcp_provider) in active_mcp_providers
        )
        blocked_reason = None
        executable = True

        if validation_status != "valid":
            executable = False
            blocked_reason = "validation_blocked"
        elif requires_mcp and not mcp_ready:
            executable = False
            blocked_reason = "mcp_connection_required"
        elif category == "custom" and not (row.get("definition_markdown") or "").strip():
            executable = False
            blocked_reason = "empty_markdown"

        resolved.append(
            ResolvedSkill(
                id=str(row.get("id")),
                slug=str(row.get("slug")),
                name=str(row.get("name") or row.get("slug")),
                description=str(row.get("description") or ""),
                category=category,
                requires_role=tuple(row.get("requires_role") or ()),
                is_system=bool(row.get("is_system")),
                enabled_by_default=bool(row.get("enabled_by_default")),
                organization_id=row.get("organization_id"),
                definition_markdown=row.get("definition_markdown"),
                approved_tool_slugs=tuple(row.get("approved_tool_slugs") or ()),
                current_version=int(row.get("current_version") or 1),
                validation_status=validation_status,
                validation_errors=tuple(row.get("validation_errors") or ()),
                requires_mcp=requires_mcp,
                mcp_provider=mcp_provider,
                mcp_ready=mcp_ready,
                executable=executable,
                blocked_reason=blocked_reason,
            )
        )

    return SkillRuntimePayload(tuple(resolved))


async def get_skill_runtime_for_org(org_id: str, role: str) -> SkillRuntimePayload:
    redis = await get_arq_pool()
    cache_key = SKILLS_CACHE_KEY.format(org_id=org_id, role=role)

    cached = await redis.get(cache_key)
    if cached:
        try:
            runtime = SkillRuntimePayload.from_cache_json(cached)
            logger.debug(
                "Skills obtenidas desde cache Redis",
                org_id=org_id,
                role=role,
                count=len(runtime.tools),
            )
            return runtime
        except Exception:
            logger.warning("skills_cache_payload_invalid", org_id=org_id, role=role)

    def _fetch():
        supabase = get_supabase_client()
        global_res = (
            supabase.table("agent_skills")
            .select(SKILL_SELECT_FIELDS)
            .is_("organization_id", "null")
            .execute()
        )
        custom_res = (
            supabase.table("agent_skills")
            .select(SKILL_SELECT_FIELDS)
            .eq("organization_id", org_id)
            .execute()
        )
        org_res = (
            supabase.table("org_skill_configs")
            .select("skill_id, enabled")
            .eq("organization_id", org_id)
            .eq("enabled", True)
            .execute()
        )
        mcp_res = (
            supabase.table("mcp_connections")
            .select("provider")
            .eq("organization_id", org_id)
            .eq("status", "active")
            .execute()
        )
        return global_res, custom_res, org_res, mcp_res

    global_res, custom_res, org_res, mcp_res = await asyncio.to_thread(_fetch)

    skill_rows = list(global_res.data or []) + list(custom_res.data or [])
    active_mcp_providers = {
        row.get("provider")
        for row in (mcp_res.data or [])
        if row.get("provider")
    }
    runtime = _resolve_skill_rows(
        skill_rows=skill_rows,
        config_rows=list(org_res.data or []),
        org_id=org_id,
        role=role,
        active_mcp_providers={str(provider) for provider in active_mcp_providers},
    )

    await redis.setex(cache_key, SKILLS_CACHE_TTL, runtime.to_cache_json())

    logger.info(
        "Skills cargadas desde BD y cacheadas en Redis",
        org_id=org_id,
        role=role,
        slugs=runtime.enabled_skill_slugs,
        resolved_count=len(runtime.tools),
    )
    return runtime


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
