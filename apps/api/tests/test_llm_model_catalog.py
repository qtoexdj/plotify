from __future__ import annotations

from types import SimpleNamespace

import pytest

from services.llm_control_plane import Provider
from services.llm_model_catalog import (
    LLMModelCatalogService,
    PROVIDER_MODEL_ENDPOINTS,
    classify_provider_model,
)


def test_deepseek_v4_models_are_verified_for_tools_json_and_reasoning():
    model = classify_provider_model(
        Provider.DEEPSEEK,
        {
            "id": "deepseek-v4-pro",
            "owned_by": "deepseek",
        },
    )

    assert model.status == "verified"
    assert model.capabilities == frozenset(
        {"tool_calling", "structured_output", "reasoning"}
    )
    assert model.reasoning_options == ("off", "high", "max")


def test_unknown_openai_model_is_discovered_but_not_selectable():
    model = classify_provider_model(
        Provider.OPENAI,
        {
            "id": "future-audio-model",
            "created": 1_800_000_000,
            "owned_by": "openai",
        },
    )

    assert model.status == "discovered"
    assert model.capabilities == frozenset()
    assert model.reasoning_options == ("off",)


@pytest.mark.parametrize(
    "model_id",
    ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
)
def test_current_openai_56_tiers_are_verified(model_id):
    model = classify_provider_model(
        Provider.OPENAI,
        {"id": model_id, "owned_by": "openai"},
    )

    assert model.status == "verified"
    assert {"tool_calling", "structured_output", "reasoning", "pdf_input"} <= set(
        model.capabilities
    )
    assert model.reasoning_options == ("off", "low", "medium", "high", "xhigh")


def test_anthropic_runtime_capabilities_drive_pdf_and_thinking_options():
    model = classify_provider_model(
        Provider.ANTHROPIC,
        {
            "id": "claude-opus-next",
            "display_name": "Claude Opus Next",
            "capabilities": {
                "pdf_input": {"supported": True},
                "thinking": {
                    "types": {
                        "adaptive": {"supported": True},
                        "enabled": {"supported": True},
                    }
                },
                "effort": {
                    "supported": True,
                    "values": ["low", "medium", "high", "max"],
                },
            },
        },
    )

    assert model.status == "verified"
    assert {"tool_calling", "structured_output", "pdf_input", "reasoning"} <= set(
        model.capabilities
    )
    assert model.reasoning_options == ("off", "low", "medium", "high", "max")


def test_gemini_models_are_verified_for_tools_json_reasoning_and_pdf():
    model = classify_provider_model(
        Provider.GEMINI,
        {
            "id": "gemini-3.6-flash",
            "owned_by": "google",
        },
    )

    assert model.status == "verified"
    assert model.capabilities == frozenset(
        {"tool_calling", "structured_output", "reasoning", "pdf_input"}
    )
    assert model.reasoning_options == ("off", "minimal", "low", "medium", "high")
    assert (
        PROVIDER_MODEL_ENDPOINTS[Provider.GEMINI]
        == "https://generativelanguage.googleapis.com/v1beta/openai/models"
    )


@pytest.mark.asyncio
async def test_sync_writes_catalog_only_and_never_changes_active_task_assignments():
    touched_tables: list[str] = []

    class Result:
        def __init__(self, data):
            self.data = data

    class Query:
        def __init__(self, table: str):
            self.table = table
            self.operation = "select"
            self.payload = None

        def select(self, *_args):
            self.operation = "select"
            return self

        def eq(self, *_args):
            return self

        def limit(self, *_args):
            return self

        def update(self, payload):
            self.operation = "update"
            self.payload = payload
            return self

        def upsert(self, payload, **_kwargs):
            self.operation = "upsert"
            self.payload = payload
            return self

        def insert(self, payload):
            self.operation = "insert"
            self.payload = payload
            return self

        def execute(self):
            if self.operation == "select":
                if self.table == "llm_provider_credentials":
                    return Result(
                        [
                            {
                                "api_key_encrypted": "ciphertext",
                                "status": "active",
                            }
                        ]
                    )
                return Result([])
            touched_tables.append(self.table)
            if self.operation == "upsert" and isinstance(self.payload, list):
                return Result(self.payload)
            return Result([self.payload])

    class Rpc:
        def execute(self):
            return Result("provider-key")

    class FakeClient:
        def table(self, name):
            return Query(name)

        def rpc(self, *_args, **_kwargs):
            return Rpc()

    class FakeDiscovery:
        async def list_models(self, provider, api_key):
            assert provider is Provider.DEEPSEEK
            assert api_key == "provider-key"
            return [{"id": "deepseek-v4-pro", "owned_by": "deepseek"}]

    result = await LLMModelCatalogService(
        client=FakeClient(),
        discovery=FakeDiscovery(),
    ).sync_provider(
        provider=Provider.DEEPSEEK,
        actor_id="00000000-0000-0000-0000-000000000001",
    )

    assert result["model_count"] == 1
    assert "llm_provider_models" in touched_tables
    assert "llm_model_catalog_syncs" in touched_tables
    assert "llm_task_configs" not in touched_tables


def test_worker_registers_daily_model_catalog_sync():
    from workers.main_worker import WorkerSettings

    cron_names = {job.name for job in WorkerSettings.cron_jobs}
    assert "sync_llm_model_catalog_daily" in cron_names
