"""
Endpoint: invalidación de cache de skills por organización.

Llamado por el frontend tras habilitar/deshabilitar una skill
desde org_skill_configs, para que el próximo mensaje del agente
use el conjunto de tools actualizado.

M-v2-3.3
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from agent.skill_registry import invalidate_skills_cache
from api.deps import verify_internal_secret

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
