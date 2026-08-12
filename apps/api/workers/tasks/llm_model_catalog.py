"""Scheduled refresh of provider model catalogs."""

from __future__ import annotations

from services.llm_model_catalog import LLMModelCatalogService


async def sync_llm_model_catalog(ctx: dict) -> dict[str, str]:
    try:
        result = await LLMModelCatalogService().sync_all_configured()
    except Exception:
        ctx["job_outcome"] = False
        raise
    ctx["job_outcome"] = True
    return result
