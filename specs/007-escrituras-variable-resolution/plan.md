# Implementation Plan: Escrituras Variable Resolution

**Branch**: `007-escrituras-variable-resolution` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-escrituras-variable-resolution/spec.md`

## Summary

Build the production foundation for escritura de compraventa variables: register legal source documents from onboarding/project uploads, extract text in background, propose canonical variables with evidence, let users review/correct them in a Centro de Control Legal, match SII roles to lots, and expose sold-lot readiness before future DOCX minuta generation. The lab remains an input for extraction patterns, but production state must live in canonical Supabase migrations, typed FastAPI contracts and audited tenant-scoped records.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.6 in `apps/web`; Python 3.13+ in `apps/api`.

**Primary Dependencies**: Supabase JS/SSR, Supabase PostgreSQL/Storage, FastAPI 0.135.1, Pydantic 2.12.5, arq/Redis worker runtime, python-docx, Jinja2, existing lab converter references, optional OpenAI/LangChain extraction support with schema validation. ProseKit and dnd-kit are already installed for later minuta-builder phases and are not the MVP surface of this feature.

**Storage**: Supabase PostgreSQL via `packages/database/supabase/migrations`; `project-files` bucket for uploaded project/legal documents; `documents` bucket remains for generated output. New production rows store legal documents, ingestion jobs, extracted text/evidence, variable resolutions, lot legal data, escritura cases and legal review decisions.

**Testing**: `pnpm verify:migrations`, `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web`, `pnpm format:check`, `pnpm build:web`, and targeted Vitest/Pytest files listed in `tasks.md`.

**Target Platform**: Plotify monorepo production web app and FastAPI worker/API service.

**Project Type**: Web application with typed internal API, Supabase database and background processing.

**Performance Goals**: Onboarding must not block on extraction. Upload response remains file-size bound only; extraction status should be visible asynchronously. Variable inventory for a project should load under 2 seconds for pilot-sized projects and tens of legal documents.

**Constraints**: Do not use the lab schema/MCP as production runtime. Do not generate final notary/CBR artifacts. Do not approve legal variables automatically when confidence/evidence is missing. All service-role or internal-secret flows must infer/validate tenant ownership. All API contract changes originate in FastAPI/Pydantic and regenerate contracts.

**Scale/Scope**: Pilot projects with dozens to hundreds of lots, multiple legal source documents per project and one escritura case per sold lot.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Producto Piloto Primero**: PASS. The feature strengthens the pilot core by making escritura readiness explicit before generation.
- **Geometria Espacial como Origen de Deslindes y Documentos**: PASS. Existing geometry/deslinde readiness stays authoritative and becomes a required gate.
- **Supabase y Migraciones Canonicas**: PASS. New schema work belongs only in `packages/database/supabase/migrations`.
- **Contratos Tipados Entre Servicios**: PASS. FastAPI/Pydantic remains the source of API contracts; frontend consumes generated types where contracts change.
- **Seguridad Multi-Tenant y Asignacion de Vendedores**: PASS. All new records are tenant scoped by organization/project/lot and must validate ownership.
- **Testing y Gates de Calidad Obligatorios**: PASS. Tasks include migration, API, frontend, contract and build gates.

## Project Structure

### Documentation (this feature)

```text
specs/007-escrituras-variable-resolution/
├── spec.md
├── plan.md
├── agent-execution.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-contracts.md
│   └── ui-contracts.md
├── handoff-sdd-008.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/api/
├── api/v1/endpoints/
│   ├── documents.py
│   └── legal_variables.py
├── schemas/
│   └── legal_variables.py
├── services/
│   ├── legal_document_ingestion.py
│   ├── legal_text_extraction.py
│   ├── legal_variable_catalog.py
│   ├── legal_variable_resolution.py
│   ├── legal_role_matching.py
│   └── escritura_readiness.py
├── workers/
│   ├── main_worker.py
│   └── tasks/legal_document_ingestion.py
└── tests/
    ├── test_escrituras_ingestion.py
    ├── test_escrituras_variable_resolution.py
    ├── test_escrituras_role_matching.py
    └── test_escrituras_readiness.py

apps/web/src/
├── app/api/projects/[id]/
│   ├── legal-documents/route.ts
│   ├── legal-variables/route.ts
│   └── escritura-readiness/route.ts
├── app/api/uploads/project-files/route.ts
├── app/api/projects/route.ts
├── components/projects/detail/
│   ├── documents-tab.tsx
│   ├── legal-tab.tsx
│   └── legal-control-center.tsx
├── components/projects/legal/
│   ├── legal-document-status-panel.tsx
│   ├── legal-variable-table.tsx
│   ├── legal-variable-editor.tsx
│   ├── legal-evidence-viewer.tsx
│   └── escritura-readiness-panel.tsx
└── lib/legal/
    ├── variable-resolution-types.ts
    ├── variable-resolution-client.ts
    └── escritura-readiness.ts

