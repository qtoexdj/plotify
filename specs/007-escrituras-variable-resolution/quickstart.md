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

1. Process a certificado de roles SII containing several lots, including a fixture where comuna and rol matriz appear in the header and rows contain unit label plus role.
2. Open the SII role matching section.
3. Verify each lot has one of:
   - `matched`
   - `ambiguous`
   - `missing`
   - `manual_override`
4. Confirm a lot with role in process appears as `Rol de avaluo en tramite` when evidence exists.
5. Confirm the certificate summary shows comuna, rol matriz, extracted unit count, OCR/text source and rows needing review.
6. Open evidence for one role row and confirm the snippet includes the source row and header context used for comuna/rol matriz.

Expected result:

- No silent role assignment exists.
- Ambiguous/missing roles block readiness.
- Role in process is not flagged as missing when backed by evidence.
- Matrix role is visible and propagated to each matched lot from the same certificate.

## Scenario 4B: Scanned SII certificate requires OCR

1. Process an image-only certificado de roles SII fixture.
2. If OCR is configured, wait for OCR-backed extraction to finish.
3. If OCR is not configured or fails, open Centro de Control Legal.

Expected result:

- The document is not treated as a normal text extraction.
- OCR-backed pages include converter/stats metadata and evidence when successful.
- Without successful OCR, the document clearly shows `ocr_required` or `needs_review`, and no SII role rows are silently invented.

## Scenario 4C: Production SII role hardening

1. Process a certificado SII fixture with a multi-number unit label such as `GAONA 7 PARCELA 8 LT 9` and extracted `sii_lot_number_normalized = 9`.
2. Verify only lot 9 can become `matched`; lots 7 and 8 must remain `missing`, `ambiguous` or manual-review candidates.
3. Replace the certificado de roles SII with a newer version.
4. Verify roles from the superseded certificate are excluded from current matching and escritura readiness while historical evidence remains attached to old snapshots.
5. Process a fixture where comuna/rol matriz appear on page 1 and role rows appear on page 2.
6. Verify header context is propagated only with certificate/page evidence; ambiguous header context requires `manual_review`.
7. Process a fixture with multiple matrix roles.
8. Verify `matrix_roles` preserves the list and automatic matrix-role propagation is blocked unless the parser proves a globally applicable role.
9. Submit a manual override that changes pre-role or comuna while the client sends stale `sii_role_in_process_text`.
10. Verify the backend derives and persists the final text from the approved pre-role plus comuna.
11. Simulate OCR dependency, converter or timeout failures.
12. Verify the document surfaces `ocr_required`/`needs_review` with stats and no invented SII rows.

Expected result:

- Automatic SII role matching is exact, one-to-one and certificate-version scoped.
- Cross-page context and matrix roles are evidence-aware and conservative.
- Manual overrides cannot persist stale derived role text from the browser.
- OCR runtime failures are operationally visible and deterministic.

## Scenario 4D: Source-of-truth alignment (Phase 12)

1. Upload an active certificado de roles SII for a project with several lots.
2. Open the SII role matching section.
3. Confirm the certificate summary shows `sii_comuna` and `sii_role_matrix` once at project level.
4. Confirm each lot row shows its own `sii_pre_role` and `matching_status` from `lot_legal_data`.
5. Remove the active certificate (upload a superseding version).
6. Open escritura readiness for any lot.

Expected result:

- Before superseding: lots with extracted rows are `rol_en_tramite`; `sii_roles_status` on the project is `active`.
- After superseding: `sii_roles_status` returns to `missing`; SII readiness gate is blocked for all lots until the new certificate is processed.
- Common SII values (`sii_comuna`, `sii_role_matrix`) come from `project_legal_data` and are shared; per-lot pre-role comes from `lot_legal_data`.
- Minuta variables and escritura case snapshots expose legal domain values (`sii.comuna`, `sii.rol_matriz`, `lote.rol_tramite`) and not raw parser/OCR metadata.

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
