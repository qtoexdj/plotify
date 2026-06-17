# Implementation Plan: Resolucion de Titulo de Dominio Vigente con Agente

**Branch**: `009-titulo-dominio-vigente` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-titulo-dominio-vigente/spec.md`

## Summary

Replace the regex-based dominio vigente extractor with a project-scoped title
analysis pipeline: an LLM agent reads all active title documents (dominio
vigente, personeria, hipoteca/gravamen), reconstructs the acquisition chain and
ownership structure as schema-validated JSON with literal evidence per field, a
deterministic verifier validates every citation against stored page text, and
narrative blocks (comparecencia del vendedor, clausula PRIMERO) are rendered
only from verified data. Lawyers review, edit and approve the title case in the
Centro de Control Legal; approval feeds `title_verified`, seller variables and
the escritura case snapshot consumed by SDD 008. The pipeline is feature
flagged, cost-bounded, idempotent per source hash and degrades to audited
manual entry when the LLM is unavailable.

## Technical Context

**Language/Version**: Python 3.13+ in `apps/api`; TypeScript 5, React 19,
Next.js 16 in `apps/web`.

**Primary Dependencies**: Existing `langchain-openai`/`langchain-anthropic`/
`langchain-core` in `apps/api` (structured output with Pydantic schemas);
Supabase
PostgreSQL/Storage; FastAPI + Pydantic v2; arq/Redis worker runtime; SDD 007
services (`legal_text_extraction`, `legal_variable_resolution`,
`legal_variable_catalog`, `escritura_readiness`, `legal_document_ingestion`).
No LangGraph ReAct loop: the pipeline is a fixed sequence of structured-output
calls plus deterministic verification, which is testable and replayable.

**Model configuration**: New settings `LEGAL_TITLE_AGENT_ENABLED`,
`LEGAL_TITLE_AGENT_PROVIDER` (default `openai`), `LEGAL_TITLE_AGENT_MODEL`
(default `gpt-4o`), `LEGAL_TITLE_AGENT_TIMEOUT_SECONDS` (default `10`, per
external model call), `LEGAL_TITLE_AGENT_MAX_INPUT_CHARS`. OpenAI is the
initial provider because the pilot already has `OPENAI_API_KEY` configured in
`apps/api/.env` and the pilot exercise validated GPT chain reconstruction;
`anthropic` is the alternative provider (`claude-sonnet-4-6`) behind the same
setting. The deterministic evidence verifier makes safety provider-agnostic.
The sales chat agent model in `agent/graph.py` is not reused: title analysis
requires a stronger model and independent rollout.

**Storage**: New migration for `title_analyses` (tenant-scoped, RLS) plus
catalog updates. Staging remains `variable_resolutions` + `document_evidence`;
snapshots remain `escritura_cases`.

**Testing**: `pnpm verify:migrations`, `pnpm test:api`, `pnpm test:web`,
`pnpm typecheck:web`, `pnpm format:check`, `pnpm build:web`. LLM calls are
mocked with recorded response fixtures; a separate env-gated script runs live
evaluation against the Teno corpus.

**Target Platform**: Plotify monorepo production web app and FastAPI
worker/API service.

**Project Type**: Web application with typed internal API, Supabase database
and background processing.

**Performance Goals**: Analysis runs in background (worker); each external
model call is capped at 10 seconds, and a title case for a pilot project (2-4
title documents, <40 pages) targets completion in under 3 minutes across
segmented calls and retries. The title panel loads under 2 seconds from
persisted analysis. Cost per analysis is observable (token usage persisted).

**Constraints**: LLM output is proposal-only behind schema, confidence and
evidence (SDD 007 research decision). No auto-approval. No invented evidence:
every fact must pass deterministic snippet verification or degrade to
`manual_review`. Deterministic SII/SAG/plano extraction is untouched. All
contract changes originate in FastAPI/Pydantic. Tenant isolation everywhere.

**Scale/Scope**: Pilot projects with 1-4 title documents per project; one
title case per project; re-analysis on document replacement.

## Constitution Check

- **Producto Piloto Primero**: PASS. Unblocks real escritura generation for
  the pilot; scope is the minimum that makes title data trustworthy.
- **Geometria Espacial como Origen de Deslindes y Documentos**: PASS. Lot
  geometry/deslindes remain authoritative; title deslindes describe the matriz
  and are evidence-bound.
- **Supabase y Migraciones Canonicas**: PASS. New schema only via
  `packages/database/supabase/migrations`.
- **Contratos Tipados Entre Servicios**: PASS. New endpoints in
  FastAPI/Pydantic; web consumes generated/typed contracts.
- **Seguridad Multi-Tenant**: PASS. `title_analyses` and endpoints are
  organization/project scoped with RLS, mirroring SDD 007 tables.
- **Testing y Gates de Calidad Obligatorios**: PASS. Tasks include migration,
  API, web, contract and build gates plus a hallucination regression suite.

## Project Structure

### Documentation (this feature)

```text
specs/009-titulo-dominio-vigente/
├── spec.md
├── plan.md
├── agent-execution.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-contracts.md
│   └── ui-contracts.md
├── checklists/
│   └── requirements.md
├── handoff-sdd-008-addendum.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/api/
├── api/v1/endpoints/
│   └── legal_titles.py                  # new router
├── schemas/
│   └── legal_titles.py                  # TitleAnalysis, chain, alerts, blocks
├── services/
│   ├── legal_title_analysis.py          # orchestrator: gather -> LLM -> verify -> stage
│   ├── legal_title_llm.py               # model client, prompts (titulo_agent_v1), structured output
│   ├── legal_title_verification.py      # deterministic evidence verifier + cross-checks
│   ├── legal_title_blocks.py            # narrative rendering + numbers-to-words
│   ├── legal_variable_catalog.py        # catalog updates (titulo.* group, removals)
│   ├── legal_variable_resolution.py     # remove dominio regex path, staging integration
│   └── escritura_readiness.py           # title_verified gate rework
├── workers/tasks/
│   └── legal_title_analysis.py          # arq task: analyze_project_title
└── tests/
    ├── test_titulo_analysis.py
    ├── test_titulo_verification.py
    ├── test_titulo_blocks.py
    ├── test_titulo_endpoints.py
    ├── test_titulo_readiness.py
    └── fixtures/titulo/                 # Teno pages, recorded LLM responses, golden blocks

