# Agent Execution Protocol: SDD 007 Escrituras Variable Resolution

**Feature**: `007-escrituras-variable-resolution`
**Authority**: Spec Kit SDD artifacts plus Plotify constitution and memory.
**Purpose**: Define how Codex, subagents or parallel worktrees execute SDD 007 without drifting from the approved plan.

## Alignment With GitHub Spec Kit

This repository follows the GitHub Spec Kit cycle:

1. `specify`
2. `plan`
3. `tasks`
4. `implement`

The official Spec Kit flow provides the artifact sequence and implementation discipline. This document adds the Plotify-specific operating layer for agents, subagents, review limits and production gates.

## Required Context Before Any Task

Every agent must read these files before changing code:

- `AGENTS.md`
- `.specify/memory/constitution.md`
- `specs/007-escrituras-variable-resolution/spec.md`
- `specs/007-escrituras-variable-resolution/plan.md`
- `specs/007-escrituras-variable-resolution/tasks.md`
- `specs/007-escrituras-variable-resolution/data-model.md`
- Relevant files under `specs/007-escrituras-variable-resolution/contracts/`
- Relevant Plotify memory under `plotify_memori/`

Before editing, every agent must run or confirm:

```bash
git status --short
codegraph sync .
```

Use CodeGraph for structural repo context, symbol impact and flow tracing. Use Context7 only for current external library, SDK, CLI, API or cloud documentation.

## Agent Roles

| Role                   | Scope                                                     | May edit                                          | Must not edit                                            |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| SDD Lead               | Task order, artifact consistency, final review            | SDD docs, task status, handoff docs               | Product/runtime code unless implementing the active task |
| Database Agent         | Supabase migration, RLS, generated DB types               | `packages/database/**`, generated DB type outputs | API/web behavior beyond type alignment                   |
| API Agent              | FastAPI endpoints, Pydantic schemas, services, workers    | `apps/api/**`, API contract source                | Hand-edit generated OpenAPI as source of truth           |
| Extraction Agent       | OCR/text extraction, variable proposals, evidence         | extraction services/tests/fixtures                | UI correction source of truth                            |
| Web Agent              | Onboarding wiring, Centro de Control Legal, readiness UI  | `apps/web/**`                                     | Database migrations or backend service-role assumptions  |
| QA/Review Agent        | Tests, analyze findings, security/tenant regression       | tests, docs, review notes                         | Production code unless explicitly assigned a task        |
| Legal Product Reviewer | Legal workflow language, warnings, variable source review | docs/spec clarifications                          | Code, migrations or legal advice as final authority      |

One physical Codex session can play multiple roles, but it must name the active role in the task handoff when the change is significant.

## Task Execution Rules

- Implement exactly one unchecked task from `tasks.md` per implementation pass unless the user explicitly expands scope.
- Follow task order and phase dependencies.
- Do not start user story tasks until Phase 1 and Phase 2 blocking foundations are complete.
- `[P]` means safe to parallelize only after dependencies are met.
- Do not parallelize two agents against the same file, migration, endpoint, generated type, shared schema or table.
- If a task touches database + API + web at once, split it unless the task is explicitly an integration task.
- Mark a task `[x]` only after its acceptance is met and its `Verify` command passes, or after explicit user acceptance of an unverified result.
- If `spec.md`, `plan.md` or `tasks.md` changes, run or request `$speckit-analyze` before implementation continues.

## Change Size Limits

These limits are operational review limits, not hard product constraints:

| Limit                              | Target                                         | Required action if exceeded                             |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| Changed files per task             | 5 or fewer                                     | Split or document why the task cannot be split          |
| Added/modified code lines per task | 250 or fewer                                   | Add review note in task handoff                         |
| Hard review threshold              | More than 400 changed LOC or more than 6 files | Stop for SDD Lead review before marking complete        |
| Database migration size            | As small as coherent schema allows             | Review RLS and rollback/superseding behavior separately |
| UI component size                  | 300 LOC or fewer per component                 | Extract focused child components or hooks               |
| Test fixture size                  | Can exceed target                              | Keep fixture isolated and named by source document type |

Generated files do not count toward the review threshold, but the source change that produced them must be reviewed.

## Handoff Template

Every completed implementation pass must report:

```text
Task: TXXX
Role: <active role>
Files changed:
- ...
Verify:
- <command>: passed/failed/not run
Task status:
- Marked [x]: yes/no
Residual risks:
- ...
Next task:
- TYYY
```

## Review Gates

| Gate                     | Applies before                 | Reviewer focus                                                        |
| ------------------------ | ------------------------------ | --------------------------------------------------------------------- |
| DB/RLS gate              | API endpoints using new tables | tenant isolation, service-role ownership, migration reversibility     |
| Contract gate            | Web consumes API changes       | Pydantic source, generated OpenAPI/client, response states            |
| Extraction evidence gate | Variable approval UI           | page/source evidence, confidence, conflict/missing states             |
| Role matching gate       | Escritura readiness            | `rol_en_tramite`, ambiguous matches, legal override audit             |
| UI accessibility gate    | Centro de Control Legal        | keyboard, focus, empty/error/loading states, mobile behavior          |
| Production gate          | T068/T069/T070                 | full quality gates, rollout flag, retry/idempotency, operations notes |
| SDD 008 handoff gate     | SDD 007 closure                | stable snapshots, no raw OCR dependency, matriz-builder boundary      |

## Stop Conditions

Stop and ask for direction or run analysis before continuing when:

- A legal variable changes meaning or source of truth.
- Tenant ownership cannot be proven from persisted resources.
- Extraction confidence cannot be represented with evidence.
- A task requires editing generated contracts as source of truth.
- A failing Verify command is unrelated and cannot be isolated.
- The implementation would require replacing the SDD 008 scope inside SDD 007.
- CodeGraph context is unavailable for structural code changes.

## SDD 008 Boundary

SDD 007 owns extraction, evidence, review, role matching and escritura case snapshots. SDD 008 owns the new matriz builder UI with ProseKit plus dnd-kit and consumes only approved snapshots from SDD 007.

If a variable is wrong during matriz editing, the user returns to SDD 007 Centro de Control Legal, corrects the variable and creates a new snapshot. SDD 008 must not become the source of truth for variable correction.
