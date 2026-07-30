from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from api.v1.endpoints import llms
from services.llm_control_plane import (
    LLMCapabilityError,
    LLMControlPlane,
    LLMTask,
    Provider,
    build_model_client,
    mask_api_key,
    model_catalog,
    validate_task_selection,
)


def test_catalog_exposes_four_providers_and_all_runtime_tasks():
    catalog = model_catalog()

    assert set(catalog["providers"]) == {
        "openai",
        "anthropic",
        "deepseek",
        "gemini",
    }
    assert {task["key"] for task in catalog["tasks"]} == {
        "conversation",
        "title_analysis",
        "pdf_vision",
        "prompt_sandbox",
    }


def test_catalog_exposes_current_openai_56_tiers_instead_of_generic_alias():
    catalog = model_catalog()
    openai_ids = {
        model["id"]
        for model in catalog["models"]
        if model["provider"] == Provider.OPENAI.value
    }

    assert {"gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"} <= openai_ids
    assert "gpt-5.6" not in openai_ids


def test_catalog_exposes_current_anthropic_model_families():
    catalog = model_catalog()
    anthropic_ids = {
        model["id"]
        for model in catalog["models"]
        if model["provider"] == Provider.ANTHROPIC.value
    }

    assert {
        "claude-sonnet-5",
        "claude-fable-5",
        "claude-mythos-5",
        "claude-opus-4-8",
        "claude-opus-4-7",
        "claude-mythos-preview",
    } <= anthropic_ids


def test_persisted_catalog_keeps_curated_current_models_before_legacy_models():
    catalog = model_catalog(
        [
            {
                "provider": "openai",
                "model_id": "gpt-4o",
                "display_name": "GPT-4o",
                "capabilities": ["tool_calling"],
                "reasoning_options": ["off"],
            },
            {
                "provider": "openai",
                "model_id": "gpt-5.6-sol",
                "display_name": "GPT-5.6 Sol",
                "capabilities": ["tool_calling"],
                "reasoning_options": ["off", "low"],
            },
            {
                "provider": "anthropic",
                "model_id": "claude-haiku-4-5",
                "display_name": "Claude Haiku 4.5",
                "capabilities": ["tool_calling"],
                "reasoning_options": ["off"],
            },
            {
                "provider": "anthropic",
                "model_id": "claude-sonnet-5",
                "display_name": "Claude Sonnet 5",
                "capabilities": ["tool_calling"],
                "reasoning_options": ["off"],
            },
        ]
    )

    assert [
        model["id"]
        for model in catalog["models"]
        if model["provider"] == "openai"
    ][:2] == ["gpt-5.6-sol", "gpt-4o"]
    assert [
        model["id"]
        for model in catalog["models"]
        if model["provider"] == "anthropic"
    ][:2] == ["claude-sonnet-5", "claude-haiku-4-5"]


def test_deepseek_v4_is_valid_for_conversation_and_title_analysis():
    validate_task_selection(
        LLMTask.CONVERSATION,
        Provider.DEEPSEEK,
        "deepseek-v4-pro",
        "high",
    )
    validate_task_selection(
        LLMTask.TITLE_ANALYSIS,
        Provider.DEEPSEEK,
        "deepseek-v4-flash",
        "off",
    )


def test_deepseek_is_rejected_for_pdf_vision():
    with pytest.raises(LLMCapabilityError, match="pdf_input"):
        validate_task_selection(
            LLMTask.PDF_VISION,
            Provider.DEEPSEEK,
            "deepseek-v4-pro",
            "off",
        )


def test_gemini_is_valid_for_all_runtime_tasks_including_pdf_vision():
    for task in LLMTask:
        validate_task_selection(
            task,
            Provider.GEMINI,
            "gemini-3.6-flash",
            "medium",
        )


def test_api_key_mask_never_contains_the_secret():
    secret = "sk-live-this-must-never-be-returned-a91f"
    masked = mask_api_key(secret)

    assert masked == "••••••a91f"
    assert secret not in masked
    assert "this-must-never-be-returned" not in masked


def test_build_model_client_supports_deepseek(monkeypatch):
    captured: dict[str, object] = {}

    class FakeChatDeepSeek:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(
        "services.llm_control_plane.ChatDeepSeek",
        FakeChatDeepSeek,
    )

    client = build_model_client(
        provider=Provider.DEEPSEEK,
        model="deepseek-v4-pro",
        api_key="deepseek-test-key",
        reasoning_effort="off",
        timeout_seconds=10,
    )

    assert isinstance(client, FakeChatDeepSeek)
    assert captured["model"] == "deepseek-v4-pro"
    assert captured["api_key"] == "deepseek-test-key"
    assert captured["timeout"] == 10


