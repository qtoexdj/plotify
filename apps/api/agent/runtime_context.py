from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from langchain_core.tools import StructuredTool

from core.logger import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class AgentRuntimeContext:
    organization_id: str
    role: str
    profile_id: str | None = None
    vendor_id: str | None = None
    thread_id: str | None = None
    enabled_skill_slugs: tuple[str, ...] = field(default_factory=tuple)
    allowed_tool_slugs: tuple[str, ...] = field(default_factory=tuple)

    def is_tool_allowed(self, tool_slug: str) -> bool:
        if not self.allowed_tool_slugs:
            return True
        return tool_slug in self.allowed_tool_slugs

    def trusted_tool_args(self, tool_slug: str, args: dict[str, Any]) -> dict[str, Any]:
        if not self.is_tool_allowed(tool_slug):
            raise PermissionError(f"Tool '{tool_slug}' is not enabled for this runtime context.")

        trusted_args = dict(args)
        trusted_args["organization_id"] = self.organization_id
        return trusted_args

    def to_prompt_summary(self) -> str:
        parts = [
            f"organization_id={self.organization_id}",
            f"role={self.role}",
        ]
        if self.profile_id:
            parts.append("profile=vinculado")
        if self.vendor_id:
            parts.append("vendor=vinculado")
        if self.enabled_skill_slugs:
            parts.append(f"skills={', '.join(self.enabled_skill_slugs)}")
        return "; ".join(parts)


def build_runtime_context(
    *,
    organization_id: str,
    role: str,
    state: dict[str, Any] | None = None,
    enabled_skill_slugs: list[str] | tuple[str, ...] | None = None,
    allowed_tool_slugs: list[str] | tuple[str, ...] | None = None,
) -> AgentRuntimeContext:
    state = state or {}
    thread_id = state.get("thread_id")
    if not thread_id:
        state_phone = state.get("lead_info", {}).get("phone") if isinstance(state.get("lead_info"), dict) else None
        thread_id = f"{organization_id}:{state_phone}" if state_phone else organization_id

    return AgentRuntimeContext(
        organization_id=organization_id,
        role=role,
        profile_id=state.get("profile_id") or state.get("user_id"),
        vendor_id=state.get("vendor_id"),
        thread_id=thread_id,
        enabled_skill_slugs=tuple(enabled_skill_slugs or ()),
        allowed_tool_slugs=tuple(allowed_tool_slugs or ()),
    )


async def _invoke_tool(tool: StructuredTool, args: dict[str, Any]) -> Any:
    return await tool.ainvoke(args)


def bind_tool_to_runtime_context(
    tool: StructuredTool,
    runtime_context: AgentRuntimeContext,
) -> StructuredTool:
    async def _trusted_coroutine(**kwargs: Any) -> Any:
        try:
            trusted_args = runtime_context.trusted_tool_args(tool.name, kwargs)
        except PermissionError as exc:
            logger.warning(
                "agent_tool_blocked_by_runtime_context",
                tool=tool.name,
                organization_id=runtime_context.organization_id,
                role=runtime_context.role,
            )
            return f"Operacion bloqueada: {exc}"

        return await _invoke_tool(tool, trusted_args)

    tool_kwargs: dict[str, Any] = {
        "name": tool.name,
        "description": tool.description or f"Ejecuta {tool.name}.",
        "coroutine": _trusted_coroutine,
    }
    args_schema = getattr(tool, "args_schema", None)
    if args_schema is not None:
        tool_kwargs["args_schema"] = args_schema
        tool_kwargs["infer_schema"] = False

    wrapped = StructuredTool.from_function(**tool_kwargs)
    wrapped.metadata = {
        **(getattr(tool, "metadata", None) or {}),
        "trusted_runtime_context": True,
        "organization_id": runtime_context.organization_id,
        "role": runtime_context.role,
    }
    return wrapped


def bind_tools_to_runtime_context(
    tools: list[StructuredTool],
    runtime_context: AgentRuntimeContext,
) -> list[StructuredTool]:
    return [bind_tool_to_runtime_context(tool, runtime_context) for tool in tools]
