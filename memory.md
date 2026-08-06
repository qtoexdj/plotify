# Plotify Operational Memory

## Contrato con AGENTS.md

Lee [AGENTS.md](AGENTS.md) antes de usar esta memoria. Resume estado entre sesiones; no sustituye código, SDD ni el vault. Las reglas permanentes viven en AGENTS; el conocimiento profundo en `plotify_memori/`.

## Estado actual

- Verificado: 2026-08-06.
- Feature SDD activa: `specs/019-hardening-produccion/`.
- Próxima tarea permitida: T079 — outbox durable de venta a escritura.
- CodeGraph: sano y sincronizado; 872 archivos, 13.070 nodos y 33.011 aristas en esta revisión.
- Cambios locales ajenos a preservar: `apps/api/api/v1/endpoints/approvals.py`, `apps/api/workers/main_worker.py`, `apps/api/workers/tasks/escritura_workflow_outbox.py` y `packages/database/supabase/migrations/20260713000500_sdd019_workflow_durability.sql`.

## Fuentes

- Reglas: [AGENTS.md](AGENTS.md).
- Principios: `.specify/memory/constitution.md`.
- SDD activo: `specs/019-hardening-produccion/`.
- Código y dependencias: manifiestos, lockfile, migraciones y tests.
- Vault Obsidian: `plotify_memori/`; no usar `.obsidian/` como fuente de producto.
- [Mapa Técnico Actual](plotify_memori/30%20-%20Arquitectura/Mapa%20T%C3%A9cnico%20Actual.md).

## Stack técnico verificado

Fuente: `package.json`, `apps/web/package.json`, `apps/api/requirements.txt`, `pnpm-lock.yaml` y runtimes locales; verificado 2026-08-06.

- Node: mínimo `>=22.13`; runtime observado `26.5.0`.
- pnpm: `11.3.0` declarado.
- Web: Next `16.2.6`, React `19.2.4`, TypeScript 5, Tailwind 4, shadcn `4.8.0`, Vitest `4.0.17`, Playwright `1.61.1`.
- API/worker: Python `3.13.13`, FastAPI `0.135.1`, LangGraph `1.2.1`, ARQ `0.27.0`.
- Datos: Supabase cloud-only `swkrnjdpnlrgxgotmfxy`. PostgreSQL 17 está declarado por SDD019 y requiere confirmación Supabase MCP antes de afirmar estado del servicio.

## Correcciones

### Pendientes de verificar

- Ninguna.

### Verificadas

- 2026-08-06 — `plotify_memori/` es el vault de Obsidian y memoria profunda; `memory.md` no debe copiarlo. Fuente: usuario.
- 2026-08-06 — Rules y workflows heredados se retiran para eliminar instrucciones contradictorias. Fuente: usuario y auditoría de `.agents/`.

## Skills usadas y motivo

- 2026-08-06 — `context-engineering`: diseñar jerarquía de contexto persistente.
- 2026-08-06 — `documentation-and-adrs`: estructurar documentación durable en Obsidian.
- 2026-08-06 — `skill-creator`: crear `plotify-sdd-handoff`.
- 2026-08-06 — `test-driven-development`: cubrir el verificador antes de implementarlo.
- 2026-08-06 — `git-workflow-and-versioning`: aislar el cambio documental de producto.

## Handoffs y bitácora

- Handoffs históricos: `plotify_memori/50 - Implementaciones/`.
- SDD019 sigue activo; no emitir recibo de cierre hasta completar gates y evidencia.
- 2026-08-06 — Se adoptó el modelo AGENTS para normas, memory para estado y `plotify_memori/` para documentación profunda.

## Protocolo de actualización

1. Registrar una corrección del usuario como pendiente, con fecha y fuente.
2. Contrastar con código, SDD, tests, CodeGraph o decisión explícita.
3. Promover sólo hechos confirmados y enlazar la evidencia.
4. Al cerrar un SDD, usar `$plotify-sdd-handoff` para actualizar vault, Home, handoff y memoria.
5. Ejecutar `pnpm check:agent-context` tras modificar AGENTS, memoria, mapa técnico o feature activa.