packages/database/supabase/migrations/
└── 20260603000100_escrituras_variable_resolution.sql
```

**Structure Decision**: Keep production extraction/readiness under existing `apps/api`, `apps/web` and canonical database packages. Reuse the lab only as a reference for converters/extractors; do not depend on lab paths at runtime.

## Phase Plan

### Agent Execution Protocol

SDD 007 uses GitHub Spec Kit as the artifact workflow (`specify -> plan -> tasks -> implement`) and adds a Plotify-specific execution protocol for agents/subagents in [agent-execution.md](./agent-execution.md). That protocol defines required context, roles, task-size limits, parallelization constraints, handoff format, review gates and stop conditions before implementation starts.

### Phase 0 - Research and Source Alignment

- Confirm current upload/document/generation flow through CodeGraph.
- Confirm the variable catalog against Obsidian and lab analysis.
- Confirm SDD workflow and external library status through Context7/installed packages.
- Output: [research.md](./research.md).

### Phase 1 - Data Model and Contracts

- Design tenant-scoped production tables for documents, extraction, evidence, variable resolution, lot legal data and escritura cases.
- Define typed API contracts and UI states.
- Output: [data-model.md](./data-model.md), [contracts/api-contracts.md](./contracts/api-contracts.md), [contracts/ui-contracts.md](./contracts/ui-contracts.md), [quickstart.md](./quickstart.md).

### Phase 2 - Foundational Runtime

- Create migrations/RLS/types.
- Add FastAPI schemas/services and worker task boundaries.
- Add variable catalog and evidence state machine.
- No UI polish in this phase; only foundations required by all stories.

### Phase 3 - Document Registration and Ingestion

- Connect onboarding/project document uploads to `legal_documents`.
- Trigger extraction jobs asynchronously.
- Surface document status without requiring onboarding review.

### Phase 4 - Variable Extraction and Evidence

- Implement domain/SII/SAG/plano extraction contracts.
- Persist variable proposals and evidence.
- Add conflict and missing classification.

### Phase 5 - Centro de Control Legal

- Add project-level variable inventory UI.
- Allow correction/approval with audit.
- Show source evidence and readiness gaps.

### Phase 6 - Roles, Lot Readiness and Escritura Cases

- Match roles/pre-roles to lots.
- Treat `Rol de avaluo en tramite` as valid when backed by SII evidence or legal override.
- Create sold-lot escritura readiness and snapshot gates.

### Phase 7 - Polish and Guardrails

- Add legal warnings, audit hardening, performance checks, contract regeneration and full quality gates.

### Phase 8 - Production Readiness and SDD 008 Handoff

- Lock the SDD 007 output contract for the future matriz builder.
- Verify feature flags, rollout controls, retry/idempotency, observability, retention and tenant regression coverage.
- Ensure the next feature consumes `escritura_cases.variable_snapshot`, `escritura_cases.evidence_snapshot`, canonical variable keys and readiness gates instead of raw OCR or live extraction proposals.
- Output: [handoff-sdd-008.md](./handoff-sdd-008.md).

## SDD 008 Handoff Contract

SDD 008 should be scoped as the **Creador de Matriz y Minuta DOCX**. It starts only after SDD 007 provides:

1. Canonical variable catalog and states.
2. Reviewed or approved variable resolutions.
3. Lot-level SII role data, including valid `rol_en_tramite`.
4. Escritura case readiness gates.
5. Immutable `variable_snapshot` and `evidence_snapshot` per sold-lot case.
6. Legal warning and lawyer/redactor workflow gate.

SDD 008 should consume snapshots and build the interface for:

- A new professional matriz builder interface, not a continuation of the current MVP editor.
- Versioned clause/block management for the minuta.
- ProseKit-based legal text editing with structured variable tokens.
- dnd-kit ordering for movable clauses and blocks, with explicit persisted ordering.
- Variable insertion from the approved snapshot.
- Evidence-aware preview modes.
- DOCX generation from a reviewed snapshot, not live extraction records.

SDD 008 must not reopen OCR/extraction ownership. If a variable is wrong, the user returns to SDD 007's Centro de Control Legal, corrects the variable, and regenerates a new escritura case snapshot.

Variable visualization and correction remains in SDD 007 because it is part of extraction quality, evidence and approval. SDD 008 can display variable state and evidence while editing the matriz, but it consumes snapshots and should not become the correction source of truth.

## Production Readiness Gates

Before SDD 007 can be considered production-ready:

- Database migrations and RLS must pass `pnpm verify:migrations`.
- FastAPI contracts must be regenerated with `pnpm contracts:generate`.
- API tests must cover tenant isolation, retries, idempotency and failed extraction handling.
- Web tests must cover onboarding non-blocking behavior, Centro de Control Legal and readiness warning.
- Background jobs must be retryable and idempotent per document version.
- Legal document storage access must avoid exposing raw internal paths.
- Variable corrections and legal review decisions must be auditable.
- Extraction failures must be visible, retryable and non-destructive.
- Feature rollout must be flaggable so the pilot can enable the flow per organization/project.
- Operational docs must define how to retry failed jobs, supersede documents, rollback a document version and inspect evidence.

## Complexity Tracking

No constitution violation is required. The complexity is justified by legal traceability: variables, evidence, review decisions and lot-level role matching cannot be represented safely by the existing single `project_legal_data` row alone.
