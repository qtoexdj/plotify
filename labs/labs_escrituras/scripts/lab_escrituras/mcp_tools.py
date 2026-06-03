from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from openai import OpenAI
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import LabConfig, load_config
from .db import connect
from .embeddings import vector_literal


ALLOWED_FUTURE_SOURCES = {
    "project_legal_data",
    "lots",
    "lot_records",
    "geometry",
    "manual_review",
    "future_model",
    "unknown",
}


def safe_slug(value: str, fallback: str = "document") -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-")
    return (slug or fallback)[:120]


def _fetch_document(conn: Connection, document_id: str) -> dict[str, Any]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select id, run_id, original_filename, document_type, size_bytes, sha256,
                   storage_bucket, storage_path, processing_status, detected_pdf_type,
                   detection_confidence, page_count, pages_needing_ocr, layout_metadata,
                   error_message, created_at, updated_at
            from lab_escrituras.source_documents
            where id = %s
            """,
            (document_id,),
        )
        document = cur.fetchone()
    if not document:
        raise ValueError(f"Document not found: {document_id}")
    return dict(document)


def _analysis_readiness(document: dict[str, Any]) -> dict[str, Any]:
    layout_metadata = document.get("layout_metadata") or {}
    quality_summary = layout_metadata.get("quality_summary") or {}
    ready = bool(quality_summary.get("analysis_ready"))
    reason = quality_summary.get("reason")

    if not quality_summary:
        ready = False
        reason = "quality_summary_missing"

    warning = None
    if not ready:
        warning = (
            "Document is not ready for variable/template analysis. "
            "It appears to contain low legal signal or mostly certification boilerplate; "
            "do not invent variables from this context."
        )

    return {
        "ready": ready,
        "reason": reason,
        "usable_pages": quality_summary.get("usable_pages") or [],
        "low_signal_pages": quality_summary.get("low_signal_pages") or [],
        "ocr_applied": bool(quality_summary.get("ocr_applied")),
        "warning": warning,
    }


def list_documents(status: str | None = None, limit: int = 25) -> dict[str, Any]:
    config = load_config()
    bounded_limit = min(max(limit, 1), 100)
    with connect(config) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if status:
                cur.execute(
                    """
                    select id, original_filename, document_type, processing_status,
                           detected_pdf_type, page_count, sha256, created_at, updated_at
                    from lab_escrituras.source_documents
                    where processing_status = %s
                    order by created_at desc
                    limit %s
                    """,
                    (status, bounded_limit),
                )
            else:
                cur.execute(
                    """
                    select id, original_filename, document_type, processing_status,
                           detected_pdf_type, page_count, sha256, created_at, updated_at
                    from lab_escrituras.source_documents
                    order by created_at desc
                    limit %s
                    """,
                    (bounded_limit,),
                )
            documents = [dict(row) for row in cur.fetchall()]

    return {"documents": documents, "count": len(documents)}


def _clip_text(text: str, remaining: int) -> tuple[str, int, bool]:
    if remaining <= 0:
        return "", 0, bool(text)
    if len(text) <= remaining:
        return text, remaining - len(text), False
    suffix = "\n\n[TRUNCATED: request more context with a higher max_chars or narrower offset.]"
    return text[: max(0, remaining - len(suffix))] + suffix, 0, True


def get_document_context(
    document_id: str,
    *,
    chunk_offset: int = 0,
    chunk_limit: int = 30,
    max_chars: int = 30000,
) -> dict[str, Any]:
    config = load_config()
    bounded_offset = max(chunk_offset, 0)
    bounded_limit = min(max(chunk_limit, 1), 100)
    remaining = min(max(max_chars, 2000), 120000)
    truncated = False

    with connect(config) as conn:
        document = _fetch_document(conn, document_id)
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select id, page_number, needs_ocr, has_encoding_issues, is_complex_layout,
                       metadata, created_at
                from lab_escrituras.document_pages
                where document_id = %s
                order by page_number
                """,
                (document_id,),
            )
            pages = [dict(row) for row in cur.fetchall()]

            cur.execute(
                """
                select c.id, c.chunk_index, p.page_number, c.section_label,
                       c.markdown, c.token_estimate, c.metadata, c.created_at
                from lab_escrituras.document_chunks c
                left join lab_escrituras.document_pages p on p.id = c.page_id
                where c.document_id = %s
                order by c.chunk_index
                offset %s
                limit %s
                """,
                (document_id, bounded_offset, bounded_limit),
            )
            chunks: list[dict[str, Any]] = []
            for row in cur.fetchall():
                chunk = dict(row)
                markdown, remaining, was_truncated = _clip_text(chunk["markdown"], remaining)
                chunk["markdown"] = markdown
                truncated = truncated or was_truncated
                chunks.append(chunk)

            cur.execute(
                """
                select count(*) as total_chunks
                from lab_escrituras.document_chunks
                where document_id = %s
                """,
                (document_id,),
            )
            total_chunks = cur.fetchone()["total_chunks"]

    return {
        "document": document,
        "analysis_readiness": _analysis_readiness(document),
        "pages": pages,
        "chunks": chunks,
        "chunk_offset": bounded_offset,
        "chunk_limit": bounded_limit,
        "total_chunks": total_chunks,
        "truncated": truncated,
        "analysis_guidance": get_analysis_guidance()["guidance"],
    }


