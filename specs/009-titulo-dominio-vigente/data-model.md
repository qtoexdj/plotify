# Data Model: Resolucion de Titulo de Dominio Vigente con Agente

**Date**: 2026-06-09 | **Feature**: `009-titulo-dominio-vigente`

## Overview

One new tenant-scoped table (`title_analyses`) plus catalog and readiness
changes. Staging and audit reuse SDD 007 tables: `variable_resolutions`,
`document_evidence`, `legal_review_decisions`, `escritura_cases`.

## New Table: `title_analyses`

Migration: `packages/database/supabase/migrations/20260609000100_titulo_dominio_vigente.sql`

| Column                              | Type                        | Notes                                                                                        |
| ----------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| `id`                                | uuid pk                     |                                                                                              |
| `organization_id`                   | uuid not null               | RLS tenant scope                                                                             |
| `project_id`                        | uuid not null               | one active analysis per project                                                              |
| `status`                            | text not null               | `processing`, `proposed`, `needs_review`, `failed`, `llm_disabled`, `approved`, `superseded` |
| `structure_type`                    | text null                   | `dominio_unico`, `multiples_dominios`, `compra_derechos`, `herencia`, `mixto`                |
| `analysis_json`                     | jsonb not null default '{}' | schema-validated `TitleAnalysis` (below)                                                     |
| `narrative_comparecencia_generated` | text null                   | renderer output, immutable per run                                                           |
| `narrative_comparecencia_edited`    | text null                   | lawyer-edited text                                                                           |
| `narrative_primero_generated`       | text null                   | renderer output, immutable per run                                                           |
| `narrative_primero_edited`          | text null                   | lawyer-edited text                                                                           |
| `alerts`                            | jsonb not null default '[]' | `TitleAlert[]` with resolution state                                                         |
| `verification_stats`                | jsonb not null default '{}' | verified/unverified counts, failed matches detail                                            |
| `source_document_ids`               | uuid[] not null             | active title documents consumed                                                              |
| `source_content_hash`               | text not null               | SHA-256 of ordered page contents (idempotency key)                                           |
| `extractor_name`                    | text not null               | `titulo_agent_v1`                                                                            |
| `model_name`                        | text not null               | e.g. `gpt-4o` (provider-prefixed if needed)                                                  |
| `prompt_version`                    | text not null               |                                                                                              |
| `token_usage`                       | jsonb null                  | input/output tokens per step                                                                 |
| `duration_ms`                       | integer null                |                                                                                              |
| `failure_code`                      | text null                   | `timeout`, `schema_invalid`, `ocr_required`, `input_too_large`, `llm_error`                  |
| `approved_by`                       | uuid null                   |                                                                                              |
| `approved_at`                       | timestamptz null            |                                                                                              |
| `superseded_by_id`                  | uuid null                   | next analysis                                                                                |
| `created_at` / `updated_at`         | timestamptz                 |                                                                                              |

Constraints/Indexes:

- Unique partial index `title_analyses_one_active_idx` on `(project_id)` where
  `status not in ('superseded','failed')`: at most one current case per
  project, enforced at the database level. Consequence for the service
  (T010/T018): before inserting a new `processing` row, the current row —
  including `llm_disabled` — MUST be marked `superseded` first, or the insert
  fails.
- Unique `(project_id, source_content_hash, extractor_name, prompt_version)`
  for idempotent runs.
- RLS: same organization-membership policies as `escritura_cases`.

## `TitleAnalysis` JSON schema (Pydantic, `apps/api/schemas/legal_titles.py`)

```jsonc
{
  "structure_type": "compra_derechos",
  "property_identity": {
    "nombre_predio": {
      "value": "LOTE N°3 (del plano de subdivision) de la Hijuela N°6 del ex fundo El Condor",
      "evidence": {
        "legal_document_id": "uuid",
        "page_number": 2,
        "snippet": "LOTE N°3 (del plano de subdivision)...",
      },
      "verified": true,
    },
    "ubicacion": { "value": "sector El Condor", "evidence": {}, "verified": true },
    "comuna": {},
    "provincia": {},
    "region": {}, // region may be null (no evidence)
    "superficie_texto": {},
    "deslindes": { "norte": {}, "sur": {}, "oriente": {}, "poniente": {} },
    "rol_avaluo": { "value": "67-23", "evidence": {}, "verified": true },
  },
  "inscripciones": [
    {
      "orden": 1,
      "tipo_adquisicion": "compra", // compra | compra_derechos | herencia_posesion_efectiva | herencia_inscripcion_especial | cesion_derechos | otro
      "adquirentes": [{ "nombre": {}, "cuota": "50%" }],
      "antecesor": { "nombre": {} },
      "escritura": { "fecha": {}, "notario": {}, "notaria_ciudad": {}, "repertorio": {} },
      "rectificatorias": [{ "fecha": {}, "notario": {}, "repertorio": {} }],
      "inscripcion": { "fojas": {}, "numero": {}, "anio": {}, "cbr": {} },
      "observaciones": [{ "tipo": "vigente_en_el_resto", "evidence": {} }],
    },
  ],
  "propietarios_actuales": [
    {
      "nombre": {},
      "rut": {},
      "estado_civil": {},
      "profesion": {},
      "domicilio": {},
      "cuota": "100%",
      "requiere_personeria": false,
    },
  ],
  "alertas": [
    { "tipo": "dl_3516", "detalle": "...", "evidence": {}, "resolution": "pending" }, // pending | acknowledged | clause_added | dismissed_with_reason
  ],
}
```

