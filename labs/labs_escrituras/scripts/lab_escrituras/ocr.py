from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

import pypdfium2 as pdfium
import pytesseract


def normalize_pages(pages: Iterable[int] | None, page_count: int) -> list[int]:
    if not pages:
        return list(range(1, page_count + 1))
    return sorted({page for page in pages if 1 <= page <= page_count})


def ocr_pdf_pages(pdf_path: Path, *, pages: Iterable[int] | None, language: str, dpi: int) -> str:
    document = pdfium.PdfDocument(str(pdf_path))
    page_numbers = normalize_pages(pages, len(document))
    rendered_markdown: list[str] = []
    scale = dpi / 72

    for page_number in page_numbers:
        page = document[page_number - 1]
        image = page.render(scale=scale).to_pil()
        text = pytesseract.image_to_string(image, lang=language).strip()
        rendered_markdown.append(f"<!-- Page {page_number} OCR -->\n\n{text}")

    document.close()
    return "\n\n".join(rendered_markdown).strip()
