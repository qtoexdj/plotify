from __future__ import annotations

import tempfile
from dataclasses import replace
from pathlib import Path

from psycopg.types.json import Jsonb
from supabase import create_client

from .chunking import chunk_markdown
from .config import load_config
from .conversion_quality import (
    DocumentQuality,
    evaluate_document_quality,
    evaluate_page_quality,
    quality_by_page,
)
from .db import (
    connect,
    ensure_lab_schema_current,
    fetch_pending_documents,
    mark_document_status,
    reset_interrupted_processing_documents,
)
from .document_converter import ConvertedDocument, ConvertedPage, convert_document
from .ocr import ocr_pdf_pages


def download_source_document(config, bucket: str, storage_path: str, target_path: Path) -> None:
    if not config.supabase_url or not config.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to download lab documents")

    client = create_client(config.supabase_url, config.supabase_service_role_key)
    data = client.storage.from_(bucket).download(storage_path)
    target_path.write_bytes(data)


def _metadata_with_quality(page: ConvertedPage, quality) -> dict:
    metadata = dict(page.metadata)
    if quality:
        metadata["quality"] = quality.to_dict()
    return metadata


def _attempt_quality_ocr(config, document_path: Path, converted: ConvertedDocument, quality: DocumentQuality):
    if converted.source_format != "pdf" or not config.ocr_enabled or not quality.low_signal_pages:
        return converted, quality

    quality_lookup = quality_by_page(quality)
    low_signal_pages = set(quality.low_signal_pages)
    updated_pages: list[ConvertedPage] = []
    replaced_pages: list[int] = []

    for page in converted.pages:
        if page.page_number not in low_signal_pages:
            updated_pages.append(page)
            continue

        ocr_markdown = ocr_pdf_pages(
            document_path,
            pages=[page.page_number],
            language=config.ocr_language,
            dpi=config.ocr_dpi,
        )
        if not ocr_markdown:
            updated_pages.append(page)
            continue

        candidate_markdown = f"{page.markdown}\n\n## OCR fallback\n\n{ocr_markdown}".strip()
        previous_quality = quality_lookup.get(page.page_number)
        candidate_quality = evaluate_page_quality(
            page_number=page.page_number,
            markdown=candidate_markdown,
            repeated_page_ratio=previous_quality.repeated_page_ratio if previous_quality else 0,
        )
        previous_score = previous_quality.score if previous_quality else 0

        if candidate_quality.status == "usable" or candidate_quality.score > previous_score + 4:
            replaced_pages.append(page.page_number)
            updated_pages.append(
                replace(
                    page,
                    markdown=candidate_markdown,
                    needs_ocr=False,
                    metadata={
                        **page.metadata,
                        "ocrApplied": True,
                        "ocrReason": "quality_gate_low_signal",
                        "ocrLanguage": config.ocr_language,
                        "ocrDpi": config.ocr_dpi,
                    },
                )
            )
        else:
            updated_pages.append(page)

    if not replaced_pages:
        return converted, evaluate_document_quality(updated_pages, ocr_applied=True)

    raw = {
        **converted.raw,
        "qualityGateOcrApplied": True,
        "qualityGateOcrPages": replaced_pages,
        "ocrLanguage": config.ocr_language,
        "ocrDpi": config.ocr_dpi,
    }
    updated = replace(
        converted,
        detected_type=converted.detected_type
        if converted.detected_type.endswith("+OCR")
        else f"{converted.detected_type}+OCR",
        pages=updated_pages,
        pages_needing_ocr=[
            page for page in converted.pages_needing_ocr if page not in set(replaced_pages)
        ],
        raw=raw,
    )
    return updated, evaluate_document_quality(updated_pages, ocr_applied=True)