def get_document_pages(document_id: str, *, max_chars: int = 50000) -> dict[str, Any]:
    config = load_config()
    remaining = min(max(max_chars, 2000), 200000)
    truncated = False
    with connect(config) as conn:
        document = _fetch_document(conn, document_id)
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select id, page_number, markdown, needs_ocr, has_encoding_issues,
                       is_complex_layout, metadata, created_at
                from lab_escrituras.document_pages
                where document_id = %s
                order by page_number
                """,
                (document_id,),
            )
            pages = []
            for row in cur.fetchall():
                page = dict(row)
                markdown, remaining, was_truncated = _clip_text(page["markdown"], remaining)
                page["markdown"] = markdown
                truncated = truncated or was_truncated
                pages.append(page)
    return {
        "document": document,
        "analysis_readiness": _analysis_readiness(document),
        "pages": pages,
        "truncated": truncated,
    }


def search_chunks(query: str, *, limit: int = 10, document_id: str | None = None) -> dict[str, Any]:
    config = load_config()
    if not config.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for semantic chunk search.")

    bounded_limit = min(max(limit, 1), 50)
    client = OpenAI(api_key=config.openai_api_key)
    response = client.embeddings.create(model=config.embedding_model, input=query)
    query_vector = vector_literal(response.data[0].embedding)

    with connect(config) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if document_id:
                cur.execute(
                    """
                    select c.id, c.document_id, d.original_filename, c.chunk_index,
                           c.section_label, c.markdown, c.token_estimate,
                           1 - (c.embedding <=> %s::extensions.vector) as similarity
                    from lab_escrituras.document_chunks c
                    join lab_escrituras.source_documents d on d.id = c.document_id
                    where c.embedding is not null
                      and c.document_id = %s
                    order by c.embedding <=> %s::extensions.vector
                    limit %s
                    """,
                    (query_vector, document_id, query_vector, bounded_limit),
                )
            else:
                cur.execute(
                    """
                    select c.id, c.document_id, d.original_filename, c.chunk_index,
                           c.section_label, c.markdown, c.token_estimate,
                           1 - (c.embedding <=> %s::extensions.vector) as similarity
                    from lab_escrituras.document_chunks c
                    join lab_escrituras.source_documents d on d.id = c.document_id
                    where c.embedding is not null
                    order by c.embedding <=> %s::extensions.vector
                    limit %s
                    """,
                    (query_vector, query_vector, bounded_limit),
                )
            results = [dict(row) for row in cur.fetchall()]

        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select count(*) as embedded_chunks
                from lab_escrituras.document_chunks
                where embedding is not null
                """
            )
            embedded_chunks = cur.fetchone()["embedded_chunks"]

    return {
        "query": query,
        "embedding_model": config.embedding_model,
        "embedded_chunks": embedded_chunks,
        "results": results,
    }


