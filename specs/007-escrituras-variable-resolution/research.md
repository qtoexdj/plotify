# Research: Escrituras Variable Resolution

**Date**: 2026-06-03

## Sources Reviewed

- CodeGraph context for `ProjectMediaStep`, `DocumentsTab`, `LegalTab`, `resolve_variables`, `persist_document`, current readiness helpers and document endpoints.
- `plotify_memori/20 - Producto & Proyectos/Plan Logica Productiva Generador Escrituras - Variables y Editor.md`
- `plotify_memori/60 - Referencias & Soporte/Variables Escritura Compraventa - Fuentes de Obtencion.md`
- `plotify_memori/10 - Decisiones/ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal.md`
- `labs/labs_escrituras/docs/matriz-escritura-compraventa-readiness.md`
- `specs/006-escrituras-lab/spec.md`, `plan.md`, `tasks.md`
- Context7 docs check for Spec Kit SDD workflow.
- Installed package check for Next.js, React, ProseKit and dnd-kit in `apps/web/package.json`.

## Current Code Findings

### Uploads and onboarding

Decision: Extend the current upload paths instead of building a separate uploader.

Rationale:

- `ProjectMediaStep` already captures `doc_dominio_vigente`, `doc_hipoteca_gravamen`, `doc_roles`, `doc_subdivision`, `doc_plano_oficial` and `doc_otros`.
- `apps/web/src/app/api/uploads/project-files/route.ts` already validates file signatures and writes to `project-files`.
- `apps/web/src/app/api/projects/route.ts` already passes document paths to `createProject`.
- Existing project document upload already lives in `DocumentsTab`.

Alternatives considered:

- Replacing the upload UX: rejected because onboarding must stay light.
- Starting review during onboarding: rejected by product decision.

### Legal data today

Decision: Keep `project_legal_data` as a compatibility sink, but add variable/evidence tables as the source for extracted/reviewed data.

Rationale:

- `project_legal_data` exists and feeds `document_engine.resolve_variables`, but it is one row per project and cannot express per-variable evidence, conflicts, review history or lot-specific SII roles.
- The current action only persists a subset of fields: CBR, SAG, source document and review status.

Alternatives considered:

- Expanding only `project_legal_data`: rejected because it cannot model variable-level states, evidence or audit cleanly.

### Document engine

Decision: Integrate approved `variable_resolutions` into `resolve_variables` later, after extraction/review records are stable.

Rationale:

- `resolve_variables(lot_id, organization_id)` already resolves `lots`, `lot_records`, `projects`, `organizations`, `project_legal_data` and payment data.
- `persist_document()` already snapshots variables into `generated_documents.variables_snapshot`.
- The missing piece is not rendering; it is evidence-backed readiness and approved variable source selection.

Alternatives considered:

- Rewriting document generation first: rejected because it would render values before the source contract is stable.

### Geometry and deslindes

Decision: Treat existing geometry verification as a required gate, not as a document extractor result.

Rationale:

- `validateLotDocumentReadiness()` already requires verified status, official area, official perimeter and official boundaries.
- `LotVerificationPanel` already lets the user correct official area, boundaries and servidumbre.
- The user explicitly requires manual verification that KMZ-derived deslindes match the official plan.

Alternatives considered:

- Trusting KMZ automatically: rejected because the user identified KMZ imprecision as a known risk.

## Product Decisions

### Onboarding only uploads and starts extraction

Decision: Onboarding remains upload-only; all variable review happens later.

Rationale:

- It avoids making project creation tedious.
- Extraction can run after the project exists, and the Centro de Control Legal can show progress and gaps.

Alternatives considered:

- Inline variable review in onboarding: rejected by product decision.

### First production phase is variables, evidence and readiness

Decision: Do not implement the visual minuta builder in this SDD.

Rationale:

- The future builder depends on a stable variable contract.
- The current gap is knowing where variables come from, whether they are correct, and what is missing.

Alternatives considered:

- Start with DOCX rendering/editor work: rejected because it would multiply unknowns and increase legal risk.

### Rol de avaluo en tramite

Decision: Treat `Rol de avaluo en tramite` as a valid state for a newly subdivided/enajenated lot when backed by SII evidence or approved legal override.

Rationale:

- The reference DOCX uses this wording.
- SII sources and the lab analysis show this is expected for first transfer after subdivision before a definitive role is updated.
- The system should not show it as a missing value if a certificate supports it.

Alternatives considered:

- Require definitive role before minuta: rejected because it does not match the first-transfer flow for subdivided lots.

### Certificado SII role extraction pattern

Decision: Extract certificado de roles SII records with deterministic parsing before any LLM-assisted fallback.

Rationale:

- The common certificate pattern is simple and legally important: numero de lote, rol/pre-rol and comuna.
- Role matching should not depend on semantic guessing when the document gives a direct tuple.
- The tuple itself is the evidence needed to render `Rol de avaluo en tramite numero [rol] de la comuna de [comuna]`.
- Rol matriz and lot roles from the certificate remain in `rol_en_tramite` until a definitive role certificate or approved post-inscription value supersedes them.

Alternatives considered:

- Treating SII roles as generic OCR variables: rejected because it creates unnecessary ambiguity and can join unrelated snippets.
- LLM-first extraction: rejected for role association because the certificate structure is regular enough for a rule parser and the legal risk of a wrong lot-role match is high.

### Real SII certificate corpus and matrix role

Decision: Treat the pilot SII certificates as a small corpus of supported layouts instead of a single strict row shape.

Rationale:

