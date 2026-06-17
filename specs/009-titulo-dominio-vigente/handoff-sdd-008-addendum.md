# Handoff Addendum to SDD 008: Title Tokens and Block Rendering

**Date**: 2026-06-09 | **Source**: SDD 009 | **Extends**: `specs/007-escrituras-variable-resolution/handoff-sdd-008.md`

SDD 008 (Creador de Matriz y Minuta DOCX) keeps every rule from the SDD 007
handoff. SDD 009 adds the title layer it was missing. This addendum is the
contract delta.

## New snapshot inputs available to SDD 008

From `escritura_cases.variable_snapshot` (approved domain values only):

| Token source                          | Shape                                                                                         | Used by                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `titulo.estructura`                   | enum                                                                                          | conditional clause logic                                    |
| `titulo.inscripciones[]`              | array of `{fojas, numero, anio, cbr, tipo_adquisicion, escritura_fecha, notario, repertorio}` | clausula PRIMERO chain, clausula SEXTO registral references |
| `titulo.propietarios[]`               | array of seller identity objects                                                              | comparecencia, firmas                                       |
| `titulo.comparecencia_vendedor_texto` | approved narrative block                                                                      | comparecencia section                                       |
| `titulo.clausula_primero_texto`       | approved narrative block                                                                      | clausula PRIMERO                                            |
| `titulo.alertas_resueltas[]`          | resolved alerts                                                                               | clause requirements                                         |
| `matriz.*` identity keys              | scalars                                                                                       | individualizacion tokens                                    |

Removed (no longer exist in catalog or snapshots):
`matriz.inscripcion_fojas/numero/anio/cbr`, `matriz.adquisicion_*`. Any SDD 008
template referencing those keys must use `titulo.inscripciones[]` instead.

The `titulo` snapshot domain only exists when the title case status is
`approved`. While unapproved, `title_verified` stays blocked with a specific
cause (`no_title_documents`, `analysis_processing`, `analysis_needs_review`,
`analysis_failed`, `llm_disabled`, `unresolved_alerts`,
`pending_manual_review`); SDD 008 surfaces those causes as deep links back to
the title panel instead of rendering a partial matriz.

## Rendering rules for SDD 008

1. **Block-level tokens**: `comparecencia_vendedor_texto` and
   `clausula_primero_texto` insert as block tokens (whole-paragraph nodes), not
   inline scalars. They are already lawyer-approved text.
2. **Registral references render from structure**: clause SEXTO (servidumbre)
   and any clause citing the matriz inscriptions must template over
   `titulo.inscripciones[]` items (with deterministic numbers-to-words), never
   re-parse the narrative blocks.
3. **Alert-driven clause requirements**: `titulo.alertas_resueltas[]` never
   contains `pending` alerts (approval is blocked while one exists). Each alert
   resolved as `clause_added` is a contract: the matriz must contain the
   corresponding clause, and the builder surfaces a blocking warning when the
   template omits it. `acknowledged` carries no clause obligation;
   `dismissed_with_reason` surfaces the reason in the review sidebar. The audit
   trail lives in `legal_review_decisions` (`title_alert_resolved`).

   | Alert `tipo`               | Clause required when `clause_added`                              |
   | -------------------------- | ---------------------------------------------------------------- |
   | `dl_3516`                  | LGUC 55/56 / DL 3.516 destination-prohibition clause             |
   | `derechos_aguas`           | Water-rights clause (included or expressly reserved)             |
   | `vigente_en_el_resto`      | Antecedent wording acknowledging the partial transfer            |
   | `multi_inmueble`           | Singularization clause limiting the sale to the subject property |
   | `gravamen`                 | Clause acknowledging or raising the mortgage/encumbrance         |
   | `personeria_requerida`     | Representation recitals citing the personeria                    |
   | `discrepancia_declaracion` | Clarifying declaration agreed by the lawyer                      |
   | `otro` / unknown tipos     | Lawyer-defined clause per the resolution reason                  |

4. **Correction boundary unchanged**: wrong title facts are corrected in the
   SDD 007/009 Centro de Control Legal (title panel), which supersedes,
   re-approves and produces a new snapshot. SDD 008 never edits title facts or
   narrative blocks beyond template composition.

## What SDD 008 must deliver to finish document generation

1. Matriz builder route/interface in `/documentos` (new, replacing the MVP
   plantillas/bloques/generar pages as reference-only code).
2. Versioned clause/block model with ProseMirror JSON as source of truth and
   explicit DOCX export pipeline (recommendation from SDD 007 handoff).
3. Structured variable tokens bound to snapshot keys (including the new
   `titulo.*` tokens) with state/evidence display.
4. dnd-kit clause ordering with persisted explicit order.
5. Preview modes: template tokens / resolved values / evidence-review.
6. DOCX generation from approved snapshot + template version, with the
   mandatory lawyer-review warning.
7. Revision workflow: draft -> legal review pending -> approved minuta.
8. Post-SDD 008 cleanup: legal UX consolidation in projects (full redesign of
   the Centro de Control Legal layout) once the project -> matriz flow exists.
