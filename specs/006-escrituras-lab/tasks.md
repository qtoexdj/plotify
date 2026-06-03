# Tasks: Laboratorio de Escrituras

**Input**: Design documents from `/specs/006-escrituras-lab/`

## Phase 1: Lab Foundations

- [x] T001 Create SDD spec/plan/tasks for the isolated Escrituras laboratory.
- [x] T002 Create `labs/labs_escrituras` structure with README, env template, gitignore, docs, scripts, SQL, and tests.
- [x] T003 Add bootstrap/reset/sample SQL for `lab_escrituras`, `vector`, and `lab-escrituras-documents`.

## Phase 2: Lab Processing

- [x] T004 Add Python lab package with pending-document processing, chunking, report export, and tests.
- [x] T005 Document `firecrawl/pdf-inspector` wrapper expectations and OCR/fallback behavior.

## Phase 3: Super Admin Operation

- [x] T006 Add super-admin navigation entry and `super-admin/labs/escrituras` page.
- [x] T007 Add internal Next.js lab upload/list routes with PDF validation and lab storage registration.
- [x] T008 Ensure real PDFs, extracted Markdown, embeddings, and lab outputs are ignored by Git.

## Phase 4: Verification

- [x] T009 Run web lint/typecheck/build gates.
- [x] T010 Run Python lab tests.
- [x] T011 Optionally apply bootstrap SQL locally with `docker exec supabase-db psql` and smoke-test upload.

## Phase 5: MCP Agent Integration

- [x] T012 Create local MCP server for external LLM agents (`scripts/lab_escrituras/mcp_server.py`).
- [x] T013 Expose MCP tools to list documents, fetch chunks/pages, export Markdown to `output/`, and return analysis guidance.
- [x] T014 Expose MCP tool to persist LLM-produced variables, source map entries, and template drafts.
- [x] T015 Update `export_reports.py` to also export original document page Markdowns.

## Phase 6: Multi-Format Ingestion & Correctness Recovery

- [x] T016 Update SDD and AGENTS authority for `specs/006-escrituras-lab`; Acceptance: AGENTS, spec, plan, and tasks describe PDF/DOCX/DOC/RTF scope and current feature authority; Verify: `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
- [x] T017 Add lab-only schema/storage support for `source_format` and PDF/DOCX/DOC/RTF MIME types in `labs/labs_escrituras/sql`; Acceptance: bootstrap/reset remain isolated from canonical migrations; Verify: `pnpm verify:migrations`
- [x] T018 Harden upload validation in `apps/web/src/app/api/labs/escrituras/upload/route.ts`; Acceptance: invalid files create no run, document, or storage object; supported files preserve extension, content type, hash, and source format; Verify: `pnpm test:web`
- [x] T019 Add local-only lab runtime guard for page and API routes; Acceptance: lab is disabled outside local/development unless `PLOTIFY_ENABLE_ESCRITURAS_LAB=true`; Verify: `pnpm build:web`
- [x] T020 Restore global API proxy session behavior in `apps/web/src/proxy.ts`; Acceptance: `/api` is no longer globally excluded from `updateSession`; Verify: `pnpm test:web`
- [x] T021 Add Python document conversion boundary in `labs/labs_escrituras/scripts/lab_escrituras/document_converter.py`; Acceptance: PDF pages, DOCX content, and DOC/RTF textutil fallback convert to Markdown pages; Verify: `apps/api/venv/bin/python -m pytest labs/labs_escrituras/tests`
- [x] T022 Rework `process_pending.py` to use source-format conversion and persist page-level Markdown/chunks; Acceptance: every supported processed document produces chunks embeddable by the existing embedding job; Verify: `apps/api/venv/bin/python -m pytest labs/labs_escrituras/tests`
- [x] T023 Update lab UI copy and accepted file input formats; Acceptance: super-admin UI says legal documents and accepts `.pdf,.doc,.docx,.rtf`; Verify: `pnpm test:web`
- [x] T024 Add conversion/upload/local-guard regression tests; Acceptance: tests cover invalid upload no persistence, supported formats, multi-page PDF, DOCX, DOC/RTF fallback, and textutil missing failure; Verify: `apps/api/venv/bin/python -m pytest labs/labs_escrituras/tests && pnpm test:web`
- [x] T025 Final quality gate for multi-format lab; Acceptance: all code and SDD changes pass project gates and ignored lab outputs stay ignored; Verify: `codegraph sync . && pnpm --filter web lint && pnpm format:check && pnpm typecheck:web && pnpm test:web && pnpm build:web && pnpm verify:migrations`
