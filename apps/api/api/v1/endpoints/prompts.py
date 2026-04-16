"""
Router de Prompt Ops — CRUD de prompts del sistema + sandbox.

Todos los endpoints requieren ser super_admin (X-Internal-Secret + X-User-Id).

Endpoints:
    GET    /prompts/                        — Lista todos los prompts con su versión activa
    GET    /prompts/{prompt_id}/versions    — Lista versiones de un prompt (desc)
    POST   /prompts/{prompt_id}/versions    — Crea nueva versión (no activa)
    PUT    /prompts/{prompt_id}/activate/{version_id} — Activa versión + invalida cache
    POST   /prompts/sandbox                 — Ejecuta prompt custom sin persistir
"""

import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from api.deps import verify_super_admin
from core.database import get_supabase_client
from agent.prompt_cache import invalidate_prompt_cache

router = APIRouter(
    prefix="/prompts",
    tags=["prompts"],
    dependencies=[Depends(verify_super_admin)],
)


# ---------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------


class CreateVersionRequest(BaseModel):
    content: str
    change_note: str | None = None
    author_id: str | None = None


class SandboxRequest(BaseModel):
    prompt_content: str
    test_message: str
    organization_id: str


# ---------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------


@router.get("/")
async def list_prompts():
    """Lista todos los system_prompts con su versión activa."""
    supabase = get_supabase_client()
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("system_prompts")
            .select(
                "id, slug, name, description, category, created_at, updated_at, "
                "prompt_versions(id, version, is_active, tested_at, change_note, created_at)"
            )
            .order("created_at")
            .execute()
        )
    )
    return result.data


@router.get("/{prompt_id}/versions")
async def list_versions(prompt_id: str):
    """Lista todas las versiones de un prompt, ordenadas por versión desc."""
    supabase = get_supabase_client()
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("prompt_versions")
            .select(
                "id, version, is_active, tested_at, change_note, author_id, created_at"
            )
            .eq("prompt_id", prompt_id)
            .order("version", desc=True)
            .execute()
        )
    )
    return result.data


@router.post("/{prompt_id}/versions")
async def create_version(prompt_id: str, body: CreateVersionRequest):
    """
    Crea una nueva versión de un prompt (no la activa automáticamente).
    El número de versión se incrementa automáticamente sobre el máximo existente.
    """
    supabase = get_supabase_client()

    # Obtener el número de versión más alto actual
    count_result = await asyncio.to_thread(
        lambda: (
            supabase.table("prompt_versions")
            .select("version")
            .eq("prompt_id", prompt_id)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
    )

    next_version = 1
    if count_result.data:
        next_version = count_result.data[0]["version"] + 1

    result = await asyncio.to_thread(
        lambda: (
            supabase.table("prompt_versions")
            .insert(
                {
                    "prompt_id": prompt_id,
                    "version": next_version,
                    "content": body.content,
                    "change_note": body.change_note,
                    "author_id": body.author_id,
                    "is_active": False,
                }
            )
            .execute()
        )
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear la versión")

    return result.data[0]


@router.put("/{prompt_id}/activate/{version_id}")
async def activate_version(prompt_id: str, version_id: str):
    """
    Activa una versión específica.
    El trigger trg_single_active_prompt desactiva automáticamente la versión previa.
    Invalida el cache Redis inmediatamente.
    """
    supabase = get_supabase_client()

    result = await asyncio.to_thread(
        lambda: (
            supabase.table("prompt_versions")
            .update({"is_active": True})
            .eq("id", version_id)
            .eq("prompt_id", prompt_id)
            .execute()
        )
    )

    if not result.data:
        raise HTTPException(
            status_code=404, detail="Versión no encontrada para este prompt"
        )

    # Invalidar cache Redis para que el agente use el nuevo prompt sin esperar TTL
    prompt_result = await asyncio.to_thread(
        lambda: (
            supabase.table("system_prompts")
            .select("slug")
            .eq("id", prompt_id)
            .single()
            .execute()
        )
    )

    if prompt_result.data:
        await invalidate_prompt_cache(prompt_result.data["slug"])

    return {"status": "activated", "version_id": version_id}


@router.post("/sandbox")
async def sandbox_prompt(body: SandboxRequest):
    """
    Ejecuta el grafo con un prompt custom sin persistir.
    Para testing en la consola Prompt Ops antes de activar una versión.
    No usa checkpointer ni thread_id.
    """
    from langchain_core.messages import HumanMessage
    from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
    from agent.graph import get_llm_with_tools

    dynamic_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", body.prompt_content),
            MessagesPlaceholder(variable_name="messages"),
        ]
    )

    llm_tools = get_llm_with_tools()

    prompt_value = await dynamic_prompt.ainvoke(
        {
            "messages": [HumanMessage(content=body.test_message)],
            "lead_info": {},
            "context": "Sandbox testing",
            "organization_id": body.organization_id,
        }
    )

    response = await llm_tools.ainvoke(prompt_value)
    return {"response": response.content}