def test_build_model_client_supports_gemini_openai_compatibility(monkeypatch):
    captured: dict[str, object] = {}

    class FakeChatOpenAI:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(
        "services.llm_control_plane.ChatOpenAI",
        FakeChatOpenAI,
    )

    client = build_model_client(
        provider=Provider.GEMINI,
        model="gemini-3.6-flash",
        api_key="gemini-test-key",
        reasoning_effort="medium",
        timeout_seconds=10,
    )

    assert isinstance(client, FakeChatOpenAI)
    assert captured["model"] == "gemini-3.6-flash"
    assert captured["api_key"] == "gemini-test-key"
    assert captured["timeout"] == 10
    assert captured["base_url"] == (
        "https://generativelanguage.googleapis.com/v1beta/openai/"
    )
    assert captured["reasoning_effort"] == "medium"


@pytest.mark.asyncio
async def test_save_credential_persists_only_ciphertext_and_redacted_audit():
    secret = "deepseek-plaintext-must-never-reach-the-table"
    ciphertext = "vault-ciphertext-value"
    writes: dict[str, list[dict[str, object]]] = {
        "llm_provider_credentials": [],
        "llm_configuration_events": [],
    }

    class Result:
        def __init__(self, data):
            self.data = data

    class Query:
        def __init__(self, table: str):
            self.table = table
            self.operation = "select"
            self.payload: dict[str, object] | None = None

        def select(self, *_args):
            self.operation = "select"
            return self

        def eq(self, *_args):
            return self

        def limit(self, *_args):
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
                return Result([])
            assert self.payload is not None
            writes[self.table].append(self.payload)
            return Result([self.payload])

    class Rpc:
        def __init__(self, name: str, params: dict[str, str]):
            self.name = name
            self.params = params

        def execute(self):
            assert self.name == "encrypt_credential"
            assert self.params == {"p_plaintext": secret}
            return Result(ciphertext)

    class FakeClient:
        def rpc(self, name, params):
            return Rpc(name, params)

        def table(self, name):
            return Query(name)

    result = await LLMControlPlane(FakeClient()).save_credential(
        provider=Provider.DEEPSEEK,
        api_key=secret,
        actor_id="00000000-0000-0000-0000-000000000001",
    )

    stored = writes["llm_provider_credentials"][0]
    audit = writes["llm_configuration_events"][0]
    assert stored["api_key_encrypted"] == ciphertext
    assert secret not in str(stored)
    assert secret not in str(audit)
    assert result["key_hint"] == f"••••••{secret[-4:]}"
    assert "api_key_encrypted" not in result


@pytest.mark.asyncio
async def test_list_configuration_never_returns_ciphertext_or_plaintext(monkeypatch):
    class FakeService:
        async def snapshot(self):
            return {
                "catalog": model_catalog(),
                "providers": [
                    {
                        "provider": "openai",
                        "status": "active",
                        "key_hint": "••••••a91f",
                        "api_key_encrypted": "ciphertext-must-not-leak",
                    }
                ],
                "tasks": [],
            }

    monkeypatch.setattr(llms, "get_llm_control_plane", lambda: FakeService())

    response = await llms.list_llm_configuration()
    serialized = str(response)

    assert "••••••a91f" in serialized
    assert "api_key_encrypted" not in serialized
    assert "ciphertext-must-not-leak" not in serialized


@pytest.mark.asyncio
async def test_task_update_returns_conflict_for_stale_version(monkeypatch):
    class FakeService:
        async def configure_task(self, **_kwargs):
            raise llms.LLMConfigurationConflict("stale")

    monkeypatch.setattr(llms, "get_llm_control_plane", lambda: FakeService())

    with pytest.raises(HTTPException) as error:
        await llms.update_llm_task(
            "conversation",
            llms.TaskConfigurationRequest(
                provider="deepseek",
                model="deepseek-v4-pro",
                reasoning_effort="off",
                enabled=True,
                expected_version=1,
            ),
            actor_id="super-admin-id",
        )

    assert error.value.status_code == 409
    assert error.value.detail == "LLM_CONFIGURATION_CONFLICT"


@pytest.mark.asyncio
async def test_credential_save_does_not_echo_api_key(monkeypatch):
    class FakeService:
        async def save_credential(self, **kwargs):
            assert kwargs["api_key"] == "deepseek-secret"
            return {
                "provider": "deepseek",
                "status": "active",
                "key_hint": "••••••cret",
                "version": 1,
            }

    monkeypatch.setattr(llms, "get_llm_control_plane", lambda: FakeService())

    response = await llms.save_provider_credential(
        "deepseek",
        llms.ProviderCredentialRequest(api_key="deepseek-secret"),
        actor_id="super-admin-id",
    )

    assert response["key_hint"] == "••••••cret"
    assert "api_key" not in response
    assert "deepseek-secret" not in str(response)
