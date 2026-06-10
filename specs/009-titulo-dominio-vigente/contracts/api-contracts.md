# API Contracts: Resolucion de Titulo de Dominio Vigente

**Date**: 2026-06-09 | **Feature**: `009-titulo-dominio-vigente`

All endpoints live in FastAPI (`apps/api/api/v1/endpoints/legal_titles.py`)
under the internal-secret + tenant validation pattern of SDD 007. Next.js
routes under `apps/web/src/app/api/projects/[id]/legal-title/` are
authenticated proxies. Contracts regenerate via `pnpm contracts:generate`.

## `GET /legal-titles/project/{project_id}`

Returns the current title case for the project.

Response `200`:

```jsonc
{
  "analysis": {
    "id": "uuid",
    "status": "proposed",                       // processing | proposed | needs_review | failed | llm_disabled | approved | superseded
    "structure_type": "compra_derechos",
    "analysis": { /* TitleAnalysis JSON, see data-model.md */ },
    "narrative": {
      "comparecencia": { "generated": "...", "edited": null, "effective": "..." },
      "primero": { "generated": "...", "edited": "...", "effective": "..." }
    },
    "alerts": [ { "tipo": "dl_3516", "detalle": "...", "evidence_ref": {...}, "resolution": "pending" } ],
    "verification": { "verified_count": 41, "unverified_count": 2, "failures": [ { "path": "inscripciones[1].escritura.fecha", "reason": "snippet_not_found", "proposed_snippet": "..." } ] },
    "pending_review": [ { "path": "...", "state": "manual_review" } ],
    "source_documents": [ { "legal_document_id": "uuid", "document_type": "dominio_vigente", "filename": "...", "version": 2 } ],
    "run": { "extractor_name": "titulo_agent_v1", "model_name": "gpt-4o", "prompt_version": "v1", "duration_ms": 84211, "created_at": "..." },
    "approved_by": null, "approved_at": null
  }
}
```

`404` when the project has no title documents; `200` with
`analysis.status = "llm_disabled"` when the flag/key is off but title
documents exist.

## `POST /legal-titles/project/{project_id}/reanalyze`

Queues a new analysis run. Idempotent: if an analysis with the same
`source_content_hash` and prompt/extractor version exists and is not
`failed`, returns it instead of queueing.

Response `202`: `{ "analysis_id": "uuid", "status": "processing", "queued": true }`

Errors: `409` when an analysis is already `processing` for the project;
`422` when there are no active title documents.

## `PATCH /legal-titles/{analysis_id}/narrative`

Edits a narrative block. Body:

```jsonc
{
  "block": "primero", // comparecencia | primero
  "edited_text": "...",
  "reason": "Ajuste de redaccion notarial",
}
```

Requires non-empty `reason`. Writes `legal_review_decisions`
(`title_block_edited`). Returns the updated narrative pair. `409` when the
analysis is `superseded` or `approved` (approved blocks are corrected by
re-opening: supersede + re-approve flow).

## `POST /legal-titles/{analysis_id}/alerts/{alert_index}/resolve`

Body: `{ "resolution": "acknowledged" | "clause_added" | "dismissed_with_reason", "reason": "..." }`.
Audited via `legal_review_decisions` (`title_alert_resolved`).

## `POST /legal-titles/{analysis_id}/approve`

Approves the title case. Preconditions enforced server-side:

- No `manual_review`/`conflict` title or matriz-identity variables pending.
- No alert with `resolution = "pending"`.
- Analysis status in (`proposed`, `needs_review`) and not superseded.

Effects: marks analysis `approved`; writes approved
`variable_resolutions` for `titulo.*` and matriz identity keys; writes
`legal_review_decisions` (`title_case_approved`); `title_verified` gate
becomes satisfiable.

Errors: `409` with machine-readable blocking list
`{ "blocking": [ { "kind": "variable", "key": "...", "state": "manual_review" }, { "kind": "alert", "tipo": "dl_3516" } ] }`.

## Worker task

`analyze_project_title(organization_id, project_id, trigger)` registered in
`apps/api/workers/tasks/legal_title_analysis.py` and `workers/main_worker.py`.
Triggers: ingestion completion of a title-type document, document replacement
(supersede), manual reanalyze. Retries with backoff; terminal failure persists
`failed` + `failure_code`.

## Cross-check contract

During staging the service compares:

- `matriz.rol_avaluo` (title) vs project SII data
  (`project_legal_data.sii_role_matrix` / active certificate): equality after
  role normalization -> annotation `cross_check: ok`; mismatch -> both staged
  as `conflict` with dual evidence.
- `matriz.superficie_total` vs SAG/plano-derived superficie when present:
  mismatch -> `manual_review` annotation (informational, superficie wording in
  titles is "dato meramente informativo").

## Settings

`apps/api/core/config.py`:

- `LEGAL_TITLE_AGENT_ENABLED: bool = False`
- `LEGAL_TITLE_AGENT_PROVIDER: str = "openai"` # `openai` | `anthropic`
- `LEGAL_TITLE_AGENT_MODEL: str = "gpt-4o"` # `claude-sonnet-4-6` when provider is `anthropic`
- `LEGAL_TITLE_AGENT_TIMEOUT_SECONDS: int = 10` # per external model call
- `LEGAL_TITLE_AGENT_MAX_INPUT_CHARS: int = 240_000`
- Reuses `OPENAI_API_KEY` (already present in `apps/api/.env`) or
  `ANTHROPIC_API_KEY` according to provider; missing key for the selected
  provider yields `llm_disabled`, never a crash.