Every leaf fact is an `EvidencedValue { value, evidence{legal_document_id,
page_number, snippet}, confidence, verified }`. `verified` is set only by the
deterministic verifier, never by the LLM. Verification has two mandatory
checks: (1) the snippet is a literal (normalized) substring of the cited page
text, and (2) the value is consistent with its own snippet — the value or its
textual/numeric equivalent (including Spanish number/date words) must be
derivable from the snippet. Check 2 is what catches a hallucinated value
quoted against a real snippet (e.g. value `2023-02-02` with snippet "dos de
febrero del dos mil veintidós", or surname `Minchelli` with snippet quoting
`MINGHEL`); the regression fixture `llm_response_hallucinated.json` exercises
exactly this case.

## Variable Catalog Changes (`legal_variable_catalog.py`)

Added group `titulo`:

| Key                                   | Type            | Notes                                                                      |
| ------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| `titulo.estructura`                   | text enum       | structure_type                                                             |
| `titulo.inscripciones[]`              | json repeatable | staged with `source_ref.inscription_index` (REPEATABLE_SOURCE_REF pattern) |
| `titulo.propietarios[]`               | json repeatable |                                                                            |
| `titulo.comparecencia_vendedor_texto` | text block      | narrative                                                                  |
| `titulo.clausula_primero_texto`       | text block      | narrative                                                                  |
| `titulo.alertas[]`                    | json repeatable | alert + resolution                                                         |

Removed keys (migration marks existing resolutions `superseded`):
`matriz.inscripcion_fojas`, `matriz.inscripcion_numero`,
`matriz.inscripcion_anio`, `matriz.inscripcion_cbr`, `matriz.adquisicion_modo`,
`matriz.adquisicion_notaria`, `matriz.adquisicion_fecha`,
`matriz.adquisicion_repertorio`.

Retained matriz identity keys, now proposed by the title agent:
`matriz.nombre_predio`, `matriz.ubicacion`, `matriz.comuna`,
`matriz.provincia`, `matriz.region`, `matriz.superficie_total`,
`matriz.deslindes.*`, `matriz.rol_avaluo`.

`DOMINIO_VIGENTE_REQUIRED_VARIABLES` and `dominio_vigente_rules_v1` regex
extractor are removed from `legal_variable_resolution.py`; dominio documents no
longer produce per-document proposals — they feed the project title case.

Transitional state (Phase 1 only): until T020 removes the regex extractor, a
compatibility shim keeps the removed keys accepted — `LEGACY_DEPRECATED_KEYS`
in `legal_variable_catalog.py` (accepted by `is_variable_key`, grouped as
`matriz`) and the legacy `matriz.inscripcion_*` block re-added to
`CRITICAL_VARIABLE_KEYS` in `legal_variable_resolution.py`. T020/T021 delete
both shims together with the extractor; they must not survive into Phase 4.

## Readiness Changes (`escritura_readiness.py`, catalog)

`READINESS_REQUIRED_VARIABLES_BY_GATE["title_verified"]` becomes:

- `titulo.estructura`, `titulo.inscripciones[]`,
  `titulo.comparecencia_vendedor_texto`, `titulo.clausula_primero_texto`,
  `matriz.nombre_predio`, `matriz.ubicacion`
- plus gate condition: current `title_analyses.status = 'approved'`.

`party_verified` seller-side (`vendedor.nombre`, `vendedor.rut`) can be
satisfied by approved `titulo.propietarios[]`-derived proposals.

Blocking causes surfaced: `no_title_documents`, `analysis_processing`,
`analysis_needs_review`, `analysis_failed`, `llm_disabled`,
`analysis_superseded`, `pending_manual_review`, `unresolved_alerts`.

## Snapshot Contract (`escritura_cases.variable_snapshot`)

Approved title contributes domain values only:

```jsonc
{
  "titulo": {
    "estructura": "compra_derechos",
    "inscripciones": [ { "fojas": "1338", "numero": "1322", "anio": "1996", "cbr": "Curico", "tipo_adquisicion": "compra", "escritura_fecha": "1996-05-17", "notario": "Ivan Torrealba Acevedo", "repertorio": null } ],
    "propietarios": [ ... ],
    "comparecencia_vendedor_texto": "...",   // approved (edited if edited)
    "clausula_primero_texto": "...",
    "alertas_resueltas": [ { "tipo": "dl_3516", "resolution": "clause_added" } ]
  }
}
```

No `evidence`/`verified`/parser metadata inside the snapshot values; evidence
lives in `evidence_snapshot` keyed by variable, per SDD 007 conventions.

## Audit

- Narrative edits and approvals write `legal_review_decisions` rows
  (decision types `title_block_edited`, `title_case_approved`,
  `title_alert_resolved`) with reason, user, timestamp and the
  generated-vs-edited pair.
- Manual variable entry under `llm_disabled` uses the existing SDD 007
  variable correction audit path.

## Correccion 2026-06-10: cardinalidad de documentos legales

- No schema change: `legal_documents` already supports N rows per
  (project, document_type); `version_number` has no uniqueness constraint and
  acts as an upload sequence per type. `superseded_by` keeps pointing to the
  replacing document.
- Catalog gains `MULTI_ACTIVE_LEGAL_DOCUMENT_TYPES` (`dominio_vigente`,
  `personeria`, `hipoteca_gravamen`, `plano_oficial`, `otro`). All other types
  are single-active.
- `LegalDocumentRegisterRequest` gains optional `replaces_legal_document_id`:
  - Multi-active type + param absent -> add; no documents are superseded.
  - Multi-active type + param present -> only that document is superseded
    (must belong to same org/project/document_type and be active).
  - Single-active type -> supersede-all previous versions (unchanged); the
    param is rejected as a validation error to avoid ambiguous semantics.
- Title analysis supersede/re-queue on registration and post-ingestion is
  unchanged: it is driven by the set of active documents, which both add and
  replace mutate.
