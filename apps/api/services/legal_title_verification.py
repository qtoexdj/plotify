"""Deterministic verifier for title analysis facts and evidence."""

from __future__ import annotations

import re
import unicodedata
from typing import Any
from core.logger import get_logger
from schemas.legal_titles import TitleAnalysis, EvidencedValue

logger = get_logger(__name__)


def normalize_text(text: str | None) -> str:
    """
    Remove extra whitespace, lowercase, and remove accents from text
    for robust comparison.
    """
    if text is None:
        return ""
    # Normalizar caracteres unicode, remover acentos
    text_normalized = unicodedata.normalize("NFKD", text)
    text_no_accents = "".join(c for c in text_normalized if not unicodedata.combining(c))
    
    # Reemplazar múltiples espacios/saltos de línea por un espacio único y limpiar extremos
    text_clean = re.sub(r"\s+", " ", text_no_accents)
    return text_clean.strip().lower()


def check_snippet_match(page_text: str | None, snippet: str | None) -> bool:
    """Verify if the normalized snippet is a literal substring of the normalized page text."""
    if not snippet or not page_text:
        return False
    
    norm_page = normalize_text(page_text)
    norm_snippet = normalize_text(snippet)
    
    return norm_snippet in norm_page


def verify_evidenced_value(
    value: str | None,
    snippet: str | None,
    page_text: str | None
) -> bool:
    """
    Runs deterministic verification checks:
    1. Snippet must exist literally within page text (after normalization).
    2. Value or its semantic equivalent must be derivable from the snippet.
    """
    logger.info("verify_evidenced_value_skeleton", value=value)
    
    # Check 1: Snippet match
    if not check_snippet_match(page_text, snippet):
        return False
        
    # Check 2: Value consistency (in skeleton mode, we check substring or return true for now)
    # In US2 (T024), we will implement detailed checks (numbers-to-words, dates, names etc.)
    if value is not None:
        norm_val = normalize_text(value)
        norm_snip = normalize_text(snippet)
        # Simple heuristic check for skeleton: does value exist or parts of it exist in snippet?
        # For dates/names this is a good baseline, otherwise we return True for skeleton verification
        return True
        
    return True


async def verify_title_analysis(
    analysis: TitleAnalysis,
    pages_by_doc: dict[str, dict[int, str]],  # mapping: doc_id -> { page_num -> page_text }
) -> dict[str, Any]:
    """
    Recursively processes all EvidencedValue objects in TitleAnalysis,
    updates their 'verified' field, and generates verification_stats.
    """
    logger.info("verify_title_analysis_skeleton")
    
    verified_count = 0
    unverified_count = 0
    failures = []
    
    # Recursively traverse and verify EvidencedValues
    # (Detailed traversal will be implemented in US2)
    
    # Return verification stats matching the spec contract
    return {
        "verified_count": verified_count,
        "unverified_count": unverified_count,
        "failures": failures
    }
