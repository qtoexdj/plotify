---
title: Backlog Implementable - Cierre Plotify
date: 2026-04-14
tags:
  - backlog
  - roadmap
  - tareas
  - piloto
status: draft
---

# Backlog Implementable - Cierre Plotify

> [!summary]
> Backlog ordenado por dependencias. Cada tarea debe terminar con verificacion objetiva para evitar avances "90% listo".

## Fase 0 - Fundamentos

- [x] Task 0.1: Crear baseline Supabase desde DB local validada.
  - Acceptance: `packages/database/supabase/migrations` contiene baseline reproducible.
  - Verify: `supabase db reset` recrea tablas, funciones y buckets necesarios.
  - Files: `packages/database/supabase/migrations/**`.
  - Estado 2026-04-14: completado en [[Implementacion Punto 1 - Congelar DB Supabase]]. Fuente canonica: `packages/database/supabase/migrations`.

- [x] Task 0.2: Generar tipos TypeScript desde Supabase.
  - Acceptance: frontend consume tipos generados desde fuente unica.
  - Verify: `supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public > packages/database/types/database.generated.ts`.
  - Files: `packages/database/types/**`, `apps/web/src/types/**`.
  - Estado 2026-04-15: completado con `packages/database/types/database.generated.ts`. `plotify/src/types/supabase.ts` queda como wrapper estable que reexporta los tipos canonicos generados.

- [x] Task 0.3: Exportar OpenAPI de FastAPI y definir cliente tipado.
  - Acceptance: rutas de documentos, reservas, ventas y Telegram quedan tipadas.
  - Verify: script de generacion de cliente corre sin errores.
  - Files: `apps/api/**`, `packages/contracts/**`, `apps/web/src/lib/services/**`.
  - Estado 2026-04-15: completado para contrato versionado `packages/contracts/openapi/plotify-chat.v1.json` y tipos frontend `plotify/src/lib/services/plotify-chat.generated.ts`. Script canonico: `cd plotify && npm run contracts:generate`.

- [x] Task 0.4: Corregir tenant validation para endpoints service-role.
  - Acceptance: backend no confia en `organization_id` enviado por frontend.
  - Verify: tests de acceso cross-tenant fallan correctamente.
  - Files: `apps/api/api/deps.py`, endpoints FastAPI, tests backend.
  - Estado 2026-04-15: completado para documentos preview/generate y reserva approval. Backend deriva tenant desde `lot_id` y rechaza `organization_id` cruzado.

- [x] Task 0.5: Corregir advisors criticos de Supabase.
  - Acceptance: funciones `SECURITY DEFINER` tienen `search_path` fijo e indices FK criticos existen.
  - Verify: advisors de seguridad/performance reducen warnings priorizados.
  - Files: migraciones Supabase.
  - Estado 2026-04-14: completado con `20260414000200_fix_security_definer_search_path.sql` y `20260414000300_add_missing_fk_indexes.sql`.
  - Caveat: queda warning no bloqueante de `public.approve_reservation` por variable `v_lot` declarada y no usada.

## Fase 1 - Monorepo

- [x] Task 1.1: Crear estructura pnpm workspace.
  - Acceptance: repo raiz contiene `pnpm-workspace.yaml` y apps/packages definidos.
  - Verify: `pnpm install`.
  - Files: raiz, `apps/**`, `packages/**`.
  - Estado 2026-04-15: completado en [[Implementacion Punto 3 - Monorepo pnpm]].

- [x] Task 1.2: Mover `plotify/` a `apps/web`.
  - Acceptance: Next.js mantiene build y tests.
  - Verify: `pnpm --filter web typecheck` y `pnpm --filter web test`.
  - Files: `apps/web/**`.
  - Estado 2026-04-15: completado en [[Implementacion Punto 3 - Monorepo pnpm]].

- [x] Task 1.3: Mover `plotify_chat/` a `apps/api` sin migrar a TypeScript.
  - Acceptance: pytest sigue pasando con comando documentado.
  - Verify: `pnpm test:api`.
  - Files: `apps/api/**`.
  - Estado 2026-04-15: completado en [[Implementacion Punto 3 - Monorepo pnpm]]. FastAPI/LangGraph sigue en Python.

- [x] Task 1.4: Documentar comandos canonicos.
  - Acceptance: Obsidian y README explican setup y verificacion.
  - Verify: nuevo dev puede seguir comandos sin conocimiento tribal.
  - Files: `plotify_memori/Setup Local.md`, README raiz.
  - Estado 2026-04-15: completado en `README.md`, `package.json` raiz y [[Setup Local]].
  - Actualizacion 2026-04-16: scripts `pnpm dev:api` y `pnpm dev:worker` agregados; `dev:worker` evita el shebang roto del venv movido.

