from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from langchain_core.tools import StructuredTool

from core.logger import get_logger
from utils.audit import log_agent_action

logger = get_logger(__name__)

SENSITIVE_AGENT_TOOL_SLUGS = frozenset(
    {
        "check_lot_availability",
        "get_lot_stage",
        "get_reservation_requirements",
        "request_reservation_intent",
    }
)

@dataclass(frozen=True)
class AgentRuntimeContext:
    organization_id: str
    role: str
    profile_id: str | None = None
    vendor_id: str | None = None
    vendor_name: str | None = None
    vendor_phone: str | None = None
    thread_id: str | None = None
    channel: str | None = None
    enabled_skill_slugs: tuple[str, ...] = field(default_factory=tuple)
    allowed_tool_slugs: tuple[str, ...] = field(default_factory=tuple)

    def is_tool_allowed(self, tool_slug: str) -> bool:
        if not self.allowed_tool_slugs:
            return True
        return tool_slug in self.allowed_tool_slugs

    def trusted_tool_args(
        self,
        tool_slug: str,
        args: dict[str, Any],
        accepted_arg_names: set[str] | None = None,
    ) -> dict[str, Any]:
        if not self.is_tool_allowed(tool_slug):
            raise PermissionError(
                f"Tool '{tool_slug}' is not enabled for this runtime context."
            )

        trusted_args = dict(args)
        if accepted_arg_names is not None:
            trusted_args = {
                key: value
                for key, value in trusted_args.items()
                if key in accepted_arg_names
            }

        runtime_args = {
            "organization_id": self.organization_id,
            "role": self.role,
            "profile_id": self.profile_id,
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor_name,
            "vendor_phone": self.vendor_phone,
            "vendor_platform": self.channel
            if self.channel in {"telegram", "whatsapp"}
            else None,
            "thread_id": self.thread_id,
        }
        for key, value in runtime_args.items():
            if value is None:
                continue
            if accepted_arg_names is None or key in accepted_arg_names or key in args:
                trusted_args[key] = value
        return trusted_args

    def to_prompt_summary(self) -> str:
        parts = [
            f"role={self.role}",
        ]
        if self.channel:
            parts.append(f"channel={self.channel}")
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
        state_phone = (
            state.get("lead_info", {}).get("phone")
            if isinstance(state.get("lead_info"), dict)
            else None
        )
        thread_id = f"{organization_id}:{state_phone}" if state_phone else organization_id

    return AgentRuntimeContext(
        organization_id=organization_id,
        role=role,
        profile_id=state.get("profile_id") or state.get("user_id"),
        vendor_id=state.get("vendor_id"),
        vendor_name=state.get("vendor_name"),
        vendor_phone=state.get("vendor_phone"),
        thread_id=thread_id,
        channel=state.get("channel") or state.get("platform"),
        enabled_skill_slugs=tuple(enabled_skill_slugs or ()),
        allowed_tool_slugs=tuple(allowed_tool_slugs or ()),
    )


async def _invoke_tool(tool: StructuredTool, args: dict[str, Any]) -> Any:
    return await tool.ainvoke(args)


def is_sensitive_agent_tool(tool_slug: str) -> bool:
    return tool_slug in SENSITIVE_AGENT_TOOL_SLUGS


def _tool_arg_names(tool: StructuredTool) -> set[str] | None:
    args_schema = getattr(tool, "args_schema", None)
    if args_schema is not None:
        model_fields = getattr(args_schema, "model_fields", None)
        if isinstance(model_fields, dict):
            return set(model_fields.keys())
        legacy_fields = getattr(args_schema, "__fields__", None)
        if isinstance(legacy_fields, dict):
            return set(legacy_fields.keys())

    tool_args = getattr(tool, "args", None)
    if isinstance(tool_args, dict):
        return set(tool_args.keys())

    return None


def _business_rule_failed(result: Any) -> bool:
    if not isinstance(result, str):
        return False
    normalized = result.strip().lower()
    return normalized.startswith(
        (
            "blocked:",
            "bloqueada:",
            "operacion bloqueada",
            "operación bloqueada",
            "error interno",
            "no pude crear",
            "no fue posible",
            "ocurrio un error",
            "ocurrió un error",
        )
    )


async def _audit_sensitive_tool_execution(
    runtime_context: AgentRuntimeContext,
    tool_slug: str,
    decision: str,
    *,
    reason: str | None = None,
) -> None:
    if not is_sensitive_agent_tool(tool_slug):
        return

    payload: dict[str, Any] = {
        "tool_slug": tool_slug,
        "decision": decision,
        "role": runtime_context.role,
        "channel": runtime_context.channel or "agent",
    }
    if runtime_context.thread_id:
        payload["thread_id"] = runtime_context.thread_id
    if runtime_context.profile_id:
        payload["profile_id"] = runtime_context.profile_id
    if runtime_context.vendor_id:
        payload["vendor_id"] = runtime_context.vendor_id
    if runtime_context.vendor_name:
        payload["vendor_name"] = runtime_context.vendor_name
    if reason:
        payload["reason"] = reason

    actor = runtime_context.profile_id or runtime_context.vendor_id or "ai_agent"
    try:
        await log_agent_action(
            actor=actor,
            action=f"agent.tool.{decision}",
            entity="agent_tools",
            entity_id=tool_slug,
            organization_id=runtime_context.organization_id,
            payload=payload,
        )
    except Exception as exc:
        logger.warning(
            "agent_sensitive_tool_audit_failed",
            tool=tool_slug,
            decision=decision,
            organization_id=runtime_context.organization_id,
            error=str(exc),
        )


def bind_tool_to_runtime_context(
    tool: StructuredTool,
    runtime_context: AgentRuntimeContext,
) -> StructuredTool:
    async def _trusted_coroutine(**kwargs: Any) -> Any:
        sensitive_tool = is_sensitive_agent_tool(tool.name)
        try:
            trusted_args = runtime_context.trusted_tool_args(
                tool.name,
                kwargs,
                accepted_arg_names=_tool_arg_names(tool),
            )
        except PermissionError as exc:
            logger.warning(
                "agent_tool_blocked_by_runtime_context",
                tool=tool.name,
                organization_id=runtime_context.organization_id,
                role=runtime_context.role,
            )
            await _audit_sensitive_tool_execution(
                runtime_context,
                tool.name,
                "denied",
                reason="tool_not_allowed",
            )
            return f"Operacion bloqueada: {exc}"

        await _audit_sensitive_tool_execution(
            runtime_context,
            tool.name,
            "allowed",
        )

        try:
            result = await _invoke_tool(tool, trusted_args)
        except Exception as exc:
            await _audit_sensitive_tool_execution(
                runtime_context,
                tool.name,
                "failed",
                reason="tool_exception",
            )
            if sensitive_tool:
                logger.warning(
                    "agent_sensitive_tool_failed",
                    tool=tool.name,
                    organization_id=runtime_context.organization_id,
                    role=runtime_context.role,
                    error=str(exc),
                )
                return (
                    "Operacion bloqueada: la herramienta sensible no pudo "
                    "completar sus reglas deterministicas."
                )
            raise

        if _business_rule_failed(result):
            await _audit_sensitive_tool_execution(
                runtime_context,
                tool.name,
                "failed",
                reason="business_rule_blocked",
            )

        return result

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
        "sensitive_tool": is_sensitive_agent_tool(tool.name),
    }
    return wrapped


def bind_tools_to_runtime_context(
    tools: list[StructuredTool],
    runtime_context: AgentRuntimeContext,
) -> list[StructuredTool]:
    return [bind_tool_to_runtime_context(tool, runtime_context) for tool in tools]
