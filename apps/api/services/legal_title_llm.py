"""LLM client for title analysis extraction (structured output)."""

from __future__ import annotations

from typing import Any
from core.logger import get_logger
from core.config import get_settings
from schemas.legal_titles import TitleAnalysis

logger = get_logger(__name__)

TITULO_AGENT_PROMPT_V1 = """
You are a legal assistant specializing in Chilean real estate title clearance (Estudio de Títulos).
Your task is to extract a structured TitleAnalysis from the OCR page texts of title documents.
Extract owners, historical inscriptions, property identity details, and any legal alerts (DL 3516, water rights, etc.).
Ensure all facts are linked to their corresponding document page and the exact snippet of text.
"""


def _get_llm_client(provider: str, model: str, timeout: int) -> Any:
    """Retrieve ChatOpenAI or ChatAnthropic client based on provider settings."""
    settings = get_settings()
    
    # Lazy imports to prevent initialization issues
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            logger.warning("openai_api_key_missing_for_title_analysis")
            return None
        return ChatOpenAI(
            model=model,
            temperature=0.0,
            api_key=api_key,
            request_timeout=timeout,
        )
    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        api_key = settings.ANTHROPIC_API_KEY
        if not api_key:
            logger.warning("anthropic_api_key_missing_for_title_analysis")
            return None
        return ChatAnthropic(
            model=model,
            temperature=0.0,
            api_key=api_key,
            timeout=timeout,
        )
    else:
        logger.error("unsupported_title_agent_provider", provider=provider)
        return None


async def extract_title_analysis(
    text_content: str,
    provider: str | None = None,
    model: str | None = None,
    timeout: int | None = None,
) -> TitleAnalysis:
    """
    Sends document text to the LLM and parses the structured TitleAnalysis response.
    When the agent is disabled or the selected provider key is missing, returns
    an empty analysis so the orchestrator can persist/represent llm_disabled.
    """
    settings = get_settings()
    prov = provider or settings.LEGAL_TITLE_AGENT_PROVIDER
    mdl = model or settings.LEGAL_TITLE_AGENT_MODEL
    tout = timeout or settings.LEGAL_TITLE_AGENT_TIMEOUT_SECONDS
    
    logger.info("extract_title_analysis_started", provider=prov, model=mdl, text_len=len(text_content))
    
    if not settings.LEGAL_TITLE_AGENT_ENABLED:
        logger.info("extract_title_analysis_disabled_by_config")
        # Return empty structure
        return TitleAnalysis()
        
    client = _get_llm_client(prov, mdl, tout)
    if client is None:
        logger.info("extract_title_analysis_client_unavailable")
        return TitleAnalysis()

    structured_llm = client.with_structured_output(TitleAnalysis, method="json_schema")
    response = await structured_llm.ainvoke(
        [
            ("system", TITULO_AGENT_PROMPT_V1),
            ("human", text_content),
        ]
    )
    if isinstance(response, TitleAnalysis):
        return response
    if isinstance(response, dict):
        return TitleAnalysis.model_validate(response)
    raise TypeError(f"Unexpected title analysis response type: {type(response)!r}")
