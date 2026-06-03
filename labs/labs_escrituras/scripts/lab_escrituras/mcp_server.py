from __future__ import annotations

import os
from typing import Any

from mcp.server.fastmcp import FastMCP

from .mcp_tools import (
    export_document_markdown,
    get_analysis_guidance,
    get_document_context,
    get_document_pages,
    list_documents,
    save_llm_analysis,
    search_chunks,
)


def create_server() -> FastMCP:
    mcp = FastMCP(
        "plotify-escrituras-lab",
        instructions=(
            "Local-only MCP server for Plotify's Escrituras laboratory. "
            "Use it to read processed legal PDF Markdown/chunks, export Markdown for local review, "
            "and persist LLM-produced variable/source-map/template analysis. "
            "The server does not call an LLM; the connected agent/model performs the reasoning."
        ),
        host=os.getenv("LAB_MCP_HOST", "127.0.0.1"),
        port=int(os.getenv("LAB_MCP_PORT", "8765")),
    )

    @mcp.tool()
    def list_lab_documents(status: str | None = None, limit: int = 25) -> dict[str, Any]:
        """List processed or pending documents available in the local Escrituras lab."""
        return list_documents(status=status, limit=limit)

    @mcp.tool()
    def get_lab_document_context(
        document_id: str,
        chunk_offset: int = 0,
        chunk_limit: int = 30,
        max_chars: int = 30000,
    ) -> dict[str, Any]:
        """Return document metadata, chunk Markdown, and analysis guidance for LLM review."""
        return get_document_context(
            document_id,
            chunk_offset=chunk_offset,
            chunk_limit=chunk_limit,
            max_chars=max_chars,
        )

    @mcp.tool()
    def get_lab_document_pages(document_id: str, max_chars: int = 50000) -> dict[str, Any]:
        """Return full page-level Markdown for a processed document."""
        return get_document_pages(document_id, max_chars=max_chars)

    @mcp.tool()
    def search_lab_chunks(
        query: str,
        limit: int = 10,
        document_id: str | None = None,
    ) -> dict[str, Any]:
        """Search embedded lab chunks by semantic similarity."""
        return search_chunks(query, limit=limit, document_id=document_id)

    @mcp.tool()
    def export_lab_document_markdown(
        document_id: str,
        output_subdir: str = "documents",
    ) -> dict[str, Any]:
        """Export page and chunk Markdown to labs/labs_escrituras/output for VS Code review."""
        return export_document_markdown(document_id, output_subdir=output_subdir)

    @mcp.tool()
    def get_escrituras_analysis_guidance() -> dict[str, Any]:
        """Return the expected LLM analysis schema and Plotify source mapping rules."""
        return get_analysis_guidance()

    @mcp.tool()
    def save_escrituras_llm_analysis(
        document_id: str,
        variables: list[dict[str, Any]] | None = None,
        source_map: list[dict[str, Any]] | None = None,
        template_markdown: str | None = None,
        template_name: str = "Escritura draft LLM",
        model_name: str | None = None,
        analysis_notes: str | None = None,
        replace_existing: bool = True,
    ) -> dict[str, Any]:
        """Persist LLM-produced variables, source mappings, and optional template draft."""
        return save_llm_analysis(
            document_id,
            variables=variables,
            source_map=source_map,
            template_markdown=template_markdown,
            template_name=template_name,
            model_name=model_name,
            analysis_notes=analysis_notes,
            replace_existing=replace_existing,
        )

    return mcp


def main() -> None:
    transport = os.getenv("LAB_MCP_TRANSPORT", "stdio")
    create_server().run(transport=transport)


if __name__ == "__main__":
    main()
