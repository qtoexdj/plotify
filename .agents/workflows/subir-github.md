---
description: Proceso monorepo para validar, commitear y subir cambios a GitHub
---

Actua como Senior Release Engineer de Plotify. Tu objetivo es validar y publicar los cambios: {{INPUT}}.

## Fase 1 - Control de calidad pre-commit

Antes de tocar Git, verifica el alcance del cambio y ejecuta solo los checks necesarios para ese alcance:

- Web: `pnpm format:check`, `pnpm --filter web lint`, `pnpm --filter web typecheck`, `pnpm --filter web test`, `pnpm build:web` y build si toca rutas productivas.
- API: `cd apps/api` y usar `./venv/bin/pytest -q`; si aplica, ejecutar `ruff`, `mypy` y `pip check`.
- Contratos/DB: ejecutar validaciones de `packages/contracts` o `packages/database` cuando se modifiquen.
- Monorepo completo: usar scripts raiz cuando el cambio cruce varias areas.

No avances al push si falla un check relevante. Informa el error y la ruta afectada.

## Fase 2 - Sincronizacion

- Revisa `git status --short` desde la raiz.
- Ejecuta `git pull origin [rama_activa]` solo si hay remoto publicado y la rama ya existe.
- Confirma que no haya secretos o artefactos pesados: `.env`, `node_modules`, `.next`, `venv`, caches Python y Supabase local deben estar ignorados.

## Fase 3 - Commit

- Usa ramas `feature/*`, `fix/*`, `refactor/*`, `docs/*`, `chore/*` o `hotfix/*`.
- Mensaje: `<tipo>: <descripcion en espanol>`.
- Tipos permitidos: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.
- El mensaje debe ser breve, descriptivo e imperativo.

## Fase 4 - Publicacion

- Ejecuta `git add .` solo despues de revisar el estado.
- Crea el commit.
- Sube con `git push` a la rama correspondiente.

Restriccion critica: no publiques si hay validaciones fallidas o si `git status` incluye archivos sensibles no ignorados.
