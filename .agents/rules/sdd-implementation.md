---
trigger: always_on
---

# Spec Kit SDD Implementation Rule

Esta regla aplica a Codex CLI, Codex en VSCode, Antigravity y cualquier agente que trabaje sobre este repo.

## Artefactos Activos

- Constitución: `.specify/memory/constitution.md`
- Feature activa: `specs/001-stabilize-plotify-mvp/`
- Spec: `specs/001-stabilize-plotify-mvp/spec.md`
- Plan: `specs/001-stabilize-plotify-mvp/plan.md`
- Tareas: `specs/001-stabilize-plotify-mvp/tasks.md`
- Contratos de diseño: `specs/001-stabilize-plotify-mvp/contracts/`

## Orden de Trabajo

1. `constitution`
2. `spec`
3. `clarify`
4. `plan`
5. `tasks`
6. `analyze`
7. `implement`

No saltes directo a implementación si `analyze` reporta issues `CRITICAL`.

## Protocolo Antes de Implementar

1. Lee la primera tarea pendiente en `tasks.md`.
2. Confirma dependencias previas y fase.
3. Ejecuta `git status --short`.
4. Ejecuta `codegraph sync .`.
5. Usa CodeGraph para impacto y estructura real cuando la tarea toque código.
6. Usa Context7/ctx7 solo si la tarea toca documentación actual de librerías, frameworks, SDKs, APIs, CLIs o cloud.

## Regla de Una Tarea

- Implementa una sola tarea `TXXX` por ciclo.
- No avances a otra tarea aunque parezca relacionada.
- Ejecuta el comando `Verify` de esa tarea.
- Marca `TXXX` como `[x]` solo si:
  - la aceptación está cumplida; y
  - el `Verify` pasó; o
  - el usuario acepta explícitamente que quede sin verificación.
- Para cambios web/frontend, ejecuta además este cierre en orden: `pnpm --filter web lint`, `pnpm format:check`, `pnpm build:web`.

## Prompt Recomendado

```text
$speckit-implement

Implementa solo TXXX de specs/001-stabilize-plotify-mvp/tasks.md.
No avances a otra tarea.
Usa CodeGraph para impacto.
Usa Context7 si toca librerías externas.
Ejecuta el Verify de la tarea.
Marca la tarea como completada solo si pasa.
```

## Contratos y Generación

- OpenAPI se genera desde FastAPI/Pydantic.
- No edites `packages/contracts/openapi/plotify-chat.v1.json` como fuente de verdad.
- Cambia endpoints/schemas en `apps/api`, ejecuta `pnpm contracts:generate` y actualiza clientes generados.
- Las migraciones Supabase viven solo en `packages/database/supabase/migrations`.
- Después de cambios DB: `pnpm verify:migrations` y regeneración de tipos si corresponde.

## Gates de Calidad por Tipo de Cambio

- Web/frontend: `pnpm --filter web lint` -> `pnpm format:check` -> `pnpm build:web`.
- TypeScript/tipos/contratos generados: `pnpm typecheck:web`.
- FastAPI/workers/backend: `pnpm test:api`.
- Supabase/migraciones: `pnpm verify:migrations`.
- OpenAPI/API contract: `pnpm contracts:generate`.

## Cierre de Tarea

Al finalizar, reporta:

- tarea implementada;
- archivos modificados;
- comandos ejecutados y resultado;
- si se marcó `[x]` en `tasks.md`;
- riesgos o verificación pendiente.
