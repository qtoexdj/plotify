# Quickstart: Resolucion de Titulo de Dominio Vigente

**Date**: 2026-06-09 | **Feature**: `009-titulo-dominio-vigente`

## Enable the feature (pilot)

1. Apply migrations and regenerate types:

   ```bash
   pnpm verify:migrations
   ```

2. Configure the API service (`apps/api` environment):

   ```bash
   LEGAL_TITLE_AGENT_ENABLED=true
   LEGAL_TITLE_AGENT_PROVIDER=openai          # openai | anthropic
   LEGAL_TITLE_AGENT_MODEL=gpt-4o             # claude-sonnet-4-6 for anthropic
   LEGAL_TITLE_AGENT_TIMEOUT_SECONDS=10
   LEGAL_TITLE_AGENT_MAX_INPUT_CHARS=240000
   # OPENAI_API_KEY is already set in apps/api/.env (used by the chat agent);
   # set ANTHROPIC_API_KEY only when switching provider to anthropic.
   ```

3. Ensure the arq worker is running (same worker as legal ingestion):

   ```bash
   pnpm dev:api-worker   # or the docker-compose worker service
   ```

## Exercise the flow

1. In a project, upload a dominio vigente (and personeria if applicable) from
   the documents tab. Ingestion extracts text (SDD 007), then queues
   `analyze_project_title`.
2. Open Centro de Control Legal -> panel "Titulo". Wait for `processing` ->
   `proposed`/`needs_review`.
3. Review the chain timeline: every value shows evidence (page + snippet).
   Items in `manual_review` explain the failed verification.
4. Review narrative blocks (Comparecencia / Clausula PRIMERO). Edit with a
   reason if needed.
5. Resolve alerts (DL 3.516, aguas, etc.).
6. Approve the title case. `title_verified` unblocks; sold-lot escritura
   cases now snapshot `titulo` values.

## Degraded mode (no LLM)

With `LEGAL_TITLE_AGENT_ENABLED=false` or missing API key, the panel shows
`llm_disabled` and all title variables are enterable manually with audit. Use
this mode if the model is unavailable or for fully manual pilots.

## Operational runbook

### Enable / roll out the flag

- Rollout is per API environment: set `LEGAL_TITLE_AGENT_ENABLED=true` (plus
  provider key) and restart API + worker. No migration or deploy ordering
  beyond the Phase 1 migration is required.
- Runs persisted while the flag was off end in status `llm_disabled`. These
  rows never satisfy idempotency (same rule as `failed`), so after enabling
  the flag the next ingestion or a manual "Reanalizar" supersedes them and
  produces a real analysis. Nothing needs manual cleanup.
- Rollback: set the flag to `false` and restart. Existing approved analyses
  and snapshots are untouched; new runs surface `llm_disabled` and the panel
  switches to manual-entry mode.

### Retry failed runs

- Panel action "Reanalizar" or
  `POST /api/v1/legal-titles/project/{project_id}/reanalyze`. Runs are
  idempotent per `source_content_hash` + extractor/prompt version; `failed`
  and `llm_disabled` rows are always re-runnable.
- A `409` means a run is already `processing` for the project; wait for it to
  finish instead of re-queueing.
- Diagnose with `title_analyses.failure_code`:
  - `timeout` — raise `LEGAL_TITLE_AGENT_TIMEOUT_SECONDS` or retry off-peak.
  - `input_too_large` — a single page exceeds
    `LEGAL_TITLE_AGENT_MAX_INPUT_CHARS`; check the OCR output before raising
    the budget.
  - `schema_invalid` — the model broke the structured-output contract;
    retry, and if it persists capture the run and review the prompt/model.
  - `llm_error` — provider/network error; check the provider status page and
    the API key, then retry.

### Supersede behavior (document replacement)

- Replacing or adding a title document changes the source content hash:
  ingestion supersedes the current analysis (`status = superseded`) and
  re-queues `analyze_project_title` automatically.
- `title_verified` re-blocks until the new analysis is reviewed and approved;
  in-flight escritura cases keep their frozen snapshots (historical analyses
  and `legal_review_decisions` are never deleted).
- Manual re-queue is only needed if the worker was down during ingestion; use
  "Reanalizar".

### Cost observability

- Each `title_analyses` row records `model_name`, `token_usage` and
  `duration_ms`; query them per organization/project to attribute spend.
- Structured logs: `extract_title_analysis_step_started` (one per
  segment x step, 4 steps per segment), `title_analysis_failed`,
  `title_case_approved`. A title typically costs 4 LLM calls per source
  document segment.
- Cost guardrails are the timeout and the max-input-chars budget; both fail
  the run explicitly rather than silently truncating pages.

### Live evaluation (manual, billed)

```bash
cd apps/api
RUN_TITLE_LIVE_EVAL=1 LEGAL_TITLE_AGENT_ENABLED=true \
  ./.venv/bin/python scripts/titulo_live_eval.py --report /tmp/titulo-eval.json
```

Runs the real provider over the Teno corpus, verifies evidence
deterministically and prints field-level accuracy per section against
`teno_golden_chain.json` (exit code 2 when the gate env var is missing).
pytest never makes live calls; this script is the only allowed path.

## Test corpus

`apps/api/tests/fixtures/titulo/` contains:

- `teno_dominio_1996_pages.json` / `teno_dominio_2023_pages.json` — extracted
  page texts of the two CBR Curico titles.
- `teno_golden_chain.json` — expected structured chain (deed dates 2022;
  surname as written in the 1996 inscription).
- `teno_golden_blocks.md` — lawyer-corrected comparecencia and PRIMERO.
- `llm_response_golden.json` — recorded clean model response whose snippets
  all verify literally against the page fixtures.
- `llm_response_hallucinated.json` — same response with three altered values
  (2023 deed dates, surname `Minchelli`) over unchanged true snippets; the
  regression suite asserts the value-vs-snippet check degrades them to
  `manual_review`, never `proposed`.

Add new corpus cases (dominio unico, herencia, personeria) as
`<caso>_pages.json` + goldens; the suites parametrize over fixture families.
