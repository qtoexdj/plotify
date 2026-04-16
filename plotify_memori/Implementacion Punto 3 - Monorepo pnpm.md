---
title: Implementacion Punto 3 - Monorepo pnpm
date: 2026-04-15
status: done
tags: implementacion, monorepo, pnpm, fastapi, nextjs
---
# Implementacion Punto 3 - Monorepo pnpm

## Objetivo

Migrar la estructura de dos repos hermanos a un workspace unico con pnpm, manteniendo LangGraph/FastAPI en Python para V1.

## Rutas objetivo

```text
apps/web              Next.js 16 + React 19
apps/api              FastAPI + LangGraph Python
packages/database     Supabase migrations, seed y tipos canonicos
packages/contracts    OpenAPI y clientes generados
```

## Reglas de path

- La DB sigue siendo canonica en `packages/database/supabase/migrations`.
- Los tipos Supabase canonicos siguen en `packages/database/types/database.generated.ts`.
- El wrapper frontend debe vivir en `apps/web/src/types/supabase.ts`.
- El contrato OpenAPI versionado debe vivir en `packages/contracts/openapi/plotify-chat.v1.json`.
- El cliente TS generado debe vivir en `apps/web/src/lib/services/plotify-chat.generated.ts`.
- El script de contrato debe ejecutarse desde `apps/api` o desde `apps/web` sin depender de las rutas legacy `plotify/` y `plotify_chat/`.

## Pasos

- [x] Crear `pnpm-workspace.yaml` en raiz.
- [x] Crear `package.json` raiz con scripts canonicos.
- [x] Mover `plotify/` a `apps/web`.
- [x] Mover `plotify_chat/` a `apps/api`.
- [x] Ajustar imports y scripts que apuntan a rutas legacy.
- [x] Actualizar documentacion operativa y memoria.
- [x] Verificar guardrail de migraciones.
- [x] Verificar generacion de contrato OpenAPI.
- [x] Verificar tests/base commands posibles.

## Estado

Punto 3 completado el 2026-04-15.

## Archivos implementados

- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `README.md`
- `.gitignore`
- `apps/web/**`
- `apps/api/**`
- `apps/web/tsconfig.typecheck.json`
- `apps/api/tests/conftest.py`

## Comandos verificados

- `pnpm install`
- `pnpm contracts:generate`
- `pnpm verify:migrations`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm test:api`

Resultados:

- Web tests: 23 archivos, 444 tests pasando.
- Backend tests: 72 passed, 2 skipped.
- Typecheck web: pasa.
- Guardrail migraciones: pasa.
- Generacion OpenAPI/cliente TS: pasa.

## Notas de implementacion

- Se mantuvieron los `.git` internos de `apps/web` y `apps/api` para no destruir historial ni cambios locales existentes.
- La consolidacion a un unico repositorio git raiz queda como decision operativa separada.
- El venv de `apps/api` conserva scripts con shebang absoluto antiguo; por eso el comando canonico usa `venv/bin/python -m pytest` en vez de `venv/bin/pytest`.
- Next vuelve a agregar `.next/dev/types/**/*.ts` al `tsconfig.json`; el typecheck canonico usa `tsconfig.typecheck.json` para evitar cache dev obsoleta.
