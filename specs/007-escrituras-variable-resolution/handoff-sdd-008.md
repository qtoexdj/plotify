# Handoff to SDD 008: Creador de Matriz y Minuta DOCX

**Date**: 2026-06-03

## Purpose

This document defines what SDD 007 must deliver before starting SDD 008. The next feature should build the matriz/minuta creation interface on top of reviewed variables and immutable snapshots, not on top of raw extraction output.

## Why SDD 008 Starts After SDD 007

The matriz builder is only useful if the variable layer is trustworthy. SDD 007 must first answer:

1. Which variables exist.
2. Where each value comes from.
3. Which values are approved, missing, conflicting or manual.
4. Which lot role belongs to the sold lot.
5. Whether geometry, title, SII, SAG/plano, parties, price and legal review gates are ready.

Once those answers are stable, SDD 008 can focus on drafting and editing the matriz.

## SDD 007 Outputs Required by SDD 008

| Output                      | Source                                      | Required by SDD 008                               |
| --------------------------- | ------------------------------------------- | ------------------------------------------------- |
| Canonical variable catalog  | `legal_variable_catalog.py` and web types   | Token list, labels, groups and required variables |
| Approved/resolved variables | `variable_resolutions`                      | Token values in the matriz                        |
| Evidence map                | `document_evidence` and `evidence_snapshot` | Evidence-aware preview and review                 |
| Lot role data               | `lot_legal_data`                            | Correct role/pre-role per sold lot                |
| Escritura case              | `escritura_cases`                           | Stable working case for the minuta                |
| Variable snapshot           | `escritura_cases.variable_snapshot`         | Rendering source for DOCX                         |
| Evidence snapshot           | `escritura_cases.evidence_snapshot`         | Audit and review support                          |
| Readiness gates             | `escritura_cases.readiness_gates`           | Block/unblock generation actions                  |
| Legal review warning        | readiness/API/UI                            | Mandatory user acknowledgement                    |
| Lawyer/redactor workflow    | `legal_review_decisions`                    | Approval gate before external use                 |

## SDD 008 Scope

SDD 008 should implement:

- A new matriz builder route and interface built from scratch for the legal drafting workflow.
- Versioned legal clause/block model for escritura de compraventa.
- ProseKit-based text editing with structured variable token nodes or marks.
- dnd-kit ordering for clauses/blocks where legal rules allow movement.
- Variable inventory panel fed by the escritura case snapshot.
- Modes for template tokens, resolved values and evidence/review.
- DOCX generation from snapshot and template version.
- Revision workflow for draft, legal review pending and approved minuta.

## SDD 008 Non-Scope

SDD 008 must not:

- Re-run OCR or extraction.
- Correct or approve extracted variables as part of the matriz editor.
- Read live OCR proposals instead of `variable_snapshot`.
- Invent notary/CBR final artifacts such as CVE, final repertory, seals or certifications.
- Bypass lawyer/redactor gates.

## Technical Direction for SDD 008

Current code already has exploratory or MVP examples:

- `apps/web/src/components/dashboard/documents/prosekit-editor.tsx`
- `apps/web/src/components/dashboard/documents/template-builder.tsx`
- `apps/api/services/document_engine.py`
- `apps/api/services/document_generator.py`
- `generated_documents.variables_snapshot`

The next builder should not be constrained by the current UI. Treat existing ProseKit and template-builder code as reference material only. SDD 008 should create a new professional interface using SDD 007 outputs as the contract.

ProseKit documentation supports custom nodes/marks and JSON content. For the matriz, variables should be structured tokens with attributes such as:

```json
{
  "variableKey": "matriz.inscripcion_fojas",
  "label": "Fojas inscripcion matriz",
  "state": "approved",
  "evidenceId": "uuid"
}
```

dnd-kit documentation supports sortable state management for ordered lists. For the matriz, use it for clause/block ordering and persist the resulting order explicitly; do not use drag-and-drop as a source of legal rules or variable truth.

## Variable Correction Boundary

Variable visualization and correction belongs to SDD 007's Centro de Control Legal. SDD 008 may show variable values, status and evidence in the matriz interface, but it should not mutate extracted/legal variable resolutions directly.

If the matrix reviewer sees a wrong value in SDD 008:

1. They navigate back to the Centro de Control Legal.
2. They correct or approve the variable there.
3. SDD 007 creates or refreshes the escritura case snapshot.
4. SDD 008 reloads the snapshot and re-renders the matriz.

## Acceptance Criteria for Starting SDD 008

SDD 008 can start when:

1. A sold lot can produce an escritura case snapshot.
2. Snapshot includes approved/resolved variable values.
3. Snapshot includes evidence references.
4. Readiness gates explain blockers.
5. SII role matching is resolved for the target lot.
6. Legal review warning and lawyer/redactor gate are present.
7. API/UI contracts are generated and passing quality gates.

## First SDD 008 Planning Question

The first SDD 008 decision should be whether the matriz builder stores clause content as:

1. ProseMirror JSON as source of truth with HTML/Jinja export.
2. HTML/Jinja as source of truth with ProseKit editing.
3. Dual storage with a canonical normalized representation.

Recommendation: prefer ProseMirror JSON plus explicit export pipeline, because variable tokens and evidence metadata need structured attributes.
