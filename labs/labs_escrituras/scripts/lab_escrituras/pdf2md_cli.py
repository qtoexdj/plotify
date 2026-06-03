from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from pypdf import PdfReader


def classify_pages(page_texts: list[str]) -> tuple[str, float, list[int]]:
    if not page_texts:
        return "Unknown", 0.0, []

    pages_with_text = [index + 1 for index, text in enumerate(page_texts) if text.strip()]
    pages_needing_ocr = [index + 1 for index, text in enumerate(page_texts) if not text.strip()]

    if not pages_with_text:
        return "Scanned", 0.9, pages_needing_ocr
    if pages_needing_ocr:
        ratio = len(pages_with_text) / len(page_texts)
        return "Mixed", round(ratio, 2), pages_needing_ocr
    return "TextBased", 0.95, []


def page_to_markdown(page_number: int, text: str) -> str:
    cleaned = "\n".join(line.rstrip() for line in text.splitlines()).strip()
    if not cleaned:
        return f"<!-- Page {page_number}: no extractable text -->"
    return f"<!-- Page {page_number} -->\n\n{cleaned}"


def process_pdf(path: Path) -> dict[str, Any]:
    reader = PdfReader(str(path))
    page_texts = [(page.extract_text() or "") for page in reader.pages]
    pdf_type, confidence, pages_needing_ocr = classify_pages(page_texts)
    markdown = "\n\n".join(
        page_to_markdown(page_number, text)
        for page_number, text in enumerate(page_texts, start=1)
        if text.strip()
    )

    return {
        "pdfType": pdf_type,
        "confidence": confidence,
        "pageCount": len(page_texts),
        "pagesNeedingOcr": pages_needing_ocr,
        "hasEncodingIssues": False,
        "isComplexLayout": False,
        "markdown": markdown,
        "engine": "pypdf",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert text-based PDFs to Markdown JSON.")
    parser.add_argument("pdf_path")
    parser.add_argument("--json", action="store_true", dest="json_output")
    parser.add_argument("--raw", action="store_true")
    args = parser.parse_args()

    payload = process_pdf(Path(args.pdf_path))

    if args.raw:
        print(payload["markdown"])
        return

    if args.json_output:
        print(json.dumps(payload, ensure_ascii=False))
        return

    print(payload["markdown"])


if __name__ == "__main__":
    main()