- [x] Task 1.5: Consolidar documentacion operativa en memoria.
  - Acceptance: docs duplicados del repo apuntan a `plotify_memori/` o son eliminados.
  - Verify: no quedan referencias activas a `apps/api/docs`, `apps/web/src/context` como fuente canonica ni planes raiz eliminados.
  - Files: `plotify_memori/**`, `.agent/**`, `.github/prompts/**`, README operativos.
  - Estado 2026-04-16: completado en [[Implementacion Punto 4 - Consolidacion Operativa Monorepo]].

- [x] Task 1.6: Restaurar endpoint del visor geometrico.
  - Acceptance: `GET /api/viewer/[projectId]/feature-collection` existe y compila.
  - Verify: `pnpm --filter web typecheck`.
  - Files: `apps/web/src/app/api/viewer/[projectId]/feature-collection/route.ts`.
  - Estado 2026-04-16: completado.

- [x] Task 1.7: Crear repo git unico en la raiz.
  - Acceptance: la raiz contiene `.git` y `apps/web`/`apps/api` dejan de ser repos internos.
  - Verify: `git status` desde la raiz muestra el monorepo completo y no hay `.git` internos.
  - Files: `.git`, estructura del repo.
  - Estado 2026-04-16: completado. `find . -maxdepth 3 -name .git -type d -print` muestra solo `./.git`; `origin` apunta a `https://github.com/qtoexdj/plotify.git`; rama actual `main`.

- [ ] Task 1.7.1: Hacer primer commit y push del monorepo.
  - Acceptance: `origin/main` contiene el estado inicial del monorepo.
  - Verify: `git log --oneline -1` y `git status --short` sin archivos pendientes no intencionales.
  - Files: repo completo.
  - Nota: revisar `git status --short --ignored=matching` antes de publicar para confirmar que secretos y artefactos pesados sigan ignorados.

- [ ] Task 1.8: Recrear venv del backend post-migracion.
  - Acceptance: todos los binarios de `apps/api/venv/bin/*` apuntan a la ruta actual.
  - Verify: `apps/api/venv/bin/arq --help` funciona sin `bad interpreter`.
  - Files: `apps/api/venv` local no versionado.

## Fase 2 - Reserva/Venta

- [ ] Task 2.1: Definir modelo de eventos por lote.
  - Acceptance: historial representa reserva, liberacion, venta y documentos.
  - Verify: tests DB/API para historial.
  - Files: migraciones, tipos, servicios.

- [ ] Task 2.2: Unificar formulario vendedor para comprador.
  - Acceptance: datos del comprador alimentan variables canonicas.
  - Verify: test de mapeo comprador -> `cliente.*`.
  - Files: UI vendedor, server actions, tipos.

- [ ] Task 2.3: Implementar solicitud de reserva con aprobacion Telegram.
  - Acceptance: admin recibe solicitud y puede aceptar/rechazar.
  - Verify: test endpoint + prueba manual Telegram en entorno dev.
  - Files: FastAPI Telegram, workers, acciones frontend.

- [ ] Task 2.4: Implementar solicitud de venta con aprobacion Telegram.
  - Acceptance: venta aprobada cambia estado y dispara flujo documental.
  - Verify: test de estado de lote y audit log.
  - Files: endpoints, RPC/transaccion, tests.

- [ ] Task 2.5: Registrar audit logs comerciales.
  - Acceptance: precio, reserva, venta, liberacion y aprobaciones quedan auditadas.
  - Verify: tests de insercion en `audit_logs`.
  - Files: servicios backend/DB.

## Fase 3 - Documentos Reserva V1

- [ ] Task 3.1: Crear contrato `DocumentVariables` anidado.
  - Acceptance: DB seeds, frontend y backend usan nombres compatibles.
  - Verify: tests de resolucion de variables.
  - Files: `packages/contracts`, backend document engine, frontend types.

- [ ] Task 3.2: Crear template activo de reserva por proyecto.
  - Acceptance: cada proyecto puede tener una plantilla unica activa.
  - Verify: constraint/test de template activo.
  - Files: migraciones, servicios documentos.

- [ ] Task 3.3: Redisenar builder de documentos.
  - Acceptance: bloques editables y preview responsive.
  - Verify: prueba manual desktop/movil, tests de componentes criticos.
  - Files: componentes documentos.

- [ ] Task 3.4: Implementar deteccion de variables faltantes.
  - Acceptance: admin ve faltantes y decide bloquear o generar con linea.
  - Verify: tests con variables incompletas.
  - Files: backend engine, UI preview.

- [ ] Task 3.5: Generar PDF/DOCX de reserva con snapshot y version.
  - Acceptance: documento versionado queda trazado por lote.
  - Verify: test backend y revision manual de archivos generados.
  - Files: generator, storage, DB.

- [ ] Task 3.6: Envio por Telegram de documento aprobado.
  - Acceptance: admin elige destinatarios.
  - Verify: prueba manual Telegram.
  - Files: Telegram service, endpoints, audit logs.

## Fase 4 - Escritura V1

