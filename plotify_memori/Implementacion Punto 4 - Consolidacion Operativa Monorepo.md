---
title: Implementacion Punto 4 - Consolidacion Operativa Monorepo
date: 2026-04-16
status: done
tags:
  - implementacion
  - monorepo
  - documentacion
  - git
  - frontend
  - backend
---

# Implementacion Punto 4 - Consolidacion Operativa Monorepo

> [!summary]
> Se centralizo la documentacion en `plotify_memori/`, se amplio el `.gitignore` para operar como monorepo, se corrigieron comandos de arranque y se restauro el endpoint que alimenta el visor geometrico.

## Objetivo

Reducir duplicacion documental y dejar el workspace listo para funcionar como monorepo unico con:

- Documentacion canonica en `plotify_memori/`.
- Ignorados coherentes para Next.js, Python/FastAPI, Supabase local, caches y secretos.
- Comandos raiz para levantar frontend, API y worker.
- Visor geometrico operativo despues de eliminar documentacion legacy.

## Cambios realizados

### Limpieza de documentacion duplicada

Se eliminaron archivos `.md` cuyo contenido ya estaba cubierto por la memoria:

- `apps/api/docs/*.md`
- `apps/api/plan-microservicio.md`
- `apps/web/docs/cad-freeze.md`
- `apps/web/plan-frontend.md`
- `apps/web/src/context/Plotify Roadmap V1-v2.md`
- `apps/web/src/context/README.md`
- `apps/web/src/context/architecture-chat-microservicio.md`
- `apps/web/src/context/workflow.md`
- `auditoria-tecnica.md`
- `plan-base-de-datos.md`
- `plan-fase4-documentos.md`
- `plan-frontend.md`
- `plan-microservicio.md`
- `public/implementacion.md`
- `roadmap-v2.md`

Se mantuvieron por decision explicita:

- `README.md`
- `apps/api/README.md`
- `apps/web/README.md`
- `apps/web/docs/ejemplo_deslinde.md`
- `apps/web/docs/ejemplo_servidumbre.md`
- `apps/web/src/context/architecture-cad-microservicio.md`
- `apps/web/src/context/architecture-microservicio.md`
- `apps/web/src/context/product-microservicio.md`
- `arquitectura-atomica-de-escrituras.md`
- `packages/database/README.md`
- reglas, prompts y workflows de agentes.

### Prompts y workflows apuntan a memoria

Se actualizaron referencias para evitar que agentes vuelvan a recrear `apps/api/docs/` o `apps/web/src/context/` como fuente primaria.

Fuente canonica:

- `plotify_memori/Arquitectura General.md`
- `plotify_memori/Schema General BD.md`
- `plotify_memori/Vision y Alcance.md`
- `plotify_memori/PRD - Cierre Plotify Piloto Clientes.md`
- notas especificas por dominio dentro de `plotify_memori/`

### Agente centralizado

Antes del primer commit del monorepo, la configuracion de agentes quedo centralizada en `.agents/` en la raiz:

- Se copiaron las reglas locales:
  - `apps/api/.agents/rules/plotify-chat.md` -> `.agents/rules/plotify-chat.md`
  - `apps/web/.agent/rules/plotify-rules.md` -> `.agents/rules/plotify-rules.md`
- Se centralizaron workflows en `.agents/workflows/`.
- Los workflows duplicados `actualizar-contexto` y `subir-github` se fusionaron en versiones monorepo.
- Se copiaron solo las skills faltantes por nombre desde API y web.
- `.agents/skills` queda con 172 skills unicas.
- Se eliminaron los agentes locales `apps/api/.agents` y `apps/web/.agent`.

### `.gitignore` monorepo

Se amplio el `.gitignore` raiz para cubrir:

- dependencias y caches Node/pnpm
- salidas Next.js (`.next`, `out`, `build`, `dist`)
- entornos y caches Python (`venv`, `.venv`, `__pycache__`, `.pytest_cache`, `.ruff_cache`, `.mypy_cache`)
- artefactos de tests (`coverage`, `test-results`, `playwright-report`)
- Supabase local (`**/supabase/.branches`, `**/supabase/.temp`)
- secretos (`.env`, `.env.*`) manteniendo `!.env.example`
- estado local de Obsidian (`**/.obsidian/workspace*.json`)

Tambien se ajustaron los `.gitignore` locales de `apps/web` y `apps/api` para mantener cobertura local si esas apps se inspeccionan fuera del repo raiz.

### Comandos de desarrollo

Se agregaron scripts raiz:

```bash
pnpm dev:api
pnpm dev:worker
```

El script `dev:worker` evita el wrapper `apps/api/venv/bin/arq`, porque el venv fue movido desde `plotify_chat/` y ese binario conservaba un shebang absoluto roto.

Comando usado:

```bash
cd apps/api && ./venv/bin/python -c "from arq.cli import cli; raise SystemExit(cli())" workers.main_worker.WorkerSettings
```

> [!warning]
> Solucion correcta de largo plazo: recrear `apps/api/venv` despues de mover el backend al monorepo.

### Visor geometrico

El visor fallaba con:

```text
GET /api/viewer/[projectId]/feature-collection 404
```

Causa:

- `GeometryViewer` llama `/api/viewer/${projectId}/feature-collection`.
- La route handler `apps/web/src/app/api/viewer/[projectId]/feature-collection/route.ts` habia quedado eliminada.

Fix:

- Se restauro la route handler.
- La route llama `getFeatureCollection(projectId)` desde `apps/web/src/lib/services/viewer.service.ts`.
- Se valido con `pnpm --filter web typecheck`.

## Estado git

El workspace quedo vinculado como repo unico:

- Se eliminaron los `.git` internos de `apps/web` y `apps/api`.
- Se ejecuto `git init` en la raiz del monorepo.
- La rama principal quedo como `main`.
- `origin` quedo vinculado a `https://github.com/qtoexdj/plotify.git`.
- Queda pendiente hacer el primer commit y push del monorepo completo.

## Validaciones ejecutadas

- `pnpm --filter web typecheck`: pasa.
- `find . -maxdepth 3 -name .git -type d -print`: muestra solo `./.git`.
- `git remote -v`: `origin` apunta a `https://github.com/qtoexdj/plotify.git`.
- `git branch --show-current`: `main`.
- `find apps -maxdepth 3 \( -path '*/.agents' -o -path '*/.agent' \) -print`: sin resultados.
- `find .agents/skills -mindepth 1 -maxdepth 1 -type d | wc -l`: 172.
- `git check-ignore` en `apps/web`: `.env` ignorado y `.env.example` permitido.
- `git check-ignore` en `apps/api`: `.env` ignorado y `.env.example` permitido.
- `git check-ignore` desde la raiz: `.env`, `node_modules`, `.next`, `venv`, caches Python y Supabase local quedan ignorados.
- `apps/api/venv/bin/python --version`: venv operativo.
- `apps/api/venv/bin/python -c "import arq"`: ARQ importable.

## Pendiente derivado

- Recrear `apps/api/venv` para corregir todos los binarios con shebang antiguo.
- Hacer el primer commit y push inicial a `origin/main`.
- Decidir si los archivos `apps/web/src/context/*-microservicio.md` que quedan se migran tambien a memoria o se mantienen como contexto operacional local.
- Ejecutar smoke test manual del visor con `pnpm dev:web` activo y datos reales.

## Relacionado

- [[Setup Local]]
- [[Rutas y Endpoints API]]
- [[Implementacion Punto 3 - Monorepo pnpm]]
- [[Matriz de Decisiones Pendientes]]
- [[Backlog Implementable - Cierre Plotify]]
