# Research: Resolucion de Titulo de Dominio Vigente con Agente

**Date**: 2026-06-09 | **Feature**: `009-titulo-dominio-vigente`

## Pilot evidence (Teno corpus)

Two real CBR Curico titles for the same property (Lote N°3, Hijuela N°6, ex
Fundo El Condor, Teno, rol 67-23):

- Inscription fojas 1.338 N°1.322/1996: joint purchase (Galaz Abarca +
  Herrmann Frank, equal shares) of two properties (Hijuela N°3 and Lote N°3)
  from Minghel Balladares; deed 17-may-1996 before Ivan Torrealba Acevedo
  (Santiago). Includes water rights in the sale. Marginal notes record the 2023
  transfer of Herrmann's rights; certified "VIGENTE EN EL RESTO".
- Inscription fojas 4.699 N°2.781/2023: purchase of Herrmann's ACCIONES Y
  DERECHOS over Lote N°3 by Galaz Abarca; deeds 02-feb-2022 (Repto. 365, Pucon)
  and rectificatoria 19-ago-2022 (Repto. 4.230, Santiago). Declares DL 3.516 /
  LGUC 55-56 restriction; seller described as "divorciado, rentista".

A frontier LLM (user exercise) reconstructed the structure correctly but
**altered both deed dates (2022 -> 2023) and a surname (Minghel ->
Minchelli)** while producing fluent legal prose. The lawyer's human draft
independently omitted "acciones y derechos", the provincia, and left the 1996
water rights untreated. Conclusion: LLM reasoning is necessary and sufficient
for chain reconstruction, but factual anchoring must be deterministic and
human-external.

## Decisions

### Project-scoped title case, not per-document extraction

Decision: Analyze all active title documents of a project as one title case.

Rationale: Ownership composition (multiple dominios, derechos, herencia,
personeria) is only answerable across documents. Per-document proposals cannot
state who sells and how they appear (comparecencia).

Alternatives considered:

- Per-document extraction with later merge: rejected; the merge is the hard
  legal reasoning and would happen without document context.

### Fixed structured pipeline, not ReAct agent loop

Decision: Implement a fixed sequence — gather sources, structured-output LLM
calls (classify, chain, owners/representation, identity/alerts), deterministic
verification, rendering — instead of a tool-calling agent loop.

Rationale: Deterministic replay, recorded-fixture testing, bounded cost and
latency. There is no external tool the model needs to call; everything it needs
is in the gathered pages.

Alternatives considered:

- LangGraph ReAct with retrieval tools: rejected for nondeterminism and test
  cost; may be revisited if corpora exceed input limits.

### Evidence verification is deterministic and mandatory

Decision: Every fact proposed by the model carries `legal_document_id`,
`page_number` and a literal snippet; a verifier (no LLM) normalizes whitespace,
case and accents and requires substring match against stored page text, plus a
value-vs-snippet consistency check (the value or its textual/numeric
equivalent, including Spanish date/number words, must be derivable from the
snippet — otherwise a hallucinated value quoting a real snippet would pass).
Failed match on either check degrades the fact and dependent narrative to
`manual_review`.

Rationale: This is the only mechanism that catches the observed
hallucinations (dates, surname) without trusting a second model. Aligns with
SDD 007 research decision: "LLM-assisted extraction only as a proposer behind
schemas, confidence and evidence".

Alternatives considered:

- LLM self-verification or judge model: rejected as primary control (same
  failure class); may be added later as advisory signal only.
- Fuzzy similarity thresholds: rejected for facts; normalized literal matching
  is auditable. OCR noise is handled by normalization rules, not similarity.

### Narrative rendered from verified data only

Decision: Comparecencia and clausula PRIMERO are rendered from the verified
chain JSON; the LLM may draft phrasing, but every number/name/date in the
final block must come from verified fields; numbers-to-words is deterministic.

Rationale: The chain feeds multiple clauses (PRIMERO and servidumbre registral
references in SEXTO of the pilot draft), so structure is the source of truth;
prose is a projection.

### Catalog redesign

Decision: Add `titulo.*` group (`estructura`, `inscripciones[]`,
`propietarios[]`, `comparecencia_vendedor_texto`, `clausula_primero_texto`,
`alertas[]`). Remove `matriz.inscripcion_fojas/numero/anio/cbr` and
`matriz.adquisicion_modo/notaria/fecha/repertorio` (superseded by
`titulo.inscripciones[]`). Keep matriz identity keys (nombre_predio, ubicacion,
comuna, provincia, region, superficie_total, deslindes.\*, rol_avaluo) now
proposed by the agent.

Rationale: Singular inscription keys cannot represent multi-dominio chains;
identity keys remain needed for cross-checks (rol vs SII, superficie vs
SAG/plano) and template tokens. `REPEATABLE_SOURCE_REF_VARIABLE_KEYS` precedent
from SII rows covers repeatable staging.

### Model and configuration

Decision: Dedicated settings (`LEGAL_TITLE_AGENT_*`) with configurable
provider: default `openai` / `gpt-4o` via existing `langchain-openai`,
alternative `anthropic` / `claude-sonnet-4-6` via existing
`langchain-anthropic`. Independent from the sales chat agent in
`agent/graph.py`.

Rationale: The pilot already holds `OPENAI_API_KEY` in `apps/api/.env` and the
pilot exercise validated GPT chain reconstruction, so OpenAI is the cheapest
path to first runs. The deterministic evidence verifier is the safety layer,
so provider choice does not weaken guarantees — observed hallucinations
degrade to `manual_review` regardless of vendor. Legal title reasoning needs a
stronger model than the chat default; independent flagging allows pilot
rollout and cost control. Provider/model are configuration, not code, so
upgrades and provider comparisons (via the live-eval script) are operational.

### Idempotency and supersede

Decision: An analysis run is keyed by the SHA-256 of the ordered source page
contents; same hash -> no duplicate staging. Replacing/adding a title document
supersedes the current analysis and re-queues.

Rationale: Mirrors SDD 007 document versioning semantics and keeps history.

### Degradation without LLM

Decision: Feature flag off or missing API key produces `llm_disabled` title
case; all title variables enterable manually through the existing audited
correction flow; readiness shows the explicit cause.

Rationale: The pilot must not hard-depend on an external model to sell lots.

### Evaluation approach

Decision: Pytest runs against recorded LLM response fixtures (including a
hallucinated-response regression fixture). A separate env-gated script
(`RUN_TITLE_LIVE_EVAL=1`) executes the live model on the Teno corpus and
reports field-level accuracy against golden values.

Rationale: CI determinism and cost control; live quality measured on demand.
The golden outputs are the lawyer's final draft blocks corrected against the
documents (deed dates 2022; surname as written in the 1996 inscription).