def export_document_markdown(document_id: str, *, output_subdir: str = "documents") -> dict[str, Any]:
    config = load_config()
    with connect(config) as conn:
        document = _fetch_document(conn, document_id)
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select page_number, markdown
                from lab_escrituras.document_pages
                where document_id = %s
                order by page_number
                """,
                (document_id,),
            )
            pages = [dict(row) for row in cur.fetchall()]

            cur.execute(
                """
                select chunk_index, section_label, markdown
                from lab_escrituras.document_chunks
                where document_id = %s
                order by chunk_index
                """,
                (document_id,),
            )
            chunks = [dict(row) for row in cur.fetchall()]

    base_dir = config.output_dir / safe_slug(output_subdir, "documents")
    document_dir = base_dir / f"{safe_slug(document['original_filename'])}-{document_id[:8]}"
    pages_dir = document_dir / "pages"
    chunks_dir = document_dir / "chunks"
    pages_dir.mkdir(parents=True, exist_ok=True)
    chunks_dir.mkdir(parents=True, exist_ok=True)

    for page in pages:
        (pages_dir / f"page-{page['page_number']:03}.md").write_text(page["markdown"], encoding="utf-8")

    for chunk in chunks:
        label = safe_slug(chunk["section_label"] or "chunk", "chunk")
        (chunks_dir / f"chunk-{chunk['chunk_index']:03}-{label}.md").write_text(
            chunk["markdown"], encoding="utf-8"
        )

    quality_report = _quality_report_markdown(document)
    (document_dir / "quality-report.md").write_text(quality_report, encoding="utf-8")

    return {
        "document_id": document_id,
        "output_dir": str(document_dir),
        "pages_exported": len(pages),
        "chunks_exported": len(chunks),
        "quality_report": str(document_dir / "quality-report.md"),
    }


def get_analysis_guidance() -> dict[str, Any]:
    return {
        "guidance": {
            "goal": "Analyze Chilean escritura/legal document chunks and propose canonical Plotify variables.",
            "rules": [
                "Do not invent facts that are not supported by the provided Markdown evidence.",
                "Return candidates, not approved production data.",
                "Prefer existing Plotify sources when obvious: lots, lot_records, geometry.",
                "Use manual_review or future_model when the current product data model does not clearly own the field.",
                "Keep evidence short and quote the chunk/page location in metadata when possible.",
                "Analyze only chunks whose quality_status is usable; if analysis_readiness.ready is false, do not produce variables or templates.",
            ],
            "variable_fields": [
                "canonical_variable",
                "proposed_value",
                "confidence",
                "evidence",
                "future_source",
                "source_table",
                "source_field",
                "chunk_id",
                "metadata",
            ],
            "allowed_future_sources": sorted(ALLOWED_FUTURE_SOURCES),
            "examples": [
                {
                    "canonical_variable": "matriz.dominio.fojas",
                    "future_source": "project_legal_data",
                    "source_table": "project_legal_data",
                    "source_field": "dominio_cbr_fojas",
                },
                {
                    "canonical_variable": "lote.numero",
                    "future_source": "lots",
                    "source_table": "lots",
                    "source_field": "numero_lote",
                },
                {
                    "canonical_variable": "comprador.nombre",
                    "future_source": "lot_records",
                    "source_table": "lot_records",
                    "source_field": "cliente_nombre",
                },
            ],
        }
    }


def _quality_report_markdown(document: dict[str, Any]) -> str:
    readiness = _analysis_readiness(document)
    quality_summary = (document.get("layout_metadata") or {}).get("quality_summary") or {}
    pages = quality_summary.get("pages") or []
    lines = [
        f"# Quality Report: {document.get('original_filename')}",
        "",
        f"- `document_id`: {document.get('id')}",
        f"- `processing_status`: {document.get('processing_status')}",
        f"- `analysis_ready`: {readiness['ready']}",
        f"- `reason`: {readiness['reason']}",
        f"- `ocr_applied`: {readiness['ocr_applied']}",
        f"- `usable_pages`: {readiness['usable_pages']}",
        f"- `low_signal_pages`: {readiness['low_signal_pages']}",
        "",
        "## Pages",
        "",
        "| Page | Status | Words | Legal hits | Boilerplate hits | Boilerplate ratio | Repeated ratio | Reason |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for page in pages:
        lines.append(
            "| {page} | {status} | {words} | {legal} | {boilerplate} | {ratio} | {repeated} | {reason} |".format(
                page=page.get("page_number"),
                status=page.get("status"),
                words=page.get("word_count"),
                legal=page.get("legal_term_hits"),
                boilerplate=page.get("boilerplate_hits"),
                ratio=page.get("boilerplate_ratio"),
                repeated=page.get("repeated_page_ratio"),
                reason=page.get("reason"),
            )
        )
    return "\n".join(lines) + "\n"


def _future_source(value: Any) -> str:
    if isinstance(value, str) and value in ALLOWED_FUTURE_SOURCES:
        return value
    return "manual_review"


def save_llm_analysis(
    document_id: str,
    *,
    variables: list[dict[str, Any]] | None = None,
    source_map: list[dict[str, Any]] | None = None,
    template_markdown: str | None = None,
    template_name: str = "Escritura draft LLM",
    model_name: str | None = None,
    analysis_notes: str | None = None,
    replace_existing: bool = True,
) -> dict[str, Any]:
    variables = variables or []
    source_map = source_map or []
    config = load_config()

    with connect(config) as conn:
        document = _fetch_document(conn, document_id)
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                insert into lab_escrituras.analysis_runs (
                  run_type, status, parameters, started_at, completed_at
                )
                values ('extract', 'completed', %s, now(), now())
                returning id
                """,
                (
                    Jsonb(
                        {
                            "source": "mcp",
                            "document_id": document_id,
                            "model_name": model_name,
                            "analysis_notes": analysis_notes,
                        }
                    ),
                ),
            )
            run_id = cur.fetchone()["id"]

            if replace_existing:
                cur.execute(
                    "delete from lab_escrituras.extracted_variable_candidates where document_id = %s",
                    (document_id,),
                )

            variable_ids = []
            for variable in variables:
                canonical_variable = str(variable.get("canonical_variable") or "").strip()
                if not canonical_variable:
                    continue
                cur.execute(
                    """
                    insert into lab_escrituras.extracted_variable_candidates (
                      run_id, document_id, chunk_id, canonical_variable, proposed_value,
                      confidence, evidence, future_source, source_table, source_field,
                      status, metadata
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    returning id
                    """,
                    (
                        run_id,
                        document_id,
                        variable.get("chunk_id"),
                        canonical_variable,
                        variable.get("proposed_value"),
                        float(variable.get("confidence") or 0),
                        str(variable.get("evidence") or ""),
                        _future_source(variable.get("future_source")),
                        variable.get("source_table"),
                        variable.get("source_field"),
                        variable.get("status") or "candidate",
                        Jsonb(variable.get("metadata") or {}),
                    ),
                )
                variable_ids.append(cur.fetchone()["id"])

            source_map_ids = []
            for entry in source_map:
                canonical_variable = str(entry.get("canonical_variable") or "").strip()
                if not canonical_variable:
                    continue
                cur.execute(
                    """
                    insert into lab_escrituras.source_map_entries (
                      run_id, canonical_variable, future_source, source_table, source_field,
                      rationale, status, metadata
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s)
                    returning id
                    """,
                    (
                        run_id,
                        canonical_variable,
                        _future_source(entry.get("future_source")),
                        entry.get("source_table"),
                        entry.get("source_field"),
                        str(entry.get("rationale") or ""),
                        entry.get("status") or "proposed",
                        Jsonb(entry.get("metadata") or {}),
                    ),
                )
                source_map_ids.append(cur.fetchone()["id"])

            template_id = None
            if template_markdown:
                cur.execute(
                    """
                    insert into lab_escrituras.template_candidates (
                      run_id, name, document_type, draft_markdown, variables, metadata
                    )
                    values (%s, %s, %s, %s, %s, %s)
                    returning id
                    """,
                    (
                        run_id,
                        template_name,
                        document["document_type"],
                        template_markdown,
                        Jsonb([v.get("canonical_variable") for v in variables if v.get("canonical_variable")]),
                        Jsonb({"source": "mcp", "model_name": model_name}),
                    ),
                )
                template_id = cur.fetchone()["id"]

        conn.commit()

    return {
        "run_id": str(run_id),
        "document_id": document_id,
        "variables_saved": len(variable_ids),
        "source_map_entries_saved": len(source_map_ids),
        "template_id": str(template_id) if template_id else None,
        "replace_existing": replace_existing,
    }


def resolve_output_dir(config: LabConfig | None = None) -> Path:
    return (config or load_config()).output_dir
