---
trigger: always_on
---

# Spec Kit SDD Implementation Rule

Esta regla aplica a Codex CLI, Codex en VSCode, Antigravity y cualquier agente que trabaje sobre este repo.

## Artefactos Activos

- Constitución: `.specify/memory/constitution.md`
- Feature activa: `specs/009-titulo-dominio-vigente/`
- Spec: `specs/009-titulo-dominio-vigente/spec.md`
- Plan: `specs/009-titulo-dominio-vigente/plan.md`
- Protocolo agentes/subagentes: `specs/009-titulo-dominio-vigente/agent-execution.md`
- Tareas: `specs/009-titulo-dominio-vigente/tasks.md`
- Contratos de diseño: `specs/009-titulo-dominio-vigente/contracts/`

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
2. Lee `specs/009-titulo-dominio-vigente/agent-execution.md`.
3. Confirma dependencias previas y fase.
4. Ejecuta `git status --short`.
5. Ejecuta `codegraph sync .`.
6. Usa CodeGraph para impacto y estructura real cuando la tarea toque código.
7. Usa Context7/ctx7 solo si la tarea toca documentación actual de librerías, frameworks, SDKs, APIs, CLIs o cloud.

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

Implementa solo TXXX de specs/009-titulo-dominio-vigente/tasks.md.
No avances a otra tarea.
Lee specs/009-titulo-dominio-vigente/agent-execution.md.
Usa CodeGraph para impacto.
Usa Context7 si toca librerías externas.
Ejecuta el Verify de la tarea.
Marca la tarea como completada solo si pasa.
```

## Protocolo Multi-Agente

- Usa `agent-execution.md` como regla operativa para roles, subagentes, limites de lineas, paralelizacion y handoff.
- Solo tareas marcadas `[P]` pueden paralelizarse y nunca sobre el mismo archivo, migracion, endpoint, tipo generado o tabla.
- Si una tarea supera 5 archivos, 250 LOC modificadas o mezcla DB/API/Web sin ser tarea de integracion, detente y divide o deja justificacion para revision.
- Todo cierre de tarea debe reportar tarea, rol activo, archivos, Verify, estado `[x]`, riesgos y siguiente tarea.

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
