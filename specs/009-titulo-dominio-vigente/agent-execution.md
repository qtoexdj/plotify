# Agent Execution Protocol: SDD 009 Titulo Dominio Vigente

**Feature**: `009-titulo-dominio-vigente`
**Authority**: Spec Kit SDD artifacts plus Plotify constitution and memory.
**Purpose**: Define how agents/subagents execute SDD 009 without drifting from
the approved plan. Inherits the SDD 007 protocol; deltas below.

## Alignment With GitHub Spec Kit

`specify -> plan -> tasks -> implement`. This document adds the
Plotify-specific operating layer.

## Required Context Before Any Task

- `AGENTS.md`
- `.specify/memory/constitution.md`
- `specs/009-titulo-dominio-vigente/spec.md`
- `specs/009-titulo-dominio-vigente/plan.md`
- `specs/009-titulo-dominio-vigente/tasks.md`
- `specs/009-titulo-dominio-vigente/data-model.md`
- Relevant `specs/009-titulo-dominio-vigente/contracts/`
- SDD 007 boundary docs: `specs/007-escrituras-variable-resolution/handoff-sdd-008.md`
- Obsidian: `plotify_memori/50 - Implementaciones/SDD 007 Escrituras Variable Resolution.md`

Before editing, run or confirm:

```bash
git status --short
codegraph sync .
```

## Agent Roles

| Role                   | Scope                                           | May edit                                                                               | Must not edit                                    |
| ---------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| SDD Lead               | Task order, artifact consistency, final review  | SDD docs, task status                                                                  | Runtime code unless implementing the active task |
| Database Agent         | Migration, RLS, generated DB types              | `packages/database/**`                                                                 | API/web behavior beyond type alignment           |
| API Agent              | Endpoints, schemas, services, worker            | `apps/api/**`                                                                          | Generated OpenAPI as source of truth             |
| LLM Pipeline Agent     | Prompts, structured output, verifier, blocks    | `legal_title_llm.py`, `legal_title_verification.py`, `legal_title_blocks.py`, fixtures | Approval/readiness semantics outside contracts   |
| Web Agent              | Title panel, proxies, readiness UI              | `apps/web/**`                                                                          | Migrations, backend service-role assumptions     |
| QA/Review Agent        | Tests, regression, tenant checks                | tests, docs                                                                            | Production code unless assigned                  |
| Legal Product Reviewer | Alert taxonomy wording, warnings, golden blocks | docs/fixtures goldens                                                                  | Code or legal advice as final authority          |

## SDD 009 Specific Rules

1. **No LLM in tests**: pytest must run on recorded fixtures only. Live calls
   are confined to `apps/api/scripts/titulo_live_eval.py` behind
   `RUN_TITLE_LIVE_EVAL=1`.
2. **Verifier is sacred**: no task may weaken the deterministic evidence
   verifier to make a test pass. If the model output fails verification, the
   correct outcome is `manual_review`.
3. **Catalog removals are migrations**: removing `matriz.inscripcion_*` /
   `matriz.adquisicion_*` must supersede existing rows, never delete.
4. **SII/SAG/plano untouched**: deterministic extractors from SDD 007 are out
   of bounds for this feature except the dominio dispatch removal (T020).
5. **Snapshot purity**: `variable_snapshot` carries domain values only — no
   parser/verifier metadata (SDD 007 Phase 12 rule applies).
6. **One unchecked task per pass**; respect `[P]` markers for parallel
   subagents; each task ends with its Verify command green.
7. **Stop conditions**: schema changes beyond data-model.md, new external
   dependencies, prompt changes that alter the output schema, or any catalog
   key addition/removal not listed — stop and update SDD docs first.

## Handoff Format

Each completed task reports: task id, files touched, verify command output
summary, contract or schema deltas (if any), and pending follow-ups as
unchecked sub-bullets in `tasks.md` only when approved by SDD Lead.
