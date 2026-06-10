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
   LEGAL_TITLE_AGENT_TIMEOUT_SECONDS=180
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

## Operations

- **Retry a failed run**: panel action "Reanalizar" or
  `POST /legal-titles/project/{project_id}/reanalyze`. Runs are idempotent per
  source content hash.
- **Replace a dominio**: replacing/adding a title document supersedes the
  current analysis and re-queues automatically; `title_verified` re-blocks
  until re-approval. Historical analyses and snapshots are preserved.
- **Cost observability**: each `title_analyses` row records `token_usage` and
  `duration_ms`; structured logs use event names
  `title_analysis_started/completed/failed`.
- **Live evaluation** (manual, billed):

  ```bash
  RUN_TITLE_LIVE_EVAL=1 python apps/api/scripts/titulo_live_eval.py
  ```

  Reports field-level accuracy against the Teno golden fixtures.

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
