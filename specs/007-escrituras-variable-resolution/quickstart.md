# Quickstart: Escrituras Variable Resolution

**Date**: 2026-06-03

This quickstart describes the intended end-to-end validation flow after implementation.

## Prerequisites

1. Local Supabase is running.
2. Web and API dependencies are installed.
3. The API worker runtime can enqueue and process arq jobs.
4. Test documents are available for:
   - dominio vigente
   - certificado de roles SII
   - certificado SAG
   - plano oficial or a low-confidence plan sample

## Setup

```bash
pnpm verify:migrations
pnpm contracts:generate
pnpm test:api
pnpm test:web
pnpm typecheck:web
pnpm format:check
pnpm build:web
```

## Scenario 1: Onboarding upload starts extraction

1. Open the project onboarding flow.
2. Upload dominio vigente and certificado de roles.
3. Complete project creation.
4. Open the project Documents tab.
5. Verify both files are listed as legal documents.
6. Verify extraction status is `queued`, `processing`, `text_extracted`, `variables_proposed` or `needs_review`.
7. Confirm no variable review was required during onboarding.

Expected result:

- Project is created.
- Legal document rows exist.
- Ingestion jobs exist.
- User can continue normal project setup while extraction runs.

## Scenario 2: Variables are proposed with evidence

1. Let extraction finish for dominio vigente.
2. Open Centro de Control Legal.
3. Filter group `matriz`.
4. Inspect variables such as:
   - `matriz.inscripcion_fojas`
   - `matriz.inscripcion_numero`
   - `matriz.inscripcion_anio`
   - `matriz.rol_avaluo`
5. Open evidence for one variable.

Expected result:

- Each document-derived proposed value has evidence with document and page/logical page.
- Missing values are explicit.
- Conflicts are marked as `conflict`.

## Scenario 3: Correct and approve a variable

1. Choose a variable with OCR error.
2. Edit the value.
3. Enter a correction reason.
4. Save and approve.
5. Reopen the variable detail.

Expected result:

- Value is updated.
- State is `approved`.
- Audit history shows old value, new value, user and timestamp.
- Existing evidence is retained or manual reason explains the correction.

## Scenario 4: SII roles match lots

1. Process a certificado de roles SII containing several lots.
2. Open the SII role matching section.
3. Verify each lot has one of:
   - `matched`
   - `ambiguous`
   - `missing`
   - `manual_override`
4. Confirm a lot with role in process appears as `Rol de avaluo en tramite` when evidence exists.

Expected result:

- No silent role assignment exists.
- Ambiguous/missing roles block readiness.
- Role in process is not flagged as missing when backed by evidence.

## Scenario 5: Sold lot readiness

1. Mark a lot as sold or use an existing sold lot.
2. Ensure buyer and price are present in the sale/lot record.
3. Ensure geometry readiness is verified.
4. Open escritura readiness for that lot.

Expected result:

- Plotify shows gate status for title, SII, SAG/plano, geometry, parties, price and legal review.
- If all required gates pass except legal approval, the system still shows the lawyer review warning and redactor/reviewer requirement.
- Creating an escritura case stores variable and evidence snapshots.

## Scenario 6: SDD 008 handoff readiness

1. Use a sold lot with a created escritura case.
2. Inspect the case payload or database row.
3. Confirm `variable_snapshot`, `evidence_snapshot` and `readiness_gates` are present.
4. Confirm no consumer needs to query raw OCR pages or unresolved extraction proposals to render approved values.

Expected result:

- The future matriz builder can read a stable case snapshot.
- Missing or wrong variables send the user back to Centro de Control Legal.
- The builder does not become responsible for extraction or legal source approval.

## Scenario 7: Production operation

1. Force one extraction job to fail.
2. Confirm the document remains visible with failure status.
3. Retry the job.
4. Supersede the document with a new version.
5. Confirm old evidence remains attached to old snapshots and the new version creates new proposals.

Expected result:

- Failed jobs are retryable.
- Retries are idempotent.
- Superseding is non-destructive.
- Audit history remains intact.

## Expected Validation Commands

```bash
pnpm verify:migrations
pnpm test:api
pnpm test:web
pnpm typecheck:web
pnpm contracts:generate
pnpm format:check
pnpm build:web
```
