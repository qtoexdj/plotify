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
