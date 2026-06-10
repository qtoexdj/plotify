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

## Rendering rules for SDD 008

1. **Block-level tokens**: `comparecencia_vendedor_texto` and
   `clausula_primero_texto` insert as block tokens (whole-paragraph nodes), not
   inline scalars. They are already lawyer-approved text.
2. **Registral references render from structure**: clause SEXTO (servidumbre)
   and any clause citing the matriz inscriptions must template over
   `titulo.inscripciones[]` items (with deterministic numbers-to-words), never
   re-parse the narrative blocks.
3. **Alert-driven clause requirements**: a snapshot containing a `dl_3516`
   alert resolved as `clause_added` requires the LGUC 55/56 clause present in
   the matriz; the builder must surface a blocking warning if the template
   omits it. Alerts resolved as `dismissed_with_reason` surface the reason in
   the review sidebar.
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
