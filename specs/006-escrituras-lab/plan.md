# Implementation Plan: Laboratorio de Escrituras

**Branch**: `006-escrituras-lab` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-escrituras-lab/spec.md`

## Summary

Create a non-production Escrituras laboratory that lets super admins upload legal PDFs, DOCX, DOC, and RTF files into an isolated local Supabase lab schema/bucket, process them with Python-first tooling into Markdown/chunks, and expose the corpus through a local MCP server so external LLM agents can produce variables/source mappings/template drafts for future production document generation.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.6 in `apps/web`; Python 3.13+ for lab scripts.

**Primary Dependencies**: Supabase JS/SSR, Supabase PostgreSQL/Storage, `pgvector`, Python `psycopg`, Python MCP/FastMCP, Python `python-docx`, local macOS `textutil` for DOC/RTF conversion, optional `firecrawl/pdf-inspector` CLI/wrapper, optional OpenAI embeddings.

**Storage**: Local Supabase Docker Postgres with schema `lab_escrituras`; private bucket `lab-escrituras-documents`; ignored local `labs/labs_escrituras/output/` for exports. Lab records store `source_format` separately from legal `document_type`.

**Testing**: Web lint/typecheck/build; Python unit tests for chunking/export logic; SQL smoke test via Docker `psql` when local DB is available.

**Target Platform**: Local development environment only. Not part of production deployment.

**Project Type**: Monorepo web application plus isolated Python laboratory scripts.

**Performance Goals**: Upload/listing responsive for pilot-sized corpora; processing designed for dozens of PDFs in local development.

**Constraints**: Do not modify Docker containers, production migrations, production document templates, or production generation flow. Do not commit real documents, extracted Markdown, embeddings, or outputs. Lab web routes must remain disabled unless explicitly enabled in local/development.

**Scale/Scope**: Research/lab v1 for legal writing analysis, not production document automation.

## Constitution Check

- **Producto Piloto Primero**: PASS with containment. The lab is explicitly non-production and cannot affect the pilot runtime.
- **Geometría Espacial como Origen de Deslindes y Documentos**: PASS. The lab maps future variables to existing geometry/legal concepts but does not replace canonical geometry.
- **Supabase y Migraciones Canónicas**: PASS with documented exception. Lab SQL lives under `labs/labs_escrituras/sql` and is intentionally excluded from canonical migrations.
- **Contratos Tipados Entre Servicios**: PASS. The first UI implementation uses internal Next.js lab routes and does not change FastAPI/OpenAPI contracts.
- **Seguridad Multi-Tenant y Asignación de Vendedores**: PASS. Access is restricted to existing super-admin layout and service-role operations are lab-only.
- **Testing y Gates de Calidad Obligatorios**: PASS. Web changes require lint/typecheck/build; lab scripts include focused tests.

## Project Structure

### Documentation (this feature)

```text
specs/006-escrituras-lab/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
labs/labs_escrituras/
├── README.md
├── pyproject.toml
├── .env.example
├── .gitignore
├── docs/
├── scripts/
│   └── lab_escrituras/
│       ├── document_converter.py
│       ├── mcp_server.py
│       └── mcp_tools.py
├── sql/
└── tests/

apps/web/src/app/(super-admin)/super-admin/labs/escrituras/
└── page.tsx

apps/web/src/app/api/labs/escrituras/
├── documents/route.ts
└── upload/route.ts
```

**Structure Decision**: Keep all experimental Python/SQL/docs under `labs/labs_escrituras`; add only the minimal super-admin UI and internal API routes needed to operate the lab locally.

## Complexity Tracking

| Violation                            | Why Needed                                                | Simpler Alternative Rejected Because                                            |
| ------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Lab SQL outside canonical migrations | Lab must be removable and excluded from production deploy | Canonical migrations would make experimental schema part of production planning |

## Gap Analysis & Phase 5: Gap Mitigation

A comprehensive review of the current codebase identified several critical gaps between the active specification (`spec.md`) and the implemented features:

1. **MCP Agent Boundary Missing**: The lab needs a local MCP server so Codex, Claude, Antigravity, or another client can read chunks/pages and perform the LLM analysis externally.
2. **LLM Result Persistence Missing**: The lab needs a structured tool to save LLM-produced variables, source maps, and template drafts into `lab_escrituras`.
3. **Markdown Export Limits**: `export_reports.py` only exports candidates tables. Agents also need a way to export the source page/chunk Markdown into `output/` for VS Code review.

### Proposed Phase 5 Changes

#### [NEW] [mcp_server.py](file:///Users/matiasburgos/Developer/plotify/labs/labs_escrituras/scripts/lab_escrituras/mcp_server.py)

A local MCP/FastMCP server exposing tools for document listing, context retrieval, Markdown export, guidance, and result persistence.

#### [NEW] [mcp_tools.py](file:///Users/matiasburgos/Developer/plotify/labs/labs_escrituras/scripts/lab_escrituras/mcp_tools.py)

Database-backed helper functions used by the MCP server. These helpers do not call an LLM; they expose context and persist externally generated analysis.

#### [MODIFY] [export_reports.py](file:///Users/matiasburgos/Developer/plotify/labs/labs_escrituras/scripts/lab_escrituras/export_reports.py)

Extend the script to export the original page Markdowns into `labs/labs_escrituras/output/pages/` for easy local reading.

## Phase 6: Multi-Format Ingestion & Correctness Recovery

- Add lab-only schema support for `source_format` and accepted storage MIME types for PDF, DOCX, DOC, and RTF.
- Rework upload validation so unsupported files are rejected before any analysis run, storage object, or source document row is created.
- Route all supported formats through one Python conversion boundary: PDF pages remain physical pages; DOCX/DOC/RTF become logical Markdown pages.
- Keep embeddings as an explicit follow-up over `document_chunks`; do not auto-vectorize uploads.
- Add local-only runtime guard for the super-admin lab page and internal lab routes.
- Restore global API proxy behavior so unrelated API routes still receive session refresh handling.
