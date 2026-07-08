<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/017-aprobacion-por-excepcion/plan.md`

<!-- SPECKIT END -->

## Plotify Project Memory

- Use `plotify_memori/` as Plotify's official curated product and architecture memory.
- Do not use `plotify_memori/.obsidian/` as a product source.
- Before generating specs, plans, or tasks, contrast `plotify_memori/` against the real codebase with CodeGraph.
- Use CodeGraph for project structure, symbol relationships, impact analysis, and implementation context.
- Use Context7 only when current documentation is needed for external libraries, SDKs, CLIs, APIs, or cloud services.

## SDD Implementation Flow

This repository uses Spec Kit SDD as the implementation authority. The active feature is:

- `specs/017-aprobacion-por-excepcion/spec.md`
- `specs/017-aprobacion-por-excepcion/plan.md`
- `specs/017-aprobacion-por-excepcion/research.md`
- `specs/017-aprobacion-por-excepcion/data-model.md`
- `specs/017-aprobacion-por-excepcion/quickstart.md`
- `specs/017-aprobacion-por-excepcion/contracts/`
- `specs/017-aprobacion-por-excepcion/tasks.md` (created by `/speckit-tasks`)
- `.specify/memory/constitution.md`

Before implementation:

1. Read `specs/017-aprobacion-por-excepcion/tasks.md` and `plan.md`.
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

Implementa solo TXXX de specs/017-aprobacion-por-excepcion/tasks.md.
No avances a otra tarea.
Lee specs/017-aprobacion-por-excepcion/tasks.md y plan.md.
Usa CodeGraph para impacto.
Usa Context7 si toca librerías externas.
Ejecuta el Verify de la tarea.
Marca la tarea como completada solo si pasa.
```

## Contract And Migration Rules

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