def persist_converted_document(
    conn,
    document: dict,
    converted: ConvertedDocument,
    quality: DocumentQuality | None = None,
) -> None:
    document_id = document["id"]
    quality_lookup = quality_by_page(quality) if quality else {}
    usable_pages = set(quality.usable_pages) if quality else None
    with conn.cursor() as cur:
        cur.execute("delete from lab_escrituras.document_chunks where document_id = %s", (document_id,))
        cur.execute("delete from lab_escrituras.document_pages where document_id = %s", (document_id,))

        chunk_index = 0
        for page in converted.pages:
            cur.execute(
                """
                insert into lab_escrituras.document_pages (
                  document_id, page_number, markdown, needs_ocr, has_encoding_issues,
                  is_complex_layout, metadata
                )
                values (%s, %s, %s, %s, %s, %s, %s)
                returning id
                """,
                (
                    document_id,
                    page.page_number,
                    page.markdown,
                    page.needs_ocr,
                    page.has_encoding_issues,
                    page.is_complex_layout,
                    Jsonb(_metadata_with_quality(page, quality_lookup.get(page.page_number))),
                ),
            )
            page_id = cur.fetchone()["id"]

            if usable_pages is not None and page.page_number not in usable_pages:
                continue

            for chunk in chunk_markdown(page.markdown):
                cur.execute(
                    """
                    insert into lab_escrituras.document_chunks (
                      document_id, page_id, chunk_index, section_label, markdown, token_estimate, metadata
                    )
                    values (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        document_id,
                        page_id,
                        chunk_index,
                        chunk.section_label,
                        chunk.markdown,
                        chunk.token_estimate,
                        Jsonb(
                            {
                                "source": converted.source_format,
                                "page_number": page.page_number,
                                "page_chunk_index": chunk.index,
                                "quality_status": quality_lookup.get(page.page_number).status
                                if page.page_number in quality_lookup
                                else "unknown",
                            }
                        ),
                    ),
                )
                chunk_index += 1

        if quality and not quality.analysis_ready:
            processing_status = "low_quality_extraction"
        elif converted.pages_needing_ocr or any(page.needs_ocr for page in converted.pages):
            processing_status = "needs_ocr"
        else:
            processing_status = "processed"

        layout_metadata = dict(converted.raw)
        if quality:
            layout_metadata["quality_summary"] = quality.to_dict()

        cur.execute(
            """
            update lab_escrituras.source_documents
            set detected_pdf_type = %s,
                detection_confidence = %s,
                page_count = %s,
                pages_needing_ocr = %s,
                layout_metadata = %s,
                processing_status = %s,
                updated_at = now()
            where id = %s
            """,
            (
                converted.detected_type,
                converted.confidence,
                converted.page_count,
                converted.pages_needing_ocr,
                Jsonb(layout_metadata),
                processing_status,
                document_id,
            ),
        )


def _source_format(document: dict) -> str:
    if document.get("source_format"):
        return str(document["source_format"])
    storage_path = str(document.get("storage_path") or "")
    suffix = Path(storage_path).suffix.lower().lstrip(".")
    if suffix in {"pdf", "docx", "doc", "rtf"}:
        return suffix
    return "pdf"


def _target_path(tmp: str, source_format: str) -> Path:
    return Path(tmp) / f"document.{source_format}"


def main() -> None:
    config = load_config()
    processed_count = 0
    recovered_count = 0
    with connect(config) as conn:
        ensure_lab_schema_current(conn)
        recovered_count = reset_interrupted_processing_documents(conn)
        conn.commit()

        while True:
            documents = fetch_pending_documents(conn)
            if not documents:
                break

            for document in documents:
                mark_document_status(conn, document["id"], "processing")
                conn.commit()
                try:
                    with tempfile.TemporaryDirectory() as tmp:
                        source_format = _source_format(document)
                        document_path = _target_path(tmp, source_format)
                        download_source_document(
                            config,
                            document["storage_bucket"],
                            document["storage_path"],
                            document_path,
                        )
                        converted = convert_document(config, document_path, source_format)
                        quality = evaluate_document_quality(converted.pages)
                        converted, quality = _attempt_quality_ocr(config, document_path, converted, quality)
                        persist_converted_document(conn, document, converted, quality)
                        conn.commit()
                        processed_count += 1
                except Exception as exc:
                    conn.rollback()
                    mark_document_status(conn, document["id"], "failed", error_message=str(exc))
                    conn.commit()
                    raise

    print({"processed_count": processed_count, "recovered_processing_count": recovered_count})


if __name__ == "__main__":
    main()
