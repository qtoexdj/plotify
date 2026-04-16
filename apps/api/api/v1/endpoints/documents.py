"""
Router de documentos legales — orquestador de plantillas + generación PDF/DOCX.

Todos los endpoints requieren X-Internal-Secret (llamado desde el frontend Next.js).

Endpoints:
    POST   /documents/preview          — Preview HTML sin persistir
    POST   /documents/generate         — Genera PDF/DOCX, guarda en Storage y registra
    GET    /documents/templates        — Lista templates de una org
    POST   /documents/templates        — Crea template
    GET    /documents/templates/{id}/blocks — Lista bloques de un template
    GET    /documents/blocks           — Lista bloques de una org
    POST   /documents/blocks           — Crea bloque de texto legal
    PUT    /documents/blocks/{id}      — Actualiza bloque
    GET    /documents/generated        — Historial de documentos generados
    GET    /documents/variables/{lot_id} — Resuelve variables de un lote (debug)

Ref: plotify_memori/Generacion de Documentos.md
"""

import asyncio
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import require_lot_organization, verify_internal_secret
from services.document_engine import render_template, resolve_variables
from services.document_generator import generate_pdf, generate_docx, persist_document
from core.database import get_supabase_client

router = APIRouter(
    prefix="/documents",
    tags=["documents"],
    dependencies=[Depends(verify_internal_secret)],
)


# ---------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------


class PreviewRequest(BaseModel):
    template_id: str
    lot_id: str
    organization_id: str


class PreviewResponse(BaseModel):
    html: str


class GenerateRequest(BaseModel):
    template_id: str
    lot_id: str
    organization_id: str
    format: Literal["pdf", "docx"] = "pdf"
    generated_by: str | None = None


class GenerateResponse(BaseModel):
    file_url: str
    format: Literal["pdf", "docx"]


class CreateBlockRequest(BaseModel):
    organization_id: str
    name: str
    category: str
    content: str
    variables: list[str] | None = None
    tags: list[str] | None = None
    created_by: str | None = None


class UpdateBlockRequest(BaseModel):
    name: str | None = None
    content: str | None = None
    category: str | None = None
    variables: list[str] | None = None
    tags: list[str] | None = None
    is_active: bool | None = None


class CreateTemplateRequest(BaseModel):
    organization_id: str
    name: str
    document_type: str
    description: str | None = None
    header_config: dict | None = None
    footer_config: dict | None = None
    page_config: dict | None = None
    created_by: str | None = None


class AddBlockToTemplateRequest(BaseModel):
    block_id: str
    position: int
    is_optional: bool = False
    condition_field: str | None = None
    overrides: dict | None = None


# ---------------------------------------------------------------
# Preview + Generación
# ---------------------------------------------------------------


@router.post(
    "/preview",
    response_model=PreviewResponse,
    operation_id="previewDocument",
)
async def preview_document(body: PreviewRequest) -> PreviewResponse:
    """Renderiza template como HTML sin persistir. Útil para previsualización en frontend."""
    supabase = get_supabase_client()
    organization_id = await require_lot_organization(
        body.lot_id, body.organization_id, supabase=supabase
    )
    try:
        html = await render_template(
            body.template_id, body.lot_id, organization_id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return PreviewResponse(html=html)


@router.post(
    "/generate",
    response_model=GenerateResponse,
    operation_id="generateDocument",
)
async def generate_document(body: GenerateRequest) -> GenerateResponse:
    """
    Genera PDF o DOCX a partir de un template + datos del lote.

    Sube el archivo a Supabase Storage (bucket `documents`) y registra
    en `generated_documents` con snapshot de variables para trazabilidad.

    Returns:
        {"file_url": "...", "format": "pdf"|"docx"}
    """
    supabase = get_supabase_client()
    organization_id = await require_lot_organization(
        body.lot_id, body.organization_id, supabase=supabase
    )

    try:
        if body.format == "pdf":
            file_bytes = await generate_pdf(
                body.template_id, body.lot_id, organization_id
            )
        else:
            file_bytes = await generate_docx(
                body.template_id, body.lot_id, organization_id
            )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    file_url = await persist_document(
        file_bytes=file_bytes,
        file_format=body.format,
        template_id=body.template_id,
        lot_id=body.lot_id,
        organization_id=organization_id,
        generated_by=body.generated_by,
    )

    return GenerateResponse(file_url=file_url, format=body.format)


@router.get("/variables/{lot_id}")
async def get_variables(lot_id: str, organization_id: str) -> dict[str, Any]:
    """
    Resuelve y retorna todas las variables disponibles para un lote.
    Útil para debug y para el editor visual de bloques en el frontend.
    """
    try:
        variables = await resolve_variables(lot_id, organization_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return variables


# ---------------------------------------------------------------
# Templates
# ---------------------------------------------------------------


@router.get("/templates")
async def list_templates(organization_id: str) -> list[dict]:
    """Lista templates de documentos de una organización."""
    supabase = get_supabase_client()
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("document_templates")
            .select("*")
            .eq("organization_id", organization_id)
            .order("created_at", desc=True)
            .execute()
        )
    )
    return result.data or []


