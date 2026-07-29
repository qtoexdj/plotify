<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/019-hardening-produccion/plan.md`

<!-- SPECKIT END -->

## Plotify Project Memory

- Use `plotify_memori/` as Plotify's official curated product and architecture memory.
- Do not use `plotify_memori/.obsidian/` as a product source.
- Before generating specs, plans, or tasks, contrast `plotify_memori/` against the real codebase with CodeGraph.
- Use CodeGraph for project structure, symbol relationships, impact analysis, and implementation context.
- Use Context7 only when current documentation is needed for external libraries, SDKs, CLIs, APIs, or cloud services.

## SDD Implementation Flow

This repository uses Spec Kit SDD as the implementation authority. The active feature is:

- `specs/019-hardening-produccion/spec.md`
- `specs/019-hardening-produccion/plan.md`
- `specs/019-hardening-produccion/research.md`
- `specs/019-hardening-produccion/data-model.md`
- `specs/019-hardening-produccion/quickstart.md`
- `specs/019-hardening-produccion/contracts/`
- `specs/019-hardening-produccion/tasks.md` (created by `/speckit-tasks`)
- `.specify/memory/constitution.md`

Before implementation:

1. Read `specs/019-hardening-produccion/tasks.md` and `plan.md`.
2. Run or request `$speckit-analyze` after any change to constitution, spec, plan, or tasks.
3. Do not start implementation while critical analyze findings remain unresolved.
4. Run `git status --short` and `codegraph sync .`.
5. Implement exactly one unchecked task from `tasks.md` unless the user explicitly asks for a different scope.

During implementation:

- Follow the task order in `tasks.md`. Do not jump from foundations into user stories unless dependencies are complete.
- Use CodeGraph for impact, callers/callees, symbol lookup, and real repo structure before editing code.
- Use Context7 only for up-to-date external documentation. For local business logic, database shape, and project architecture, use the repo, CodeGraph, and `plotify_memori/`.
- Mark a task as complete (`[x]`) only after its acceptance criteria are met and its `Verify` command has passed or the user explicitly accepts an unverified result.
- Do not advance to the next task in the same implementation pass unless the user explicitly asks.
- For web/frontend changes, run `pnpm --filter web lint`, `pnpm format:check`, and then `pnpm build:web` before closing the task, unless the task's Verify command is intentionally narrower and the user accepts that narrower scope.

Canonical implementation prompt:

```text
$speckit-implement

Implementa solo TXXX de specs/019-hardening-produccion/tasks.md.
No avances a otra tarea.
Lee specs/019-hardening-produccion/tasks.md y plan.md.
Usa CodeGraph para impacto.
Usa Context7 si toca librerías externas.
Ejecuta el Verify de la tarea.
Marca la tarea como completada solo si pasa.
```

## Contract And Migration Rules

### Supabase is cloud-only

- Plotify uses the linked cloud project `swkrnjdpnlrgxgotmfxy` as its only Supabase database target.
- Never start, create, inspect, migrate, test, reset, or generate types from a local Supabase instance. Do not use Docker for Supabase, `supabase start`, `--local`, `db reset`, `migrations:apply:local`, `test:db`, or `types:generate:local`.
- Inspect database state through the Supabase MCP. Use linked/cloud commands only when a repository workflow explicitly requires a CLI operation.
- Treat any spec, task, quickstart, script, or Verify command that points to local Supabase as stale and unsafe. Update it to the linked/MCP equivalent before continuing; the stale command is never authority to run a local database.
- Database tests must be transaction-rolled-back against the linked project, and generated types must come from the linked project.

- OpenAPI is generated from FastAPI/Pydantic source. Do not hand-edit `packages/contracts/openapi/plotify-chat.v1.json` as the source of truth.
- To change an API contract, edit FastAPI endpoints/schemas under `apps/api`, then run `pnpm contracts:generate` and commit the generated contract/client outputs.
- Supabase migrations must live only under `packages/database/supabase/migrations`.
- After schema changes, run `pnpm verify:migrations` and regenerate database types when the task requires it.

## Quality Gates

- Web/frontend changes: `pnpm --filter web lint`, then `pnpm format:check`, then `pnpm build:web`.
- TypeScript contract or generated type changes: also run `pnpm typecheck:web`.
- API changes: run `pnpm test:api`.
- Database migration changes: run `pnpm verify:migrations`.

## CodeGraph

This project uses CodeGraph as the local code intelligence index for project structure, symbol relationships, call graphs, and impact analysis.

When the user types `/codegraph`, use the CodeGraph CLI before doing anything else.

Rules:

- For codebase questions, first run `codegraph explore "<question>"` when the repository has a CodeGraph index. Use `codegraph query "<symbol-or-term>"` for symbol lookup, `codegraph files .` for structure, and `codegraph node "<symbol-or-file>"` for focused source context with line numbers.
- Use `codegraph callers "<symbol>"`, `codegraph callees "<symbol>"`, and `codegraph impact "<symbol>"` for relationships, execution flow, and change impact. Prefer `--json` when machine-readable output helps.
- Dirty `.codegraph/` files are expected after indexing or incremental updates; dirty graph files are not a reason to skip CodeGraph. Only skip CodeGraph if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- Use `codegraph status .` when you need to verify index health or coverage before relying on results.
- After modifying code, run `codegraph sync .` to keep the graph current.
