"""Super-admin LLM control plane endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from api.deps import verify_super_admin
from services.llm_control_plane import (
    LLMCapabilityError,
    LLMConfigurationConflict,
    LLMConfigurationError,
    LLMTask,
    Provider,
    get_llm_control_plane,
)
from services.llm_model_catalog import LLMModelCatalogService

router = APIRouter(
    prefix="/llms",
    tags=["llms"],
    dependencies=[Depends(verify_super_admin)],
)


class ProviderCredentialRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = Field(min_length=8, max_length=8192)


class TaskConfigurationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Provider
    model: str = Field(min_length=1, max_length=160)
    reasoning_effort: str = Field(default="off", min_length=2, max_length=24)
    enabled: bool = True
    expected_version: int = Field(ge=0)


def _public_payload(payload: Any) -> Any:
    if isinstance(payload, list):
        return [_public_payload(item) for item in payload]
    if isinstance(payload, dict):
        return {
            key: _public_payload(value)
            for key, value in payload.items()
            if key not in {"api_key", "api_key_encrypted", "credentials"}
        }
    return payload


@router.get("/")
async def list_llm_configuration():
    snapshot = await get_llm_control_plane().snapshot()
    return _public_payload(snapshot)


@router.put("/providers/{provider}/credential")
async def save_provider_credential(
    provider: Provider,
    body: ProviderCredentialRequest,
    actor_id: str = Depends(verify_super_admin),
):
    try:
        result = await get_llm_control_plane().save_credential(
            provider=provider,
            api_key=body.api_key,
            actor_id=actor_id,
        )
        return _public_payload(result)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=422, detail="LLM_CREDENTIAL_INVALID") from exc


@router.post("/providers/{provider}/models/sync")
async def sync_provider_models(
    provider: Provider,
    actor_id: str = Depends(verify_super_admin),
):
    try:
        result = await LLMModelCatalogService().sync_provider(
            provider=provider,
            actor_id=actor_id,
        )
        return _public_payload(result)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=422, detail="LLM_MODEL_SYNC_FAILED") from exc


@router.put("/tasks/{task}")
async def update_llm_task(
    task: LLMTask,
    body: TaskConfigurationRequest,
    actor_id: str = Depends(verify_super_admin),
):
    try:
        result = await get_llm_control_plane().configure_task(
            task=task,
            provider=body.provider,
            model=body.model,
            reasoning_effort=body.reasoning_effort,
            enabled=body.enabled,
            expected_version=body.expected_version,
            actor_id=actor_id,
        )
        return _public_payload(result)
    except LLMConfigurationConflict as exc:
        raise HTTPException(status_code=409, detail="LLM_CONFIGURATION_CONFLICT") from exc
    except (LLMCapabilityError, LLMConfigurationError) as exc:
        raise HTTPException(status_code=422, detail="LLM_CAPABILITY_UNSUPPORTED") from exc
