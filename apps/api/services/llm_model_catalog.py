"""Provider model discovery and safe capability classification.

Provider model-list endpoints are treated as availability sources. Models only
become selectable when Plotify can classify their task capabilities; catalog
sync never mutates ``llm_task_configs``.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

from core.database import get_supabase_client
from core.logger import get_logger
from services.llm_control_plane import (
    LLMConfigurationError,
    MODEL_BY_KEY,
    Provider,
)

logger = get_logger(__name__)

PROVIDER_MODEL_ENDPOINTS = {
    Provider.OPENAI: "https://api.openai.com/v1/models",
    Provider.ANTHROPIC: "https://api.anthropic.com/v1/models",
    Provider.DEEPSEEK: "https://api.deepseek.com/models",
    Provider.GEMINI: "https://generativelanguage.googleapis.com/v1beta/openai/models",
}
DISCOVERY_TIMEOUT_SECONDS = 15
MAX_ANTHROPIC_PAGES = 5


@dataclass(frozen=True, slots=True)
class CatalogModel:
    provider: Provider
    id: str
    label: str
    capabilities: frozenset[str]
    reasoning_options: tuple[str, ...]
    status: str
    source: str
    owned_by: str | None = None
    released_at: str | None = None
    raw_metadata: dict[str, Any] | None = None

    def database_row(self, *, seen_at: str) -> dict[str, Any]:
        return {
            "provider": self.provider.value,
            "model_id": self.id,
            "display_name": self.label,
            "capabilities": sorted(self.capabilities),
            "reasoning_options": list(self.reasoning_options),
            "verification_status": self.status,
            "source": self.source,
            "owned_by": self.owned_by,
            "released_at": self.released_at,
            "is_available": True,
            "last_seen_at": seen_at,
            "last_verified_at": seen_at if self.status == "verified" else None,
            "verification_error_code": None,
            "raw_metadata": self.raw_metadata or {},
            "updated_at": seen_at,
        }


def _supported(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"supported", "enabled", "true", "yes"}
    if isinstance(value, dict):
        if "supported" in value:
            return _supported(value["supported"])
        return any(_supported(item) for item in value.values())
    return False


def _released_at(metadata: dict[str, Any]) -> str | None:
    created = metadata.get("created_at") or metadata.get("created")
    if isinstance(created, (int, float)):
        return datetime.fromtimestamp(created, tz=UTC).isoformat()
    if isinstance(created, str) and created:
        return created
    return None


def _safe_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        key: metadata[key]
        for key in ("id", "owned_by", "display_name", "created", "created_at", "capabilities")
        if key in metadata
    }


def _anthropic_reasoning_options(capabilities: dict[str, Any]) -> tuple[str, ...]:
    effort = capabilities.get("effort")
    values: list[str] = []
    if isinstance(effort, dict):
        raw_values = effort.get("values") or effort.get("levels") or []
        if isinstance(raw_values, list):
            values = [
                str(value)
                for value in raw_values
                if str(value) in {"low", "medium", "high", "max"}
            ]
    thinking = capabilities.get("thinking")
    if not values and _supported(thinking):
        values = ["low", "medium", "high"]
    return tuple(["off", *dict.fromkeys(values)])


def classify_provider_model(
    provider: Provider,
    metadata: dict[str, Any],
) -> CatalogModel:
    model_id = str(metadata.get("id") or "").strip()
    if not model_id:
        raise ValueError("provider_model_id_missing")
    label = str(metadata.get("display_name") or model_id)
    owned_by = str(metadata["owned_by"]) if metadata.get("owned_by") else None
    base = MODEL_BY_KEY.get((provider, model_id))
    if base is not None:
        return CatalogModel(
            provider=provider,
            id=model_id,
            label=base.label,
            capabilities=base.capabilities,
            reasoning_options=base.reasoning_options,
            status="verified",
            source="curated",
            owned_by=owned_by,
            released_at=_released_at(metadata),
            raw_metadata=_safe_metadata(metadata),
        )

    capabilities: set[str] = set()
    reasoning_options: tuple[str, ...] = ("off",)
    status = "discovered"
    source = "provider"
    normalized = model_id.lower()

    if provider is Provider.OPENAI:
        if normalized.startswith("gpt-5"):
            capabilities.update(
                {"tool_calling", "structured_output", "reasoning", "pdf_input"}
            )
            reasoning_options = ("off", "low", "medium", "high", "xhigh")
            status = "verified"
        elif normalized.startswith("gpt-4o"):
            capabilities.update({"tool_calling", "structured_output", "pdf_input"})
            status = "verified"
    elif provider is Provider.ANTHROPIC and normalized.startswith("claude-"):
        capabilities.update({"tool_calling", "structured_output"})
        provider_capabilities = metadata.get("capabilities")
        if isinstance(provider_capabilities, dict):
            if _supported(
                provider_capabilities.get("pdf_input")
                or provider_capabilities.get("pdf")
            ):
                capabilities.add("pdf_input")
            reasoning_options = _anthropic_reasoning_options(provider_capabilities)
            if len(reasoning_options) > 1:
                capabilities.add("reasoning")
            source = "provider_capabilities"
        status = "verified"
    elif provider is Provider.DEEPSEEK and normalized.startswith("deepseek-v4-"):
        capabilities.update({"tool_calling", "structured_output", "reasoning"})
        reasoning_options = ("off", "high", "max")
        status = "verified"
    elif (
        provider is Provider.GEMINI
        and normalized.startswith("gemini-")
        and not any(
            excluded in normalized
            for excluded in ("embedding", "imagen", "veo", "tts", "audio")
        )
    ):
        capabilities.update(
            {"tool_calling", "structured_output", "reasoning", "pdf_input"}
        )
        reasoning_options = ("off", "minimal", "low", "medium", "high")
        status = "verified"

    return CatalogModel(
        provider=provider,
        id=model_id,
        label=label,
        capabilities=frozenset(capabilities),
        reasoning_options=reasoning_options,
        status=status,
        source=source,
        owned_by=owned_by,
        released_at=_released_at(metadata),
        raw_metadata=_safe_metadata(metadata),
    )


class ProviderModelDiscovery:
    async def list_models(
        self,
        provider: Provider,
        api_key: str,
    ) -> list[dict[str, Any]]:
        if not api_key:
            raise LLMConfigurationError("provider_credential_missing")
        headers = {"Accept": "application/json"}
        if provider is Provider.ANTHROPIC:
            headers.update(
                {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                }
            )
        else:
            headers["Authorization"] = f"Bearer {api_key}"

        async with httpx.AsyncClient(
            timeout=DISCOVERY_TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as client:
            if provider is Provider.ANTHROPIC:
                return await self._list_anthropic(client, headers)
            response = await client.get(PROVIDER_MODEL_ENDPOINTS[provider], headers=headers)
            response.raise_for_status()
            payload = response.json()
            data = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(data, list):
                raise LLMConfigurationError("provider_models_invalid_response")
            return [row for row in data if isinstance(row, dict)]

    async def _list_anthropic(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        after_id: str | None = None
        for _ in range(MAX_ANTHROPIC_PAGES):
            params: dict[str, str | int] = {"limit": 100}
            if after_id:
                params["after_id"] = after_id
            response = await client.get(
                PROVIDER_MODEL_ENDPOINTS[Provider.ANTHROPIC],
                headers=headers,
                params=params,
            )
            response.raise_for_status()
            payload = response.json()
            data = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(data, list):
                raise LLMConfigurationError("provider_models_invalid_response")
            rows.extend(row for row in data if isinstance(row, dict))
            if not payload.get("has_more"):
                break
            after_id = payload.get("last_id")
            if not isinstance(after_id, str) or not after_id:
                break
        return rows


class LLMModelCatalogService:
    def __init__(
        self,
        client: Any | None = None,
        discovery: ProviderModelDiscovery | None = None,
    ):
        self._client = client
        self.discovery = discovery or ProviderModelDiscovery()

    @property
    def client(self) -> Any:
        return self._client or get_supabase_client()

    async def _provider_key(self, provider: Provider) -> str:
        def _fetch() -> str:
            credential_result = (
                self.client.table("llm_provider_credentials")
                .select("api_key_encrypted,status")
                .eq("provider", provider.value)
                .eq("status", "active")
                .limit(1)
                .execute()
            )
            rows = credential_result.data or []
            credential = rows[0] if isinstance(rows, list) and rows else None
            if not isinstance(credential, dict):
                raise LLMConfigurationError("provider_credential_missing")
            decrypted = self.client.rpc(
                "decrypt_credential",
                {"p_encrypted": credential["api_key_encrypted"]},
            ).execute()
            if not isinstance(decrypted.data, str) or not decrypted.data:
                raise LLMConfigurationError("provider_credential_missing")
            return decrypted.data

        return await asyncio.to_thread(_fetch)

    async def sync_provider(
        self,
        *,
        provider: Provider,
        actor_id: str | None,
    ) -> dict[str, Any]:
        api_key = await self._provider_key(provider)
        seen_at = datetime.now(UTC).isoformat()
        try:
            raw_models = await self.discovery.list_models(provider, api_key)
            classified = [
                classify_provider_model(provider, metadata)
                for metadata in raw_models
                if metadata.get("id")
            ]
            rows = [model.database_row(seen_at=seen_at) for model in classified]

            def _persist() -> None:
                (
                    self.client.table("llm_provider_models")
                    .update({"is_available": False, "updated_at": seen_at})
                    .eq("provider", provider.value)
                    .execute()
                )
                if rows:
                    (
                        self.client.table("llm_provider_models")
                        .upsert(rows, on_conflict="provider,model_id")
                        .execute()
                    )
                (
                    self.client.table("llm_model_catalog_syncs")
                    .upsert(
                        {
                            "provider": provider.value,
                            "status": "success",
                            "model_count": len(rows),
                            "last_error_code": None,
                            "last_synced_at": seen_at,
                            "updated_by": actor_id,
                        },
                        on_conflict="provider",
                    )
                    .execute()
                )
                (
                    self.client.table("llm_configuration_events")
                    .insert(
                        {
                            "actor_id": actor_id,
                            "action": "model_catalog_synced",
                            "provider": provider.value,
                            "outcome": "success",
                        }
                    )
                    .execute()
                )

            await asyncio.to_thread(_persist)
            return {
                "provider": provider.value,
                "status": "success",
                "model_count": len(rows),
                "last_synced_at": seen_at,
            }
        except Exception as exc:
            logger.warning(
                "llm_model_catalog_sync_failed",
                provider=provider.value,
                error_type=type(exc).__name__,
            )
            await self._record_failure(provider, actor_id, seen_at)
            if isinstance(exc, LLMConfigurationError):
                raise
            raise LLMConfigurationError("provider_model_sync_failed") from exc

    async def _record_failure(
        self,
        provider: Provider,
        actor_id: str | None,
        synced_at: str,
    ) -> None:
        def _persist() -> None:
            (
                self.client.table("llm_model_catalog_syncs")
                .upsert(
                    {
                        "provider": provider.value,
                        "status": "error",
                        "model_count": 0,
                        "last_error_code": "PROVIDER_MODEL_SYNC_FAILED",
                        "last_synced_at": synced_at,
                        "updated_by": actor_id,
                    },
                    on_conflict="provider",
                )
                .execute()
            )

        try:
            await asyncio.to_thread(_persist)
        except Exception:
            logger.error(
                "llm_model_catalog_failure_status_not_persisted",
                provider=provider.value,
            )

    async def snapshot(self) -> dict[str, list[dict[str, Any]]]:
        def _fetch() -> dict[str, list[dict[str, Any]]]:
            models = (
                self.client.table("llm_provider_models")
                .select(
                    "provider,model_id,display_name,capabilities,reasoning_options,"
                    "verification_status,source,owned_by,released_at,is_available,"
                    "last_seen_at,last_verified_at,verification_error_code"
                )
                .eq("is_available", True)
                .order("released_at", desc=True)
                .execute()
            )
            syncs = (
                self.client.table("llm_model_catalog_syncs")
                .select(
                    "provider,status,model_count,last_error_code,last_synced_at"
                )
                .order("provider")
                .execute()
            )
            return {
                "models": models.data or [],
                "syncs": syncs.data or [],
            }

        return await asyncio.to_thread(_fetch)

    async def sync_all_configured(self) -> dict[str, str]:
        outcomes: dict[str, str] = {}
        for provider in Provider:
            try:
                await self.sync_provider(provider=provider, actor_id=None)
                outcomes[provider.value] = "success"
            except LLMConfigurationError as exc:
                outcomes[provider.value] = str(exc)
        return outcomes


__all__ = [
    "CatalogModel",
    "LLMModelCatalogService",
    "ProviderModelDiscovery",
    "classify_provider_model",
]
