# Mapa Técnico Actual

## Propósito

Esta nota conecta Obsidian con la estructura y stack verificable de Plotify. Las versiones provienen de manifiestos; código, tests y migraciones describen el comportamiento actual.

## Estructura del monorepo

- `apps/web`: Next.js App Router, interfaz y rutas same-origin.
- `apps/api`: FastAPI, LangGraph, workers ARQ y generación documental.
- `packages/database`: migraciones Supabase, tipos generados y verificadores linked.
- `packages/contracts`: OpenAPI y cliente generado desde FastAPI/Pydantic.
- `specs/`: artefactos Spec Kit por feature.
- `plotify_memori/`: vault de Obsidian para producto, arquitectura, decisiones y handoffs.

## Stack verificado — 2026-08-18

| Área | Tecnología | Versión/fuente |
| --- | --- | --- |
| Runtime JavaScript | Node.js | mínimo `>=22.13` en `package.json`; runtime observado `26.5.0` |
| Gestor de paquetes | pnpm | `11.22.0` en `package.json` (brew) |
| Web | Next.js | `16.2.6` en `apps/web/package.json` |
| UI | React | `19.2.8` en `apps/web/package.json` |
| Tipado y estilos | TypeScript, Tailwind CSS, shadcn/ui | TypeScript 5, Tailwind 4, shadcn `4.8.0` |
| Testing web | Vitest, Playwright | `4.1.10`, `1.61.1` |
| API/worker | Python | runtime observado `3.13.13` |
| API | FastAPI | `0.135.1` en `apps/api/requirements.txt` |
| Agentes | LangGraph | `1.2.1` en `apps/api/requirements.txt` |
| Cola | ARQ | `0.27.0` en `apps/api/requirements.txt` |
| Datos | Supabase PostgreSQL | cloud-only; proyecto `swkrnjdpnlrgxgotmfxy` |
| Despliegue | GitHub → Coolify (self-hosted) | Servidor local con túnel y dominio propio; Docker Compose (`web`, `api`, `worker`, `redis`) |

PostgreSQL 17 está declarado por SDD019. Confírmalo mediante Supabase MCP antes de usarlo como estado del servicio.

## Fronteras y navegación

- Migraciones: `packages/database/supabase/migrations`.
- OpenAPI: generado desde FastAPI/Pydantic; no editar `packages/contracts/openapi/plotify-chat.v1.json` como fuente.
- Tenant: las operaciones privilegiadas derivan organización desde relaciones persistidas.
- Egress: adaptadores protegidos, host permitido, timeout máximo 10 s y logs redactados.
- Antes de editar: `codegraph sync .`, luego `explore`, `query`, `node`, `callers`, `callees` o `impact` según contexto.

## Calidad

- Web: `pnpm --filter web lint`, `pnpm format:check`, `pnpm build:web`.
- Tipos/contratos: `pnpm typecheck:web`, `pnpm contracts:generate` según aplique.
- API: `pnpm test:api`.
- DB: `pnpm verify:migrations` y operaciones linked/cloud aprobadas.
- Contexto: `pnpm check:agent-context`.
