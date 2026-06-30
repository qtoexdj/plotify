"""
Endpoint: invalidación de cache de skills por organización.

Llamado por el frontend tras habilitar/deshabilitar una skill
desde org_skill_configs, para que el próximo mensaje del agente
use el conjunto de tools actualizado.

M-v2-3.3
"""

import asyncio

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from agent.skill_registry import invalidate_skills_cache
from api.deps import verify_internal_secret
from core.database import get_supabase_client
from schemas.agent_skills import (
    CustomSkillPublishRequest,
    CustomSkillResponse,
    CustomSkillSaveRequest,
    SkillValidationRequest,
    SkillValidationResponse,
)
from services.agent_skill_validation import (
    CustomSkillNotFoundError,
    CustomSkillValidationBlockedError,
    build_approved_tool_catalog,
    has_active_mcp_connection,
    publish_custom_skill_definition,
    save_custom_skill_definition,
    validate_skill_definition,
)

router = APIRouter(
    prefix="/skills",
    tags=["skills"],
    dependencies=[Depends(verify_internal_secret)],
)


class InvalidateCacheRequest(BaseModel):
    organization_id: str


@router.post("/invalidate-cache")
async def invalidate_cache(body: InvalidateCacheRequest):
    """
    Invalida el cache de skills de una organización.

    Tras llamar este endpoint, el próximo mensaje procesado para esa org
    consultará la BD y recompilará el grafo con las tools actualizadas.
    """
    await invalidate_skills_cache(body.organization_id)
    return {"status": "invalidated", "organization_id": body.organization_id}


@router.post("/validate-definition", response_model=SkillValidationResponse)
async def validate_definition(body: SkillValidationRequest):
    def _validate() -> SkillValidationResponse:
        supabase = get_supabase_client()
        catalog = build_approved_tool_catalog(supabase, body.organization_id)
        mcp_active = has_active_mcp_connection(
            supabase,
            body.organization_id,
            body.mcp_provider,
        )
        return validate_skill_definition(
            body,
            approved_tool_catalog=catalog,
            has_active_mcp_connection=mcp_active,
        )

    return await asyncio.to_thread(_validate)


@router.post("/custom", response_model=CustomSkillResponse)
async def save_custom_skill(
    body: CustomSkillSaveRequest,
    x_user_id: str | None = Header(None, alias="X-User-Id"),
):
    def _save() -> CustomSkillResponse:
        supabase = get_supabase_client()
        catalog = build_approved_tool_catalog(supabase, body.organization_id)
        mcp_active = has_active_mcp_connection(
            supabase,
            body.organization_id,
            body.mcp_provider,
        )
        return save_custom_skill_definition(
            supabase,
            body,
            actor_id=x_user_id,
            approved_tool_catalog=catalog,
            has_active_mcp_connection=mcp_active,
        )

    response = await asyncio.to_thread(_save)
    await invalidate_skills_cache(body.organization_id)
    return response


@router.post("/custom/publish", response_model=CustomSkillResponse)
async def publish_custom_skill(
    body: CustomSkillPublishRequest,
    x_user_id: str | None = Header(None, alias="X-User-Id"),
):
    def _publish() -> CustomSkillResponse:
        supabase = get_supabase_client()
        catalog = build_approved_tool_catalog(supabase, body.organization_id)
        skill_row = (
            supabase.table("agent_skills")
            .select("requires_mcp, mcp_provider")
            .eq("organization_id", body.organization_id)
            .eq("id", body.skill_id)
            .limit(1)
            .execute()
        )
        row = skill_row.data[0] if skill_row.data else {}
        mcp_active = has_active_mcp_connection(
            supabase,
            body.organization_id,
            row.get("mcp_provider"),
        )
        return publish_custom_skill_definition(
            supabase,
            body,
            actor_id=x_user_id,
            approved_tool_catalog=catalog,
            has_active_mcp_connection=mcp_active,
        )

    try:
        response = await asyncio.to_thread(_publish)
    except CustomSkillNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CustomSkillValidationBlockedError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "La skill no puede publicarse.",
                "validation": exc.validation.model_dump(),
            },
        ) from exc

    await invalidate_skills_cache(body.organization_id)
    return response
