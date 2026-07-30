"""Scheduled refresh of provider model catalogs."""

from __future__ import annotations

from services.llm_model_catalog import LLMModelCatalogService


async def sync_llm_model_catalog(_ctx: dict) -> dict[str, str]:
    return await LLMModelCatalogService().sync_all_configured()
