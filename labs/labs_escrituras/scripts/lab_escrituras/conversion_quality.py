from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable


LEGAL_PATTERNS = [
    re.compile(pattern, re.I)
    for pattern in [
        r"\bcomparecen\b",
        r"\bcompraventa\b",
        r"\bvende\b",
        r"\bcompra\b",
        r"\bprecio\b",
        r"\bfojas\b",
        r"\binscripci[oó]n\b",
        r"\bconservador\b",
        r"\blote\b",
        r"\bdeslinda\b",
        r"\bSAG\b",
        r"\bservidumbre\b",
        r"\brepertorio\b",
        r"\bnotar[ií]a\b",
    ]
]

BOILERPLATE_PATTERNS = [
    re.compile(pattern, re.I)
    for pattern in [
        r"verifique validez",
        r"firma electr[oó]nica avanzada",
        r"certificado\s*(n[ºo°]|nro)",
        r"www\.fojas\.cl",
        r"www\.cbrchile\.cl",
        r"escanee",
        r"\bpag[:.]?\s*\d+",
        r"copia fiel",
    ]
]

USABLE_STATUSES = {"usable"}
NON_USABLE_STATUSES = {"empty", "boilerplate_only", "low_signal"}


@dataclass(frozen=True)
class PageQuality:
    page_number: int
    status: str
    word_count: int
    legal_term_hits: int
    boilerplate_hits: int
    boilerplate_ratio: float
    repeated_page_ratio: float
    score: float
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "page_number": self.page_number,
            "status": self.status,
            "word_count": self.word_count,
            "legal_term_hits": self.legal_term_hits,
            "boilerplate_hits": self.boilerplate_hits,
            "boilerplate_ratio": self.boilerplate_ratio,
            "repeated_page_ratio": self.repeated_page_ratio,
            "score": self.score,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class DocumentQuality:
    analysis_ready: bool
    reason: str
    usable_pages: list[int] = field(default_factory=list)
    low_signal_pages: list[int] = field(default_factory=list)
    page_quality: list[PageQuality] = field(default_factory=list)
    ocr_applied: bool = False

    def to_summary(self) -> dict[str, Any]:
        return {
            "analysis_ready": self.analysis_ready,
            "reason": self.reason,
            "usable_pages": self.usable_pages,
            "low_signal_pages": self.low_signal_pages,
            "ocr_applied": self.ocr_applied,
            "page_count": len(self.page_quality),
            "usable_page_count": len(self.usable_pages),
            "low_signal_page_count": len(self.low_signal_pages),
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            **self.to_summary(),
            "pages": [page.to_dict() for page in self.page_quality],
        }


def _word_count(markdown: str) -> int:
    return len(re.findall(r"\b[\wáéíóúñÁÉÍÓÚÑ]{2,}\b", markdown))


def _pattern_hits(markdown: str, patterns: list[re.Pattern[str]]) -> int:
    return sum(len(pattern.findall(markdown)) for pattern in patterns)


def _normalize_repetition_key(markdown: str) -> str:
    text = re.sub(r"<!--.*?-->", " ", markdown, flags=re.S)
    text = re.sub(r"\d+", "#", text.lower())
    text = re.sub(r"\s+", " ", text).strip()
    return text[:500]


def evaluate_page_quality(
    *,
    page_number: int,
    markdown: str,
    repeated_page_ratio: float = 0.0,
) -> PageQuality:
    words = _word_count(markdown)
    legal_hits = _pattern_hits(markdown, LEGAL_PATTERNS)
    boilerplate_hits = _pattern_hits(markdown, BOILERPLATE_PATTERNS)
    ratio_denominator = max(legal_hits + boilerplate_hits, 1)
    boilerplate_ratio = round(boilerplate_hits / ratio_denominator, 4)
    score = round((legal_hits * 8) + min(words / 30, 12) - (boilerplate_hits * 5), 4)

    if words < 5:
        status = "empty"
        reason = "empty_or_no_extractable_text"
    elif boilerplate_hits > 0 and legal_hits <= 1 and (words < 120 or boilerplate_ratio >= 0.5):
        status = "boilerplate_only"
        reason = "certification_or_validation_boilerplate"
    elif legal_hits >= 4 and words > 250:
        status = "usable"
        reason = "strong_legal_signal"
    elif words >= 120 and legal_hits >= 2 and boilerplate_ratio < 0.7:
        status = "usable"
        reason = "sufficient_legal_signal"
    else:
        status = "low_signal"
        reason = "insufficient_legal_content"

    return PageQuality(
        page_number=page_number,
        status=status,
        word_count=words,
        legal_term_hits=legal_hits,
        boilerplate_hits=boilerplate_hits,
        boilerplate_ratio=boilerplate_ratio,
        repeated_page_ratio=round(repeated_page_ratio, 4),
        score=score,
        reason=reason,
    )


def _page_number(page: Any, fallback: int) -> int:
    if isinstance(page, dict):
        return int(page.get("page_number") or fallback)
    return int(getattr(page, "page_number", fallback))


def _page_markdown(page: Any) -> str:
    if isinstance(page, dict):
        return str(page.get("markdown") or "")
    return str(getattr(page, "markdown", "") or "")


def evaluate_document_quality(pages: Iterable[Any], *, ocr_applied: bool = False) -> DocumentQuality:
    page_list = list(pages)
    total_pages = max(len(page_list), 1)
    repetition_counts: dict[str, int] = {}

    for page in page_list:
        key = _normalize_repetition_key(_page_markdown(page))
        if key:
            repetition_counts[key] = repetition_counts.get(key, 0) + 1

    page_quality = []
    for index, page in enumerate(page_list, start=1):
        markdown = _page_markdown(page)
        repetition_key = _normalize_repetition_key(markdown)
        repeated_page_ratio = repetition_counts.get(repetition_key, 1) / total_pages if repetition_key else 0
        page_quality.append(
            evaluate_page_quality(
                page_number=_page_number(page, index),
                markdown=markdown,
                repeated_page_ratio=repeated_page_ratio,
            )
        )

    usable_pages = [page.page_number for page in page_quality if page.status in USABLE_STATUSES]
    low_signal_pages = [page.page_number for page in page_quality if page.status in NON_USABLE_STATUSES]
    strong_usable = [
        page
        for page in page_quality
        if page.status == "usable" and page.legal_term_hits >= 4 and page.word_count > 250
    ]
    single_page_usable = [
        page
        for page in page_quality
        if page.status == "usable"
        and page.word_count >= 200
        and page.legal_term_hits >= 2
        and page.boilerplate_ratio < 0.7
        and page.score >= 30
    ]
    analysis_ready = len(usable_pages) >= 2 or bool(strong_usable) or bool(single_page_usable)

    if analysis_ready:
        reason = "sufficient_legal_markdown"
    elif not page_quality:
        reason = "no_pages"
    elif all(page.status == "boilerplate_only" for page in page_quality if page.word_count >= 5):
        reason = "certification_only"
    else:
        reason = "low_legal_signal"

    return DocumentQuality(
        analysis_ready=analysis_ready,
        reason=reason,
        usable_pages=usable_pages,
        low_signal_pages=low_signal_pages,
        page_quality=page_quality,
        ocr_applied=ocr_applied,
    )


def quality_by_page(quality: DocumentQuality) -> dict[int, PageQuality]:
    return {page.page_number: page for page in quality.page_quality}