@router.post("/templates", status_code=201)
async def create_template(body: CreateTemplateRequest) -> dict:
    """Crea un nuevo template de documento para una organización."""
    supabase = get_supabase_client()
    payload: dict = {
        "organization_id": body.organization_id,
        "name": body.name,
        "document_type": body.document_type,
    }
    if body.description is not None:
        payload["description"] = body.description
    if body.header_config is not None:
        payload["header_config"] = body.header_config
    if body.footer_config is not None:
        payload["footer_config"] = body.footer_config
    if body.page_config is not None:
        payload["page_config"] = body.page_config
    if body.created_by is not None:
        payload["created_by"] = body.created_by

    result = await asyncio.to_thread(
        lambda: supabase.table("document_templates").insert(payload).execute()
    )
    return result.data[0]


@router.get("/templates/{template_id}/blocks")
async def get_template_blocks(template_id: str) -> list[dict]:
    """Lista los bloques de un template en orden de posición."""
    supabase = get_supabase_client()
    result = await asyncio.to_thread(
        lambda: (
            supabase.table("template_block_items")
            .select("*, document_blocks(*)")
            .eq("template_id", template_id)
            .order("position")
            .execute()
        )
    )
    return result.data or []


@router.post("/templates/{template_id}/blocks", status_code=201)
async def add_block_to_template(
    template_id: str, body: AddBlockToTemplateRequest
) -> dict:
    """Agrega un bloque a un template en una posición específica."""
    supabase = get_supabase_client()
    payload: dict = {
        "template_id": template_id,
        "block_id": body.block_id,
        "position": body.position,
        "is_optional": body.is_optional,
    }
    if body.condition_field is not None:
        payload["condition_field"] = body.condition_field
    if body.overrides is not None:
        payload["overrides"] = body.overrides

    result = await asyncio.to_thread(
        lambda: supabase.table("template_block_items").insert(payload).execute()
    )
    return result.data[0]


@router.delete("/templates/{template_id}/blocks/{item_id}", status_code=204)
async def remove_block_from_template(template_id: str, item_id: str) -> None:
    """Elimina un bloque de un template."""
    supabase = get_supabase_client()
    await asyncio.to_thread(
        lambda: (
            supabase.table("template_block_items")
            .delete()
            .eq("id", item_id)
            .eq("template_id", template_id)
            .execute()
        )
    )


# ---------------------------------------------------------------
# Bloques
# ---------------------------------------------------------------


@router.get("/blocks")
async def list_blocks(organization_id: str, category: str | None = None) -> list[dict]:
    """Lista bloques de texto legal de una organización. Filtra por categoría opcionalmente."""
    supabase = get_supabase_client()
    query = (
        supabase.table("document_blocks")
        .select("*")
        .eq("organization_id", organization_id)
        .eq("is_active", True)
        .order("category")
        .order("name")
    )
    if category:
        query = query.eq("category", category)
    result = await asyncio.to_thread(lambda: query.execute())
    return result.data or []


@router.post("/blocks", status_code=201)
async def create_block(body: CreateBlockRequest) -> dict:
    """Crea un nuevo bloque de texto legal con soporte para variables Jinja2."""
    supabase = get_supabase_client()
    payload: dict = {
        "organization_id": body.organization_id,
        "name": body.name,
        "category": body.category,
        "content": body.content,
        "is_active": True,
        "version": 1,
    }
    if body.variables is not None:
        payload["variables"] = body.variables
    if body.tags is not None:
        payload["tags"] = body.tags
    if body.created_by is not None:
        payload["created_by"] = body.created_by

    result = await asyncio.to_thread(
        lambda: supabase.table("document_blocks").insert(payload).execute()
    )
    return result.data[0]


@router.put("/blocks/{block_id}")
async def update_block(block_id: str, body: UpdateBlockRequest) -> dict:
    """Actualiza un bloque de texto legal e incrementa su versión."""
    supabase = get_supabase_client()

    # Incrementar versión al actualizar contenido
    current = await asyncio.to_thread(
        lambda: (
            supabase.table("document_blocks")
            .select("version")
            .eq("id", block_id)
            .single()
            .execute()
        )
    )
    if not current.data:
        raise HTTPException(status_code=404, detail="Block not found")

    payload: dict = {}
    if body.name is not None:
        payload["name"] = body.name
    if body.content is not None:
        payload["content"] = body.content
        payload["version"] = (current.data.get("version") or 1) + 1
    if body.category is not None:
        payload["category"] = body.category
    if body.variables is not None:
        payload["variables"] = body.variables
    if body.tags is not None:
        payload["tags"] = body.tags
    if body.is_active is not None:
        payload["is_active"] = body.is_active

    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await asyncio.to_thread(
        lambda: (
            supabase.table("document_blocks")
            .update(payload)
            .eq("id", block_id)
            .execute()
        )
    )
    return result.data[0]


# ---------------------------------------------------------------
# Historial
# ---------------------------------------------------------------


@router.get("/generated")
async def list_generated_documents(
    organization_id: str,
    lot_id: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """
    Lista documentos generados de una organización.
    Filtra opcionalmente por lote. Ordenados por fecha descendente.
    """
    supabase = get_supabase_client()
    query = (
        supabase.table("generated_documents")
        .select(
            "id, document_type, file_url, file_format, created_at, lot_id, template_id"
        )
        .eq("organization_id", organization_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if lot_id:
        query = query.eq("lot_id", lot_id)

    result = await asyncio.to_thread(lambda: query.execute())
    return result.data or []
