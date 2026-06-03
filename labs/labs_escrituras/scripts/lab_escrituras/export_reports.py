from __future__ import annotations

from .config import load_config
from .db import connect
from .mcp_tools import _quality_report_markdown, safe_slug


def write_markdown_file(path, title: str, rows: list[dict]) -> None:
    lines = [f"# {title}", ""]
    for row in rows:
        lines.append(f"## {row.get('canonical_variable') or row.get('name') or row.get('original_filename')}")
        for key, value in row.items():
            lines.append(f"- `{key}`: {value}")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def export_document_markdown_pages(output_dir, documents: list[dict], pages: list[dict], chunks: list[dict]) -> None:
    documents_dir = output_dir / "documents"
    for document in documents:
        document_dir = documents_dir / f"{safe_slug(document['original_filename'])}-{str(document['id'])[:8]}"
        pages_dir = document_dir / "pages"
        chunks_dir = document_dir / "chunks"
        pages_dir.mkdir(parents=True, exist_ok=True)
        chunks_dir.mkdir(parents=True, exist_ok=True)

        for page in [page for page in pages if page["document_id"] == document["id"]]:
            (pages_dir / f"page-{page['page_number']:03}.md").write_text(
                page["markdown"],
                encoding="utf-8",
            )

        for chunk in [chunk for chunk in chunks if chunk["document_id"] == document["id"]]:
            label = safe_slug(chunk["section_label"] or "chunk", "chunk")
            (chunks_dir / f"chunk-{chunk['chunk_index']:03}-{label}.md").write_text(
                chunk["markdown"],
                encoding="utf-8",
            )

        (document_dir / "quality-report.md").write_text(
            _quality_report_markdown(document),
            encoding="utf-8",
        )


def main() -> None:
    config = load_config()
    config.output_dir.mkdir(parents=True, exist_ok=True)

    with connect(config) as conn:
        with conn.cursor() as cur:
            cur.execute("select * from lab_escrituras.extracted_variable_candidates order by created_at desc")
            variables = list(cur.fetchall())
            cur.execute("select * from lab_escrituras.source_map_entries order by created_at desc")
            source_map = list(cur.fetchall())
            cur.execute("select * from lab_escrituras.template_candidates order by created_at desc")
            templates = list(cur.fetchall())
            cur.execute(
                """
                select id, original_filename, processing_status, layout_metadata
                from lab_escrituras.source_documents
                where processing_status in ('processed', 'needs_ocr', 'low_quality_extraction')
                order by created_at desc
                """
            )
            documents = list(cur.fetchall())
            cur.execute(
                """
                select document_id, page_number, markdown
                from lab_escrituras.document_pages
                order by document_id, page_number
                """
            )
            pages = list(cur.fetchall())
            cur.execute(
                """
                select document_id, chunk_index, section_label, markdown
                from lab_escrituras.document_chunks
                order by document_id, chunk_index
                """
            )
            chunks = list(cur.fetchall())

    write_markdown_file(config.output_dir / "variables-catalog.md", "Variables Catalog", variables)
    write_markdown_file(config.output_dir / "source-map.md", "Source Map", source_map)
    write_markdown_file(config.output_dir / "template-draft.md", "Template Drafts", templates)
    export_document_markdown_pages(config.output_dir, documents, pages, chunks)


if __name__ == "__main__":
    main()