- [ ] Task 4.1: Inventariar variables de escritura.
  - Acceptance: lista canonica cubre dominio, roles, SAG, plano, comprador y geometria.
  - Verify: revision humana con ejemplos reales.
  - Files: Obsidian, contracts.

- [ ] Task 4.2: Modelar datos legales faltantes.
  - Acceptance: DB soporta datos de dominio, roles, SAG y plano.
  - Verify: migracion y tipos generados.
  - Files: migrations, types, UI.

- [ ] Task 4.3: Extraer/cargar datos desde documentos legales.
  - Acceptance: admin puede subir documentos y completar variables relevantes.
  - Verify: prueba con documentos reales o fixtures.
  - Files: upload, parser, UI.

- [ ] Task 4.4: Generar escritura PDF/DOCX.
  - Acceptance: escritura usa template activo y datos validados.
  - Verify: test backend y revision legal manual.
  - Files: document engine, generator, templates.

## Fase 5 - Piloto

- [ ] Task 5.1: Hardening responsive movil.
  - Acceptance: admin y vendedor completan flujos desde movil.
  - Verify: screenshots y prueba manual en viewports moviles.
  - Files: UI dashboard, documentos, venta.

- [ ] Task 5.2: Crear guia de operacion piloto.
  - Acceptance: admin y vendedor tienen pasos claros.
  - Verify: prueba con usuario no tecnico.
  - Files: Obsidian, posible README operativo.

- [ ] Task 5.3: Configurar deploy Railway coordinado.
  - Acceptance: web, api y servicios necesarios despliegan con variables documentadas.
  - Verify: smoke test en ambiente Railway.
  - Files: Railway config, env docs.

## Checkpoints

### Checkpoint A - Fundamentos

- [x] DB reproducible.
- [x] OpenAPI tipado.
- [x] Tenant validation probada.
- [x] Build/test base corren.

## Verificacion de estado - 2026-04-14

Corroborado contra memoria y codigo:

- DB reproducible: implementada en `packages/database`. La carpeta canonica contiene baseline, hardening de `search_path` e indices FK.
- Monorepo: implementado. La raiz contiene `pnpm-workspace.yaml`; `apps/web` y `apps/api` son las rutas canonicas.
- Tipos Supabase: implementados en `packages/database/types/database.generated.ts`; `apps/web/src/types/supabase.ts` reexporta desde esa fuente canonica.
- OpenAPI/cliente tipado: implementado. FastAPI exporta contrato versionado a `packages/contracts/openapi/plotify-chat.v1.json` y genera tipos TS en `apps/web/src/lib/services/plotify-chat.generated.ts`.
- Frontend tests: `pnpm --filter web test` pasa: 23 archivos, 444 tests.
- Frontend typecheck: `pnpm --filter web typecheck` pasa.
- Backend tests: `pnpm test:api` pasa: 72 passed y 2 skipped.
- Documentos: preview/generate usan contrato tipado desde OpenAPI. Frontend envia `organization_id` derivado del lote para generate y backend valida que corresponda al `lot_id`. La respuesta actual canonica de generate sigue siendo `{ file_url, format }`; `document_id` queda para corregir en el punto de contrato documentos.
- Prompt Ops: sigue pendiente como segunda prioridad; frontend y backend no coinciden en rutas de activate/sandbox ni en header de super-admin.

## Verificacion de infraestructura local - 2026-04-15

Corroborado contra Docker, `.env` y smoke tests:

- Stack accidental `supabase_*_plotify`: eliminado.
- Supabase local operativo: stack Docker compartido con `supabase-kong` en `http://127.0.0.1:8000`.
- Redis local operativo: contenedor `redis` en `redis://localhost:6379/0`.
- `apps/api/.env`: `SUPABASE_URL`, `SUPABASE_DB_URL` y `REDIS_URL` apuntan a contenedores existentes.
- LangGraph checkpointer: inicializa tablas en PostgreSQL mediante `SUPABASE_DB_URL`; no cae a memoria RAM.
- Backend tests posteriores: `./venv/bin/pytest -q` pasa con 72 passed y 2 skipped.

### Checkpoint B - Comercial

- [ ] Reserva aprobada por Telegram.
- [ ] Venta aprobada por Telegram.
- [ ] Historial por lote visible.
- [ ] Audit logs minimos.

### Checkpoint C - Documentos

- [ ] Reserva PDF/DOCX real.
- [ ] Snapshot y versionado.
- [ ] Variables faltantes manejadas.
- [ ] Envio Telegram.

### Checkpoint D - Piloto

- [ ] Flujo movil usable.
- [ ] Deploy Railway operativo.
- [ ] Primer cliente puede pilotear.

## Relacionado

- [[PRD - Cierre Plotify Piloto Clientes]]
- [[Hoja de Ruta - Cierre Plotify Piloto Clientes]]
- [[Revision Base de Datos Supabase 2026-04-14]]
