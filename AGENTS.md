# Plotify — instrucciones para agentes

Este es el único archivo de instrucciones automáticas del repositorio. Responde siempre en español y empieza cada sesión leyendo [memory.md](memory.md). `memory.md` es estado operativo; no sustituye código, SDD ni esta norma.

## Inicio de trabajo

1. Lee `memory.md`, identifica la feature activa y luego abre sus `plan.md` y `tasks.md`.
2. Ejecuta `git status --short`, preserva cambios ajenos y ejecuta `codegraph sync .`.
3. Usa CodeGraph para estructura, símbolos, callers, callees e impacto antes de editar código.
4. Consulta sólo las notas necesarias de `plotify_memori/`; nunca uses `plotify_memori/.obsidian/` como fuente de producto.
5. Para una librería, SDK, CLI, API o servicio cloud, usa Context7: primero resuelve la librería y después consulta documentación vigente. No lo uses para lógica local ni refactors.
6. Antes de tareas complejas, selecciona y usa la skill aplicable. Registra en `memory.md` sólo las skills efectivamente usadas, con motivo y resultado.

El mapa técnico del vault está en [Mapa Técnico Actual](plotify_memori/30%20-%20Arquitectura/Mapa%20T%C3%A9cnico%20Actual.md).

## Fuentes de verdad

| Dominio | Fuente |
| --- | --- |
| Alcance e instrucciones | Sistema y usuario |
| Procedimiento de agentes | Este archivo |
| Principios de ingeniería | `.specify/memory/constitution.md` |
| Intención y tarea actual | Feature activa en `specs/` |
| Comportamiento y versiones reales | Código, manifiestos, lockfiles, migraciones y tests |
| Producto, arquitectura e historial | `plotify_memori/` |
| Estado y correcciones entre sesiones | `memory.md` |

No resuelvas conflictos en silencio: registra la discrepancia, contrástala con evidencia y pide decisión si afecta producto, seguridad o alcance. El código describe el comportamiento actual; el SDD, el esperado.

## Flujo SDD

Spec Kit gobierna el ciclo `constitution → specify → clarify → plan → tasks → analyze → implement`.

- Tras cambiar constitution, spec, plan o tasks, ejecuta o solicita `$speckit-analyze`. No implementes con hallazgos `CRITICAL` pendientes.
- Implementa una sola tarea pendiente por ciclo y respeta orden y dependencias, salvo instrucción explícita del usuario.
- Ejecuta el `Verify` de la tarea. Marca `[x]` sólo con aceptación y Verify verde, o autorización expresa del usuario.
- Si una tarea cruza más de cinco archivos o mezcla DB/API/web sin ser integración declarada, divídela o pide confirmación.
- Al crear o cerrar una feature actualiza `memory.md`. Al cerrar un SDD o hito documental usa `$plotify-sdd-handoff`.

## Arquitectura y seguridad

- Plotify es un monorepo pnpm: Next.js web, FastAPI/LangGraph/ARQ en API y worker, Supabase PostgreSQL y contratos OpenAPI generados. Confirma versiones desde manifiestos antes de implementar.
- Supabase es cloud-only, proyecto `swkrnjdpnlrgxgotmfxy`. Nunca uses Supabase local, Docker, `supabase start`, `--local`, resets ni generación/tipo local. Inspecciona mediante Supabase MCP; usa comandos linked sólo cuando el flujo lo requiera.
- Migraciones: sólo `packages/database/supabase/migrations`. OpenAPI: FastAPI/Pydantic es la fuente; no edites manualmente `packages/contracts/openapi/plotify-chat.v1.json`.
- Service role deriva y valida tenant desde recursos persistidos; no confíes en `organization_id` del cliente. No expongas secretos, URLs internas, service role o tokens.
- Webhooks responden rápido y encolan trabajo. API, LangGraph, Redis y egress son asíncronos; llamadas externas usan hosts permitidos, payload validado, timeout total máximo de 10 s, redacción y reintentos idempotentes.
- Server Components por defecto. Para archivos externos, valida magic bytes y MIME en servidor antes de subirlos.

## Calidad

- Web: `pnpm --filter web lint`, `pnpm format:check`, `pnpm build:web`.
- Tipos/contratos: además `pnpm typecheck:web`.
- API/workers: `pnpm test:api`.
- DB/migraciones: `pnpm verify:migrations` y tests linked no destructivos.
- Contrato API: `pnpm contracts:generate`.

Reporta gates imposibles y no cierres tareas sin aprobación explícita.

## Memoria y Obsidian

- `memory.md` es breve, con fuente y fecha de verificación para estado, correcciones, decisiones y skills usadas.
- `plotify_memori/` es el vault profundo de Obsidian: producto, arquitectura, decisiones y handoffs. No copies el vault a memoria.
- Registra correcciones del usuario como pendientes hasta verificarlas con código, SDD, pruebas, CodeGraph o decisión explícita.
- Al terminar una tarea, actualiza memoria sólo por hechos durables. Al cerrar SDD actualiza vault, Home, handoff y —sólo ante una regla general estable— este archivo.

Ejecuta `pnpm check:agent-context` tras modificar AGENTS, memory, el mapa técnico o la feature activa.
