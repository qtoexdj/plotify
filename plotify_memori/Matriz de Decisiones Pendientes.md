---
title: Matriz de Decisiones Pendientes
date: 2026-04-14
tags:
  - decisiones
  - arquitectura
  - roadmap
status: draft
---

# Matriz de Decisiones Pendientes

> [!abstract]
> Esta matriz convierte la revision en decisiones accionables. La prioridad considera riesgo tecnico, impacto en producto y costo de revertir.

| Prioridad | Decision | Opciones | Recomendacion |
|---|---|---|---|
| Alta | Fuente de verdad de migraciones | Unificar en `plotify/supabase`; mover a raiz; mantener dividido con reglas | Aceptado: unificar en `packages/database/supabase/migrations` con baseline. |
| Alta | Contrato HTTP entre Next.js y FastAPI | Cliente manual; OpenAPI; route handlers Next.js como proxy | Aceptado: OpenAPI generado por FastAPI y cliente tipado en frontend. |
| Alta | Modelo de documentos legales | Preview local; preview/generacion backend; diccionario compartido | Aceptado: variables canonicas anidadas y render backend para aprobacion final. |
| Alta | Prompt Ops | DB directa desde Next.js; FastAPI protegido; hibrido | Segunda prioridad. Primero cerrar documentos, ventas, Telegram y contratos base. |
| Alta | Operaciones atomicas | Seguir multi-step en TS/Python; migrar a RPC; transacciones backend | Cualquier cambio de estado legal/comercial debe ser atomico. |
| Media | Cache de skills | TTL 5 min; invalidacion inmediata; realtime | Llamar `POST /skills/invalidate-cache` desde `toggleOrgSkill` o aceptar explicitamente el delay. |
| Media | Ownership de tenant en service-role | Confiar en frontend; verificar en backend; firmar payloads | Aceptado: verificar siempre en backend y derivar tenant desde recursos. |
| Media | MCP integrations | Server URL libre; providers allowlist; MCP broker propio | Allowlist + auditoria antes de produccion. |
| Media | Estructura de repos | Dos repos hermanos; monorepo; submodules | Aceptado: monorepo pnpm con `apps/web`, `apps/api`, `packages/database` y `packages/contracts`. Repo git unico creado en raiz y vinculado a `https://github.com/qtoexdj/plotify.git`. Pendiente: primer commit y push. |
| Baja | Comando pytest | `PYTHONPATH=. pytest`; package editable; pytest config | Resuelto: `pytest.ini` usa `pythonpath = .`; comando canonico `./venv/bin/pytest -q`. |

## ADRs aceptados

Estas decisiones quedan aceptadas en el vault:

- [[ADR-001 - Adoptar Monorepo pnpm]]
- [[ADR-002 - Supabase Migrations como Fuente Unica]]
- [[ADR-003 - Contrato Next FastAPI via OpenAPI]]
- [[ADR-004 - Variables Documentales Canonicas Anidadas]]
- [[ADR-005 - Preview y Generacion Documental desde Backend]]
- [[ADR-006 - Service Role con Validacion Tenant Explicita]]
- [[ADR-007 - Baseline DB para Monorepo]]
- [[ADR-008 - Mantener LangGraph en Python para V1]]

## Decisiones confirmadas 2026-04-14

- Plotify apunta primero a Chile y documentos legales chilenos.
- El objetivo de la proxima version es pilotear con clientes reales.
- La prioridad es arquitectura/migraciones/contratos primero, luego documentos y venta asistida a fondo.
- Supabase es fuente transaccional de verdad.
- `apps/web` sigue como app principal y `apps/api` como motor IA/documentos/mensajeria.
- Monorepo pnpm adoptado con `apps/web`, `apps/api`, `packages/database` y `packages/contracts`.
- Migrations viviran en `packages/database/supabase/migrations`.
- FastAPI seguira en Python para V1.
- OpenAPI sera contrato formal entre Next.js y FastAPI.
- Variables documentales seran anidadas.
- Documentos finales siempre se validan con render backend.
- Service role exige validacion tenant explicita.
- Prompt Ops queda como segunda prioridad.
- Telegram y MCP entran en el cierre, con Telegram como canal operacional principal.

## Roadmap de estabilizacion recomendado

- [x] 1. Crear baseline DB y fuente unica de migraciones.
- [x] 2. Formalizar OpenAPI y validacion tenant en FastAPI.
- [x] 3. Migrar a monorepo pnpm manteniendo LangGraph en Python.
- [ ] 4. Cerrar flujo comercial reserva/venta con Telegram.
- [ ] 5. Cerrar documentos de reserva V1.
- [ ] 6. Cerrar escritura V1.
- [ ] 7. Pulir UX responsive y preparar piloto.
- [ ] 8. Recién despues retomar Prompt Ops como segunda prioridad.

Estado 2026-04-15:

- Punto 1 cerrado y reforzado con guardrail ejecutable: `npm --prefix packages/database run verify:migrations`.
- Punto 2 cerrado segun [[Backlog Implementable - Cierre Plotify]]: OpenAPI versionado, cliente frontend tipado y validacion tenant en backend.
- Punto 3 cerrado segun [[Implementacion Punto 3 - Monorepo pnpm]]: workspace pnpm, rutas `apps/web` y `apps/api`, comandos canonicos y verificaciones base.
- Consolidacion operativa documentada en [[Implementacion Punto 4 - Consolidacion Operativa Monorepo]]: docs duplicados removidos, prompts/workflows apuntan a memoria, `.gitignore` monorepo y endpoint del visor restaurado.
- Siguiente punto activo de producto: punto 4, cerrar flujo comercial reserva/venta con Telegram.

## Decision framing

La pregunta central para cada feature nueva debe ser:

- Que sistema es fuente de verdad?
- Que contrato cruza entre sistemas?
- Que tabla o migracion lo respalda?
- Que test prueba el contrato?
- Que rollback existe si falla a mitad?

## Relacionado

- [[Revision Integral 2026-04-14]]
- [[Mapa de Integracion Frontend Backend]]
- [[Riesgos y Brechas Tecnicas]]
- [[Roadmap Plotify]]
- [[PRD - Cierre Plotify Piloto Clientes]]
- [[Hoja de Ruta - Cierre Plotify Piloto Clientes]]
- [[Backlog Implementable - Cierre Plotify]]



## Decision cerrada 2026-04-14

La decision Fuente de verdad de migraciones fue implementada en [[Implementacion Punto 1 - Congelar DB Supabase]].

Estado: cerrada. Fuente activa: packages/database/supabase/migrations. Las rutas legacy de migraciones fueron removidas despues de validar reset.

Nueva decision pendiente derivada: definir versionado de packages/database desde el repo raiz del monorepo.

## Decision operativa cerrada 2026-04-16

Crear un repo git unico en la raiz del monorepo.

Resultado:

- `.git` internos de `apps/web` y `apps/api` eliminados.
- `git init` ejecutado en la raiz.
- Rama principal configurada como `main`.
- `origin` configurado como `https://github.com/qtoexdj/plotify.git`.
- Pendiente derivado: hacer el primer commit y push del monorepo completo.

Motivo:

- Los cambios cruzan frontend, backend y packages.
- El `.gitignore` raiz solo aplica correctamente si la raiz es el repo activo.
- CI/CD, releases y PRs deben representar el sistema completo.