- Textual certificates can declare comuna and rol matriz in the header while each row contains only unit label plus assigned role/pre-role.
- The rol matriz is a critical certificate-level value shared by every role row in the certificate and must be propagated to `lot_legal_data.sii_role_matrix`.
- Observed textual row families include `LOTE N ... [rol]`, prefixed `... LOTE N [rol]`, `PARCELA X LT N ... [rol]` and similar unit labels where the lot number is embedded rather than first in the line.
- Image-only certificates must go through OCR before variable extraction; an empty text layer is an extraction input problem, not a reason to invent or mark role rows as missing.

Alternatives considered:

- Keep requiring comuna on every row: rejected because real SII certificates often show comuna once in the header.
- Use fuzzy matching without tuple evidence: rejected because it can create legally dangerous lot-role assignments.
- Ignore scanned certificates until manual upload: rejected for the pilot because several real SII files are image-only PDFs.

### SII OCR fallback

Decision: Add OCR as a fallback only after `pypdf` yields no usable text for SII certificate pages.

Rationale:

- Existing text extraction works for searchable PDFs and should remain deterministic and cheap.
- Scanned certificates are pages with image XObjects and zero text; they require OCR before the existing evidence pipeline can work.
- OCR output must be stored as document page text with converter/stats metadata so evidence remains traceable.

Alternatives considered:

- Make OCR the first extraction path: rejected because it increases cost and may degrade clean searchable PDFs.
- Mark all image-only PDFs as failed forever: rejected because it blocks real pilot documents that are otherwise valid certificates.

### Senior review hardening 2026-06-08

Decision: Re-open SDD 007 with production-hardening tasks before SDD 008 handoff.

Rationale:

- CodeGraph review of `match_sii_roles_to_lots` showed automatic matching can score against `unit_name`, which means labels such as `GAONA 7 PARCELA 8 LT 9` can accidentally match lots 7, 8 or 9 when only lot 9 is the juridical row lot.
- Automatic role assignment is legally sensitive; one extracted SII row must not be reused across multiple lots.
- Current role unit lookup can read project variables without an explicit active certificado de roles scope; replacing a certificate must remove superseded evidence from current matching/readiness while preserving old evidence for snapshots.
- CodeGraph review of `_iter_sii_real_certificate_rows` showed header context is tied to the same page text. Real PDFs can split header and rows across pages, so propagation must happen at document/certificate level with evidence and ambiguity checks.
- Multiple `Rol(es) Matriz(ces)` values cannot be collapsed into the first regex match without preserving ambiguity.
- Manual override UX can edit role/pre-role/comuna while sending stale `sii_role_in_process_text`; the API must derive this text server-side.
- OCR imports and system dependencies must be production guardrails, not best-effort dynamic paths that fail as generic empty extraction.

Alternatives considered:

- Continue from Phase 10 directly into SDD 008: rejected because the role-matching surface can still produce legally wrong lot-role assignments.
- Treat fuzzy unit label matching as a fallback automatic match: rejected because visible parcel/project numbers are not the same as the extracted juridical lot number.
- Delete superseded certificate variables: rejected because historical escritura snapshots and audit evidence must remain inspectable.
- Let the frontend compose manual override role text: rejected because the backend owns canonical legal variable derivation and audit.

### Lawyer/redactor as workflow gate

Decision: Store lawyer/redactor variables and legal review decisions as workflow data, not necessarily visible template text.

Rationale:

- The reference DOCX does not include a separate visible clause for lawyer redactor.
- The legal workflow still needs an accountable reviewer/redactor before marking a minuta approved for external use.

Alternatives considered:

- Force a visible clause into the template: rejected because it diverges from the reference DOCX structure.

## Technical Decisions

### Production extraction boundary

Decision: Port or adapt lab conversion/extraction patterns into `apps/api/services`, with production tables and workers.

Rationale:

- The lab already proves PDF/DOCX/DOC/RTF conversion and chunking ideas.
- Production must not depend on lab schema, ignored output folders or MCP-only tooling.

Alternatives considered:

- Calling the lab MCP server from production: rejected because it is local-only research infrastructure.

### LLM usage

Decision: Allow LLM-assisted extraction only as a proposer behind schemas, confidence and evidence.

Rationale:

- Legal data must be traceable. The model may classify/extract, but cannot invent evidence or approve values.
- If no evidence exists, variables become `missing` or `manual_review`.

Alternatives considered:

- Pure regex extraction: rejected for domain and SII documents with variable phrasing.
- LLM-only extraction without evidence: rejected for legal traceability.

### API ownership

Decision: Put extraction/readiness contracts in FastAPI/Pydantic and use Next.js routes as authenticated frontend proxies where needed.

Rationale:

- The constitution requires typed contracts between web and API.
- Existing document generation API is already in FastAPI under internal-secret protection.

Alternatives considered:

- Implement all logic in Next.js routes: rejected because it would split document engine ownership and bypass OpenAPI generation.

### Future builder compatibility

Decision: Keep future ProseKit/dnd-kit compatibility in the data model by using canonical variable keys and snapshots, but do not build the builder in this feature.

Rationale:

- ProseKit and dnd-kit are already installed in `apps/web`.
- The builder will need stable variable tokens and snapshots, which this feature provides.

Alternatives considered:

- Add builder tasks now: rejected to keep the MVP slice independently testable.

## Open Risks

- Plano official text extraction may be low-confidence and should default to manual review for critical fields.
- OCR failures must be visible and retryable, not silently treated as missing legal facts.
- Role matching requires careful string normalization for lot/unit labels.
- Manual overrides can become a source of truth; audit and tenant scope are mandatory.
