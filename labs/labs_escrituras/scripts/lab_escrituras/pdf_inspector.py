from __future__ import annotations

import json
import shlex
import subprocess
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class PdfInspectionResult:
    pdf_type: str
    confidence: float
    page_count: int
    markdown: str
    pages_needing_ocr: list[int] = field(default_factory=list)
    has_encoding_issues: bool = False
    is_complex_layout: bool = False
    raw: dict = field(default_factory=dict)


def inspect_pdf(command: str, pdf_path: Path) -> PdfInspectionResult:
    command_parts = shlex.split(command)
    process = subprocess.run(
        [*command_parts, str(pdf_path), "--json"],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    payload = json.loads(process.stdout)
    pdf_type = payload.get("pdfType") or payload.get("pdf_type") or "Unknown"
    markdown = payload.get("markdown") or ""

    return PdfInspectionResult(
        pdf_type=pdf_type,
        confidence=float(payload.get("confidence") or 0),
        page_count=int(payload.get("pageCount") or payload.get("page_count") or 0),
        markdown=markdown,
        pages_needing_ocr=list(payload.get("pagesNeedingOcr") or payload.get("pages_needing_ocr") or []),
        has_encoding_issues=bool(payload.get("hasEncodingIssues") or payload.get("has_encoding_issues") or False),
        is_complex_layout=bool(payload.get("isComplexLayout") or payload.get("is_complex_layout") or False),
        raw=payload,
    )


def should_require_ocr(result: PdfInspectionResult) -> bool:
    if result.pdf_type in {"Scanned", "ImageBased", "Mixed"}:
        return True
    if result.has_encoding_issues:
        return True
    if result.pages_needing_ocr:
        return True
    return not result.markdown.strip()
