from fastapi import APIRouter
from .endpoints import (
    health,
    webhook,
    approvals,
    users,
    bots,
    prompts,
    skills,
    documents,
    legal_variables,
    legal_titles,
    escritura_templates,
    escritura_matrices,
    integrations,
    notifications,
)

api_router = APIRouter()

# Incluir los distintos módulos de la API v1
api_router.include_router(health.router, tags=["health"])
api_router.include_router(webhook.router, prefix="/webhook", tags=["webhooks"])
api_router.include_router(approvals.router, prefix="/approvals", tags=["approvals"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(bots.router, prefix="/bots", tags=["bots"])
api_router.include_router(prompts.router)
api_router.include_router(skills.router)
api_router.include_router(documents.router)
api_router.include_router(legal_variables.router)
api_router.include_router(legal_titles.router)
api_router.include_router(escritura_templates.router)
api_router.include_router(escritura_matrices.router)
api_router.include_router(integrations.router)  # ← Fase 5
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
