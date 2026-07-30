"""Central LLM configuration, capability validation and provider construction.

Secrets are encrypted through the existing Vault-backed ``encrypt_credential``
RPC and are only decrypted inside the API/worker service. Browser-facing
snapshots always pass through ``public_snapshot``.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from functools import lru_cache
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_deepseek import ChatDeepSeek
from langchain_openai import ChatOpenAI

from core.config import get_settings
from core.database import get_supabase_client
from core.logger import get_logger

logger = get_logger(__name__)

LLM_TIMEOUT_SECONDS = 10
MAX_API_KEY_LENGTH = 8192


class Provider(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    DEEPSEEK = "deepseek"
    GEMINI = "gemini"


class LLMTask(StrEnum):
    CONVERSATION = "conversation"
    TITLE_ANALYSIS = "title_analysis"
    PDF_VISION = "pdf_vision"
    PROMPT_SANDBOX = "prompt_sandbox"


class LLMCapabilityError(ValueError):
    pass


class LLMConfigurationError(RuntimeError):
    pass


class LLMConfigurationConflict(LLMConfigurationError):
    pass


@dataclass(frozen=True, slots=True)
class ModelDefinition:
    provider: Provider
    id: str
    label: str
    capabilities: frozenset[str]
    reasoning_options: tuple[str, ...] = ("off",)

    def public_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider.value,
            "id": self.id,
            "label": self.label,
            "capabilities": sorted(self.capabilities),
            "reasoning_options": list(self.reasoning_options),
        }


@dataclass(frozen=True, slots=True)
class TaskDefinition:
    key: LLMTask
    label: str
    required_capabilities: frozenset[str]

    def public_dict(self) -> dict[str, Any]:
        return {
            "key": self.key.value,
            "label": self.label,
            "required_capabilities": sorted(self.required_capabilities),
        }


@dataclass(frozen=True, slots=True)
class ResolvedTaskConfiguration:
    task: LLMTask
    provider: Provider
    model: str
    reasoning_effort: str
    api_key: str
    enabled: bool
    version: int


MODELS: tuple[ModelDefinition, ...] = (
    ModelDefinition(
        provider=Provider.OPENAI,
        id="gpt-5.6-sol",
        label="GPT-5.6 Sol",
        capabilities=frozenset(
            {"tool_calling", "structured_output", "reasoning", "pdf_input"}
        ),
        reasoning_options=("off", "low", "medium", "high", "xhigh"),
    ),
    ModelDefinition(
        provider=Provider.OPENAI,
        id="gpt-5.6-terra",
        label="GPT-5.6 Terra",
        capabilities=frozenset(
            {"tool_calling", "structured_output", "reasoning", "pdf_input"}
        ),
        reasoning_options=("off", "low", "medium", "high", "xhigh"),
    ),
    ModelDefinition(
        provider=Provider.OPENAI,
        id="gpt-5.6-luna",
        label="GPT-5.6 Luna",
        capabilities=frozenset(
            {"tool_calling", "structured_output", "reasoning", "pdf_input"}
        ),
        reasoning_options=("off", "low", "medium", "high", "xhigh"),
    ),
    ModelDefinition(
        provider=Provider.OPENAI,
        id="gpt-5.4",
        label="GPT-5.4",
        capabilities=frozenset(
            {"tool_calling", "structured_output", "reasoning", "pdf_input"}
        ),
        reasoning_options=("off", "low", "medium", "high"),
    ),
    ModelDefinition(
        provider=Provider.OPENAI,
        id="gpt-4o",
        label="GPT-4o",
        capabilities=frozenset({"tool_calling", "structured_output", "pdf_input"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-sonnet-5",
        label="Claude Sonnet 5",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-fable-5",
        label="Claude Fable 5",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-mythos-5",
        label="Claude Mythos 5",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-opus-4-8",
        label="Claude Opus 4.8",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-opus-4-7",
        label="Claude Opus 4.7",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-mythos-preview",
        label="Claude Mythos Preview",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-opus-4-6",
        label="Claude Opus 4.6",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-sonnet-4-6",
        label="Claude Sonnet 4.6",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-haiku-4-5",
        label="Claude Haiku 4.5",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-opus-4-5",
        label="Claude Opus 4.5",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-sonnet-4-5",
        label="Claude Sonnet 4.5",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.ANTHROPIC,
        id="claude-opus-4-1",
        label="Claude Opus 4.1",
        capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    ModelDefinition(
        provider=Provider.DEEPSEEK,
        id="deepseek-v4-pro",
        label="DeepSeek V4 Pro",
        capabilities=frozenset(
            {"tool_calling", "structured_output", "reasoning"}
        ),
        reasoning_options=("off", "high", "max"),
    ),
    ModelDefinition(
        provider=Provider.DEEPSEEK,
        id="deepseek-v4-flash",
        label="DeepSeek V4 Flash",
        capabilities=frozenset(
            {"tool_calling", "structured_output", "reasoning"}
        ),
        reasoning_options=("off", "high", "max"),
    ),
    ModelDefinition(
        provider=Provider.GEMINI,
        id="gemini-3.6-flash",
        label="Gemini 3.6 Flash",
        capabilities=frozenset(
            {"tool_calling", "structured_output", "reasoning", "pdf_input"}
        ),
        reasoning_options=("off", "minimal", "low", "medium", "high"),
    ),
)

TASKS: tuple[TaskDefinition, ...] = (
    TaskDefinition(
        key=LLMTask.CONVERSATION,
        label="Chat Telegram / WhatsApp",
        required_capabilities=frozenset({"tool_calling"}),
    ),
    TaskDefinition(
        key=LLMTask.TITLE_ANALYSIS,
        label="Análisis jurídico de títulos",
        required_capabilities=frozenset({"tool_calling", "structured_output"}),
    ),
    TaskDefinition(
        key=LLMTask.PDF_VISION,
        label="Lectura visual de PDF",
        required_capabilities=frozenset({"pdf_input"}),
    ),
    TaskDefinition(
        key=LLMTask.PROMPT_SANDBOX,
        label="Prompt Ops Sandbox",
        required_capabilities=frozenset({"tool_calling"}),
    ),
)

MODEL_BY_KEY = {(model.provider, model.id): model for model in MODELS}
MODEL_CATALOG_RANK = {
    (model.provider.value, model.id): index for index, model in enumerate(MODELS)
}
TASK_BY_KEY = {task.key: task for task in TASKS}


def model_catalog(
    provider_models: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if provider_models:
        models = [
            {
                "provider": row["provider"],
                "id": row["model_id"],
                "label": row["display_name"],
                "capabilities": list(row.get("capabilities") or []),
                "reasoning_options": list(
                    row.get("reasoning_options") or ["off"]
                ),
                "verification_status": row.get(
                    "verification_status", "discovered"
                ),
                "source": row.get("source", "provider"),
                "released_at": row.get("released_at"),
                "last_seen_at": row.get("last_seen_at"),
            }
            for row in provider_models
        ]
        models.sort(
            key=lambda model: MODEL_CATALOG_RANK.get(
                (model["provider"], model["id"]),
                len(MODELS),
            )
        )
    else:
        models = [model.public_dict() for model in MODELS]
    return {
        "providers": [provider.value for provider in Provider],
        "tasks": [task.public_dict() for task in TASKS],
        "models": models,
    }


def mask_api_key(api_key: str) -> str:
    suffix = api_key[-4:] if api_key else ""
    return f"••••••{suffix}"


def validate_task_selection(
    task: LLMTask,
    provider: Provider,
    model: str,
    reasoning_effort: str,
) -> ModelDefinition:
    definition = MODEL_BY_KEY.get((provider, model))
    if definition is None:
        from services.llm_model_catalog import classify_provider_model

        discovered = classify_provider_model(provider, {"id": model})
        if discovered.status == "verified":
            definition = ModelDefinition(
                provider=provider,
                id=discovered.id,
                label=discovered.label,
                capabilities=discovered.capabilities,
                reasoning_options=discovered.reasoning_options,
            )
    if definition is None:
        raise LLMCapabilityError("model_not_allowed")
    task_definition = TASK_BY_KEY[task]
    missing = task_definition.required_capabilities - definition.capabilities
    if missing:
        raise LLMCapabilityError(
            "missing_capabilities:" + ",".join(sorted(missing))
        )
    if reasoning_effort not in definition.reasoning_options:
        raise LLMCapabilityError("reasoning_effort_not_supported")
    return definition


def build_model_client(
    *,
    provider: Provider,
    model: str,
    api_key: str,
    reasoning_effort: str = "off",
    timeout_seconds: int = LLM_TIMEOUT_SECONDS,
) -> Any:
    if not api_key or len(api_key) > MAX_API_KEY_LENGTH:
        raise LLMConfigurationError("invalid_api_key")

    common = {
        "model": model,
        "api_key": api_key,
        "timeout": timeout_seconds,
        "max_retries": 1,
    }
    if provider is Provider.OPENAI:
        kwargs = dict(common)
        if model.startswith("gpt-5"):
            kwargs["use_responses_api"] = True
            if reasoning_effort != "off":
                kwargs["reasoning_effort"] = reasoning_effort
        else:
            kwargs["temperature"] = 0.0
        return ChatOpenAI(**kwargs)
    if provider is Provider.ANTHROPIC:
        return ChatAnthropic(**common, temperature=0.0)
    if provider is Provider.DEEPSEEK:
        kwargs = dict(common)
        kwargs["temperature"] = 0.0
        if reasoning_effort != "off":
            kwargs["reasoning_effort"] = reasoning_effort
            kwargs["extra_body"] = {"thinking": {"type": "enabled"}}
        return ChatDeepSeek(**kwargs)
    if provider is Provider.GEMINI:
        kwargs = dict(common)
        kwargs["base_url"] = (
            "https://generativelanguage.googleapis.com/v1beta/openai/"
        )
        kwargs["temperature"] = 0.0
        if reasoning_effort != "off":
            kwargs["reasoning_effort"] = reasoning_effort
        return ChatOpenAI(**kwargs)
    raise LLMConfigurationError("unsupported_provider")


def _first_row(data: Any) -> dict[str, Any] | None:
    if isinstance(data, list):
        return data[0] if data else None
    if isinstance(data, dict):
        return data
    return None


def _without_secrets(row: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in row.items()
        if key not in {"api_key_encrypted", "api_key", "credentials"}
    }


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


class LLMControlPlane:
    def __init__(self, client: Any | None = None):
        self._client = client

    @property
    def client(self) -> Any:
        return self._client or get_supabase_client()

    async def snapshot(self) -> dict[str, Any]:
        def _fetch() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
            providers = (
                self.client.table("llm_provider_credentials")
                .select(
                    "provider,status,key_hint,version,last_tested_at,last_error_code,"
                    "updated_at"
                )
                .order("provider")
                .execute()
            )
            tasks = (
                self.client.table("llm_task_configs")
                .select(
                    "task,provider,model,reasoning_effort,enabled,version,updated_at"
                )
                .order("task")
                .execute()
            )
            return providers.data or [], tasks.data or []

        try:
            providers, tasks = await asyncio.to_thread(_fetch)
        except Exception:
            logger.warning("llm_control_plane_snapshot_unavailable")
            providers, tasks = self._environment_bootstrap_snapshot()
        provider_models: list[dict[str, Any]] = []
        model_syncs: list[dict[str, Any]] = []
        try:
            from services.llm_model_catalog import LLMModelCatalogService

            catalog_snapshot = await LLMModelCatalogService(self.client).snapshot()
            provider_models = catalog_snapshot["models"]
            model_syncs = catalog_snapshot["syncs"]
        except Exception:
            logger.warning("llm_model_catalog_snapshot_unavailable")
        configured = {row["provider"]: _without_secrets(row) for row in providers}
        provider_rows = [
            configured.get(
                provider.value,
                {
                    "provider": provider.value,
                    "status": "unconfigured",
                    "key_hint": None,
                    "version": 0,
                    "last_tested_at": None,
                    "last_error_code": None,
                },
            )
            for provider in Provider
        ]
        return {
            "catalog": model_catalog(provider_models),
            "providers": provider_rows,
            "tasks": [_without_secrets(row) for row in tasks],
            "model_syncs": [_without_secrets(row) for row in model_syncs],
        }

    def _environment_bootstrap_snapshot(
        self,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        settings = get_settings()
        providers: list[dict[str, Any]] = []
        for provider, api_key in (
            (Provider.OPENAI, settings.OPENAI_API_KEY),
            (Provider.ANTHROPIC, settings.ANTHROPIC_API_KEY),
            (Provider.DEEPSEEK, settings.DEEPSEEK_API_KEY),
            (Provider.GEMINI, settings.GEMINI_API_KEY),
        ):
            if api_key:
                providers.append(
                    {
                        "provider": provider.value,
                        "status": "environment",
                        "key_hint": mask_api_key(api_key),
                        "version": 0,
                        "last_tested_at": None,
                        "last_error_code": None,
                    }
                )
        tasks = [
            {
                "task": LLMTask.CONVERSATION.value,
                "provider": (
                    Provider.OPENAI.value
                    if settings.OPENAI_API_KEY
                    else (
                        Provider.ANTHROPIC.value
                        if settings.ANTHROPIC_API_KEY
                        else (
                            Provider.DEEPSEEK.value
                            if settings.DEEPSEEK_API_KEY
                            else Provider.GEMINI.value
                        )
                    )
                ),
                "model": (
                    "gpt-4o"
                    if settings.OPENAI_API_KEY
                    else (
                        "claude-haiku-4-5"
                        if settings.ANTHROPIC_API_KEY
                        else (
                            "deepseek-v4-flash"
                            if settings.DEEPSEEK_API_KEY
                            else "gemini-3.6-flash"
                        )
                    )
                ),
                "reasoning_effort": "off",
                "enabled": True,
                "version": 0,
            },
            {
                "task": LLMTask.PROMPT_SANDBOX.value,
                "provider": (
                    Provider.OPENAI.value
                    if settings.OPENAI_API_KEY
                    else (
                        Provider.ANTHROPIC.value
                        if settings.ANTHROPIC_API_KEY
                        else (
                            Provider.DEEPSEEK.value
                            if settings.DEEPSEEK_API_KEY
                            else Provider.GEMINI.value
                        )
                    )
                ),
                "model": (
                    "gpt-4o"
                    if settings.OPENAI_API_KEY
                    else (
                        "claude-haiku-4-5"
                        if settings.ANTHROPIC_API_KEY
                        else (
                            "deepseek-v4-flash"
                            if settings.DEEPSEEK_API_KEY
                            else "gemini-3.6-flash"
                        )
                    )
                ),
                "reasoning_effort": "off",
                "enabled": True,
                "version": 0,
            },
            {
                "task": LLMTask.TITLE_ANALYSIS.value,
                "provider": settings.LEGAL_TITLE_AGENT_PROVIDER,
                "model": settings.LEGAL_TITLE_AGENT_MODEL,
                "reasoning_effort": (
                    settings.LEGAL_TITLE_AGENT_REASONING_EFFORT or "off"
                ),
                "enabled": settings.LEGAL_TITLE_AGENT_ENABLED,
                "version": 0,
            },
            {
                "task": LLMTask.PDF_VISION.value,
                "provider": settings.LEGAL_TEXT_VISION_PROVIDER,
                "model": settings.LEGAL_TEXT_VISION_MODEL,
                "reasoning_effort": (
                    settings.LEGAL_TEXT_VISION_REASONING_EFFORT or "off"
                ),
                "enabled": settings.LEGAL_TEXT_VISION_ENABLED,
                "version": 0,
            },
        ]
        return providers, tasks

    async def save_credential(
        self,
        *,
        provider: Provider,
        api_key: str,
        actor_id: str,
    ) -> dict[str, Any]:
        api_key = api_key.strip()
        if not api_key or len(api_key) > MAX_API_KEY_LENGTH:
            raise LLMConfigurationError("invalid_api_key")

        def _save() -> dict[str, Any]:
            encrypted = self.client.rpc(
                "encrypt_credential", {"p_plaintext": api_key}
            ).execute()
            ciphertext = encrypted.data
            if not isinstance(ciphertext, str) or not ciphertext:
                raise LLMConfigurationError("credential_encryption_failed")

            current = (
                self.client.table("llm_provider_credentials")
                .select("version")
                .eq("provider", provider.value)
                .limit(1)
                .execute()
            )
            current_row = _first_row(current.data)
            version = int(current_row.get("version") or 0) + 1 if current_row else 1
            result = (
                self.client.table("llm_provider_credentials")
                .upsert(
                    {
                        "provider": provider.value,
                        "api_key_encrypted": ciphertext,
                        "key_hint": mask_api_key(api_key),
                        "status": "active",
                        "version": version,
                        "last_error_code": None,
                        "updated_by": actor_id,
                        "updated_at": _utc_now_iso(),
                    },
                    on_conflict="provider",
                )
                .execute()
            )
            row = _first_row(result.data)
            if row is None:
                raise LLMConfigurationError("credential_save_failed")
            self.client.table("llm_configuration_events").insert(
                {
                    "actor_id": actor_id,
                    "action": "credential_saved",
                    "provider": provider.value,
                    "config_version": version,
                    "outcome": "success",
                }
            ).execute()
            return _without_secrets(row)

        return await asyncio.to_thread(_save)

    async def configure_task(
        self,
        *,
        task: LLMTask,
        provider: Provider,
        model: str,
        reasoning_effort: str,
        enabled: bool,
        expected_version: int,
        actor_id: str,
    ) -> dict[str, Any]:
        validate_task_selection(task, provider, model, reasoning_effort)

        def _save() -> dict[str, Any]:
            current = (
                self.client.table("llm_task_configs")
                .select("version")
                .eq("task", task.value)
                .limit(1)
                .execute()
            )
            current_row = _first_row(current.data)
            current_version = int(current_row.get("version") or 0) if current_row else 0
            if current_version != expected_version:
                raise LLMConfigurationConflict("stale_version")
            payload = {
                "task": task.value,
                "provider": provider.value,
                "model": model,
                "reasoning_effort": reasoning_effort,
                "enabled": enabled,
                "version": current_version + 1,
                "updated_by": actor_id,
                "updated_at": _utc_now_iso(),
            }
            if current_row:
                result = (
                    self.client.table("llm_task_configs")
                    .update(payload)
                    .eq("task", task.value)
                    .eq("version", current_version)
                    .execute()
                )
            else:
                result = self.client.table("llm_task_configs").insert(payload).execute()
            row = _first_row(result.data)
            if row is None:
                raise LLMConfigurationConflict("stale_version")
            self.client.table("llm_configuration_events").insert(
                {
                    "actor_id": actor_id,
                    "action": "task_configured",
                    "provider": provider.value,
                    "task": task.value,
                    "config_version": current_version + 1,
                    "outcome": "success",
                }
            ).execute()
            return _without_secrets(row)

        return await asyncio.to_thread(_save)

    async def resolve(self, task: LLMTask) -> ResolvedTaskConfiguration:
        def _fetch() -> tuple[dict[str, Any] | None, str | None]:
            task_result = (
                self.client.table("llm_task_configs")
                .select("task,provider,model,reasoning_effort,enabled,version")
                .eq("task", task.value)
                .limit(1)
                .execute()
            )
            task_row = _first_row(task_result.data)
            if not task_row:
                return None, None
            credential_result = (
                self.client.table("llm_provider_credentials")
                .select("api_key_encrypted,status")
                .eq("provider", task_row["provider"])
                .eq("status", "active")
                .limit(1)
                .execute()
            )
            credential = _first_row(credential_result.data)
            if not credential:
                return task_row, None
            decrypted = self.client.rpc(
                "decrypt_credential",
                {"p_encrypted": credential["api_key_encrypted"]},
            ).execute()
            return task_row, decrypted.data if isinstance(decrypted.data, str) else None

        try:
            task_row, api_key = await asyncio.to_thread(_fetch)
        except Exception:
            logger.warning("llm_control_plane_resolve_fallback", task=task.value)
            task_row, api_key = None, None
        if task_row and not api_key:
            raise LLMConfigurationError("selected_provider_credential_missing")
        if task_row and api_key:
            provider = Provider(task_row["provider"])
            model = str(task_row["model"])
            reasoning = str(task_row.get("reasoning_effort") or "off")
            validate_task_selection(task, provider, model, reasoning)
            return ResolvedTaskConfiguration(
                task=task,
                provider=provider,
                model=model,
                reasoning_effort=reasoning,
                api_key=api_key,
                enabled=bool(task_row.get("enabled", True)),
                version=int(task_row.get("version") or 0),
            )
        return self._resolve_environment(task)

    def _resolve_environment(self, task: LLMTask) -> ResolvedTaskConfiguration:
        settings = get_settings()
        if task in {LLMTask.CONVERSATION, LLMTask.PROMPT_SANDBOX}:
            if settings.OPENAI_API_KEY:
                provider, model, key = (
                    Provider.OPENAI,
                    "gpt-4o",
                    settings.OPENAI_API_KEY,
                )
            elif settings.ANTHROPIC_API_KEY:
                provider, model, key = (
                    Provider.ANTHROPIC,
                    "claude-haiku-4-5",
                    settings.ANTHROPIC_API_KEY,
                )
            elif settings.DEEPSEEK_API_KEY:
                provider, model, key = (
                    Provider.DEEPSEEK,
                    "deepseek-v4-flash",
                    settings.DEEPSEEK_API_KEY,
                )
            elif settings.GEMINI_API_KEY:
                provider, model, key = (
                    Provider.GEMINI,
                    "gemini-3.6-flash",
                    settings.GEMINI_API_KEY,
                )
            else:
                raise LLMConfigurationError("llm_credential_missing")
            return ResolvedTaskConfiguration(
                task=task,
                provider=provider,
                model=model,
                reasoning_effort="off",
                api_key=key,
                enabled=True,
                version=0,
            )
        if task is LLMTask.TITLE_ANALYSIS:
            provider = Provider(settings.LEGAL_TITLE_AGENT_PROVIDER)
            key = {
                Provider.OPENAI: settings.OPENAI_API_KEY,
                Provider.ANTHROPIC: settings.ANTHROPIC_API_KEY,
                Provider.DEEPSEEK: settings.DEEPSEEK_API_KEY,
                Provider.GEMINI: settings.GEMINI_API_KEY,
            }[provider]
            return ResolvedTaskConfiguration(
                task=task,
                provider=provider,
                model=settings.LEGAL_TITLE_AGENT_MODEL,
                reasoning_effort=(
                    settings.LEGAL_TITLE_AGENT_REASONING_EFFORT or "off"
                ),
                api_key=key,
                enabled=settings.LEGAL_TITLE_AGENT_ENABLED,
                version=0,
            )
        provider = Provider(settings.LEGAL_TEXT_VISION_PROVIDER)
        key = {
            Provider.OPENAI: settings.OPENAI_API_KEY,
            Provider.ANTHROPIC: settings.ANTHROPIC_API_KEY,
            Provider.DEEPSEEK: settings.DEEPSEEK_API_KEY,
            Provider.GEMINI: settings.GEMINI_API_KEY,
        }[provider]
        return ResolvedTaskConfiguration(
            task=task,
            provider=provider,
            model=settings.LEGAL_TEXT_VISION_MODEL,
            reasoning_effort=settings.LEGAL_TEXT_VISION_REASONING_EFFORT or "off",
            api_key=key,
            enabled=settings.LEGAL_TEXT_VISION_ENABLED,
            version=0,
        )

    async def resolve_chat_client(self, task: LLMTask) -> tuple[Any, ResolvedTaskConfiguration]:
        config = await self.resolve(task)
        if not config.enabled:
            raise LLMConfigurationError("llm_task_disabled")
        validate_task_selection(
            task,
            config.provider,
            config.model,
            config.reasoning_effort,
        )
        return (
            build_model_client(
                provider=config.provider,
                model=config.model,
                api_key=config.api_key,
                reasoning_effort=config.reasoning_effort,
            ),
            config,
        )


@lru_cache
def get_llm_control_plane() -> LLMControlPlane:
    return LLMControlPlane()


__all__ = [
    "LLMCapabilityError",
    "LLMConfigurationConflict",
    "LLMConfigurationError",
    "LLMControlPlane",
    "LLMTask",
    "Provider",
    "ResolvedTaskConfiguration",
    "build_model_client",
    "get_llm_control_plane",
    "mask_api_key",
    "model_catalog",
    "validate_task_selection",
]