apps/web/src/
├── app/api/projects/[id]/legal-title/route.ts        # proxy: get/reanalyze
├── app/api/projects/[id]/legal-title/[analysisId]/route.ts  # edit/approve
├── components/projects/legal/
│   ├── title-case-panel.tsx             # structure, timeline, owners, alerts
│   ├── title-chain-timeline.tsx
│   ├── title-narrative-editor.tsx       # generated vs edited, reason, audit
│   └── title-alerts-list.tsx
├── components/projects/detail/legal-control-center.tsx  # mount title panel
└── lib/legal/
    ├── title-types.ts
    └── title-client.ts

packages/database/supabase/migrations/
└── 20260609000100_titulo_dominio_vigente.sql
```

**Structure Decision**: Title analysis lives beside the SDD 007 legal services
in `apps/api/services` and runs in the same arq worker. The sales chat agent
stack (`apps/api/agent/`) is not extended; the title pipeline has its own
model client and prompt versioning to keep rollout, cost and quality
independent.

## Phase Plan

### Agent Execution Protocol

SDD 009 follows GitHub Spec Kit (`specify -> plan -> tasks -> implement`) plus
the Plotify operating layer in [agent-execution.md](./agent-execution.md):
required context, roles, task-size limits, parallelization, review gates and
stop conditions.

### Phase 0 - Research and Corpus

- Decisions recorded in [research.md](./research.md): pipeline-not-ReAct, model
  and config strategy, evidence verification algorithm, catalog redesign,
  idempotency, eval approach with recorded fixtures.
- Build the Teno fixture set: extracted page texts of both dominios, the
  lawyer's final draft as golden blocks, a recorded "hallucinated" LLM response
  (2023 dates, altered surname) as regression fixture.

### Phase 1 - Data Model and Contracts

- `title_analyses` table design, analysis JSON schema, catalog changes
  (`titulo.*` group; removal of `matriz.inscripcion_*`/`matriz.adquisicion_*`),
  readiness gate rework. Output: [data-model.md](./data-model.md),
  [contracts/api-contracts.md](./contracts/api-contracts.md),
  [contracts/ui-contracts.md](./contracts/ui-contracts.md),
  [quickstart.md](./quickstart.md).

### Phase 2 - Foundational Runtime

- Migration + RLS + regenerated DB types.
- Pydantic schemas (`schemas/legal_titles.py`), router skeleton, service
  skeletons, worker task registration, settings.
- Catalog update with backward-compatible variable migration for any existing
  `matriz.inscripcion_*` resolutions (mark `superseded`).

### Phase 3 - Title Analysis Pipeline (US1)

- Source gathering: active title documents + pages via SDD 007 services.
- LLM client with structured output (`titulo_agent_v1` prompt, Pydantic
  schema), input segmentation per document, max-chars guard.
- Orchestrator with idempotency (source content hash), retries, timeout,
  failure states, token usage logging.
- Trigger integration: `run_document_ingestion_job` queues project title
  analysis after ingesting title-type documents; document replacement
  supersedes and re-queues.

### Phase 4 - Evidence Verification and Blocks (US2)

- Deterministic verifier: normalized literal snippet matching against
  `legal_document_pages`, per-field verdicts, degradation rules to
  `manual_review`.
- Cross-checks: `matriz.rol_avaluo` vs active SII certificate; superficie vs
  SAG/plano values when present.
- Narrative renderer: comparecencia + clausula PRIMERO from verified chain
  only; deterministic numbers-to-words (reuse/extend existing resolver used for
  `precio_letras`).
- Staging: proposals + evidence into `variable_resolutions`/
  `document_evidence` via SDD 007 services.

### Phase 5 - Centro de Control Legal Title Panel (US3)

- Title case panel: structure summary, chain timeline with evidence viewer,
  owners, alerts, manual_review queue.
- Narrative editor: generated text preserved, edited text with reason, audit
  via `legal_review_decisions`.
- Approve/block flow with pending-items gate; supersede awareness.
- Manual entry path when `llm_disabled`.

### Phase 6 - Alerts and Cross-Checks (US4)

- Alert taxonomy persistence and UI (`dl_3516`, `derechos_aguas`,
  `vigente_en_el_resto`, `multi_inmueble`, `gravamen`,
  `personeria_requerida`, `discrepancia_declaracion`).
- Alert resolution states feeding approval gate and escritura case
  requirements (DL 3.516 clause requirement).

### Phase 7 - Readiness and Snapshot Integration (US5)

- `title_verified` gate: approved title case + approved title variables.
- Seller `vendedor.*`/`personeria.*` proposals from analysis.
- `escritura_cases.variable_snapshot` includes structured chain, approved
  blocks, owners and resolved alerts (domain values only).

### Phase 8 - Production Hardening and Quality Gates

- Feature flag per organization/project; rollout/ops docs.
- Hallucination regression suite (SC-002), idempotency tests (SC-009), tenant
  regression, contract regeneration, full quality gates.
- Live-eval script (env-gated) against Teno corpus with report.
- Obsidian implementation note + SDD 008 handoff addendum.

## SDD 008 Handoff Contract (addendum)

SDD 008 (Creador de Matriz y Minuta DOCX) keeps the SDD 007 handoff and adds:

1. Token sources for title: `titulo.inscripciones[]` (structured, repeatable),
   `titulo.comparecencia_vendedor_texto` and `titulo.clausula_primero_texto`
   (approved narrative blocks), `titulo.propietarios[]`, plus retained
   `matriz.*` identity keys.
2. Clause SEXTO (servidumbre) registral references render from
   `titulo.inscripciones[]` tokens, not from free text.
3. Alert-driven clause requirements: an unresolved `dl_3516` alert blocks
   omitting the LGUC clause.
4. Narrative blocks are insertable as block-level tokens; SDD 008 must not
   edit title facts — corrections go back to the Centro de Control Legal and
   produce a new snapshot.

Details in [handoff-sdd-008-addendum.md](./handoff-sdd-008-addendum.md).

## Production Readiness Gates

- Migrations/RLS pass `pnpm verify:migrations`; DB types regenerated.
- API contracts regenerated (`pnpm contracts:generate`) and consumed as types
  in web.
- Pytest suites cover: chain extraction from fixtures, verifier degradation
  (hallucination regression), blocks golden tests, idempotency, tenant
  isolation, endpoint auth, readiness gating, supersede flow, llm_disabled
  degradation.
- Web tests cover panel states, narrative edit audit, approval blocking and
  readiness display.
- Worker task retryable and idempotent per source hash; timeout/failure states
  visible and re-queueable from UI.
- Token usage and duration logged per run; cost guard via max input chars.
- Feature flag default off; pilot enablement documented in quickstart.
- No deletion of historical analyses or snapshots on supersede.

## Complexity Tracking

No constitution violation. The added complexity (LLM pipeline + verifier +
panel) is justified because title history is the one escritura input that
cannot be resolved deterministically, and the legal risk of silent model
errors requires the verification/approval machinery.
