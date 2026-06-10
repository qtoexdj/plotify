# UI Contracts: Resolucion de Titulo de Dominio Vigente

**Date**: 2026-06-09 | **Feature**: `009-titulo-dominio-vigente`

The title case UI is a new panel inside the existing Centro de Control Legal
(`apps/web/src/components/projects/detail/legal-control-center.tsx`). It does
not replace the SDD 007 panels; it joins them. Full legal UX redesign is out
of scope (post-SDD 008).

## Components

```text
apps/web/src/components/projects/legal/
├── title-case-panel.tsx        # container: status, summary, sections
├── title-chain-timeline.tsx    # ordered inscriptions with evidence popovers
├── title-narrative-editor.tsx  # generated vs edited text, reason dialog
└── title-alerts-list.tsx       # typed alerts with resolve actions
```

Types in `apps/web/src/lib/legal/title-types.ts`; client in
`apps/web/src/lib/legal/title-client.ts` calling the `/legal-title` proxies.

## Panel states

| State          | Trigger                                              | UI behavior                                                                                        |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `no_documents` | no active title documents                            | Empty state with link to documents tab                                                             |
| `processing`   | analysis queued/running                              | Progress indicator, disable actions, poll                                                          |
| `proposed`     | analysis done, verification clean                    | Full review UI, approve enabled when no pending items                                              |
| `needs_review` | unverified facts / OCR required / segmentation issue | Pending-items queue first, approve disabled with reasons                                           |
| `failed`       | terminal run failure                                 | Failure code + "Reanalizar" action                                                                 |
| `llm_disabled` | flag/key off                                         | Manual-entry mode: all title variables editable via existing audited editor; banner explains state |
| `approved`     | approved case                                        | Read-only summary, approved badge, who/when, "Reabrir (supersede)"                                 |
| `superseded`   | source document replaced                             | Banner + link to new analysis status                                                               |

## Sections within the panel

1. **Resumen de estructura**: structure_type chip, propietarios actuales with
   cuotas, fuente documental count, run metadata (model, duration) collapsed.
2. **Cadena de adquisicion** (`title-chain-timeline`): one card per
   inscription, ordered; each field shows value + evidence affordance (popover
   with snippet, page, document, deep-link to `legal-evidence-viewer`).
   Unverified fields render with `manual_review` styling and the failed-match
   reason.
3. **Bloques narrativos** (`title-narrative-editor`): tabs Comparecencia /
   Clausula PRIMERO. Shows `generated` (read-only) and `edited` (textarea).
   Saving requires reason; shows last editor + timestamp. A "diferencias"
   toggle highlights edited-vs-generated diff. Blocks display a notice when
   any underlying fact is pending review.
4. **Alertas** (`title-alerts-list`): typed alerts with evidence and resolve
   actions (`acknowledged`, `clause_added`, `dismissed_with_reason` + reason).
   Pending alerts block approval and show that explicitly.
5. **Aprobacion**: approve button with server-driven blocking list rendered as
   checklist (variables pending, alerts pending). Approval confirmation
   restates the lawyer-responsibility warning from SDD 007 (FR-016 of 007).

## Readiness integration

`escritura-readiness-panel.tsx` shows `title_verified` with the new blocking
causes (`analysis_needs_review`, `llm_disabled`, `analysis_superseded`,
`unresolved_alerts`, ...) as human-readable strings, each linking to the title
panel section that resolves it.

## Evidence interaction rules

- Every chain/identity value must offer evidence in at most 2 interactions
  (SC-005): popover (1) -> open full page in evidence viewer (2).
- Values without evidence (e.g. region inferred) are visually marked
  `sin evidencia` and excluded from narrative until manually confirmed.

## Testing contract

`apps/web/tests/title-case-panel.test.ts` covers: state rendering matrix,
approve blocking list rendering, narrative edit requires reason, evidence
popover content, llm_disabled manual mode, superseded banner. Mock fetch via
the same harness used by `legal-control-center.test.ts`.
