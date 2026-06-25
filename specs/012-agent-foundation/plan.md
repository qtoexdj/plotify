# Implementation Plan: Fundacion Operativa del Agente Plotify

**Branch**: `012-agent-foundation` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-agent-foundation/spec.md`

## Summary

Consolidar el agente LangGraph de Plotify como una capacidad de plataforma
multi-tenant: skills definidas en markdown, persistidas en el catalogo runtime,
versionables, activables por organizacion y limitadas a tools aprobadas por rol.
El primer slice E2E es vendedor por Telegram: consultar lotes asignados y
solicitar reservas, siempre bajo reglas deterministicas, confirmacion
administrativa y auditoria.

El enfoque tecnico reutiliza el runtime actual (`agent/graph.py`,
`agent/skill_registry.py`, Telegram webhook/worker, `approval_requests`,
`org_skill_configs`) y lo endurece en cuatro ejes: modelo de skills
versionadas, invalidacion inmediata del cache runtime, ejecucion de tools con
contexto confiable de organizacion/rol, y registro seguro de bots Telegram con
`secret_token`.

## Technical Context

**Language/Version**: Python 3.13+ en `apps/api`; TypeScript 5, React 19 y
Next.js 16 en `apps/web`.

**Primary Dependencies**: FastAPI/Pydantic, LangGraph/LangChain, Redis/ARQ,
Supabase/PostgreSQL, httpx, Next.js App Router, shadcn/ui/Tailwind 4, Telegram
Bot API.

**Storage**: Supabase PostgreSQL como fuente de verdad. Redis solo para colas y
cache efimero. Migracion aditiva bajo
`packages/database/supabase/migrations` para extender `agent_skills` y agregar
versionado de skills custom.

**Testing**: `pnpm test:api`, `pnpm test:web` para flujos web criticos,
`pnpm typecheck:web`, `pnpm --filter web lint`, `pnpm format:check`,
`pnpm build:web`, `pnpm contracts:generate`, `pnpm verify:migrations`.

**Target Platform**: Web desktop para administradores; FastAPI + worker para
runtime del agente; Telegram movil para vendedores.

**Project Type**: Monorepo web + API + worker + base Supabase.

**Performance Goals**: El vendedor completa consulta de disponibilidad +
solicitud de reserva por Telegram en menos de 2 minutos; toggles de skills
afectan el siguiente mensaje nuevo de la organizacion/rol; llamadas externas
con timeout maximo de 10 segundos.

**Constraints**: Sin autonomia completa del agente; sin tools arbitrarias
creadas desde UI; acciones sensibles pasan por reglas o confirmacion humana;
`organization_id` y rol se obtienen de contexto confiable, no de texto del
usuario ni de argumentos inventados por el modelo; aislamiento por tenant y
vendedor; auditoria Nivel B.

**Scale/Scope**: 5 user stories. Superficies principales: admin de skills,
modal/editor de custom skill, runtime de skills, webhook/worker Telegram,
registro de bot, y contratos/tests de API/web.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio                                  | Cumplimiento                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Producto piloto primero**             | El primer slice es vendedor por Telegram, consulta de lotes asignados y reserva con aprobacion humana, parte explicita del core V1. PASS                                                       |
| **II. Geometria como origen**              | La feature no altera KMZ/deslindes; consume lotes/proyectos existentes como fuente operativa. PASS                                                                                             |
| **III. Supabase y migraciones canonicas**  | Skills, configuracion, auditoria y solicitudes viven en Supabase. Toda migracion queda en `packages/database/supabase/migrations`. PASS                                                        |
| **IV. Contratos tipados**                  | Cambios de FastAPI/Pydantic requieren `pnpm contracts:generate`; la web no edita contratos generados a mano. PASS                                                                              |
| **V. Seguridad multi-tenant y vendedores** | La ejecucion se limita por organizacion, rol, perfil Telegram vinculado y `vendor_projects`; acciones sensibles quedan auditadas. PASS                                                         |
| **VI. Testing y gates**                    | Plan exige tests API para Telegram/skills/runtime, tests web para admin de skills, contratos, migraciones y build web. PASS                                                                    |
| **Integraciones externas seguras**         | Telegram usa allowlist de host en cliente existente; registro de bot debe alinear `secret_token`; MCP futuro no ejecuta sin conexion aprobada y debe bajar timeouts a <=10s si se activa. PASS |

**Resultado**: PASS sin desviaciones constitucionales.

## Project Structure

### Documentation (this feature)

```text
specs/012-agent-foundation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-contracts.md
│   └── ui-contracts.md
└── tasks.md              # Pendiente: /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── agent/
│   ├── graph.py                         # inyectar contexto confiable y prompts con skills markdown
│   ├── skill_registry.py                # resolver builtin/custom/MCP gated + cache inmediato
│   └── tools/                           # tools aprobadas existentes
├── api/v1/endpoints/
│   ├── skills.py                        # invalidacion + validacion runtime de skills
│   ├── bots.py                          # setWebhook con secret_token
│   ├── webhook.py                       # webhook Telegram seguro
│   └── approvals.py                     # reserva sigue pendiente, nunca auto-aprobada
├── integrations/
│   ├── telegram_client.py               # allowlist/timeout ya existe; conservar
│   └── mcp_gateway.py                   # solo preparado; timeouts <=10s al activarlo
├── workers/tasks/
│   └── message_processor.py             # flujo vendedor Telegram y comandos deterministas
└── schemas/
    ├── approval.py
    └── agent_skills.py                  # nuevo/extendido para contratos Pydantic

apps/web/src/
├── app/(dashboard)/agente/skills/       # catalogo y editor custom
├── actions/agent-skills.action.ts       # toggle/create/update + invalidacion API
├── components/dashboard/skills/         # grid, detail modal, editor markdown
├── lib/services/agent-skills.service.ts # carga catalogo por org
└── types/v2.ts                          # tipos generados DB/OpenAPI

packages/database/supabase/migrations/
└── 20260622xxxxxx_agent_foundation.sql  # scope org, markdown, versionado de skills
```

**Structure Decision**: Reusar el monorepo existente. No crear un servicio de
agentes separado ni un marketplace aislado: el runtime actual ya tiene
`agent_skills`, `org_skill_configs`, prompts, Telegram y approvals. La mejora
es aditiva y se concentra en gobernanza, versionado y seguridad de ejecucion.

## Complexity Tracking

No hay violaciones constitucionales. La unica complejidad deliberada es agregar
versionado de skills custom, porque FR-017 exige trazabilidad y rollback; usar
solo un campo markdown mutable en `agent_skills` no cumpliria auditoria Nivel B.

## Phasing

- **Phase 0 - Research**: decisiones D1-D8 en [research.md](./research.md).
- **Phase 1 - Design**: modelo de datos, contratos API/UI y quickstart.
- **Phase 2 - Foundations**: migracion, tipos, schemas, seeds/definiciones
  base de skills y tests de registry/cache.
- **Phase 3 - US1 P1**: vendedor Telegram consulta disponibilidad y solicita
  reserva con permisos estrictos.
- **Phase 4 - US2 P1**: admin activa/desactiva skills con invalidacion runtime.
- **Phase 5 - US3 P2**: crear/editar/versionar custom skills markdown con tools
  aprobadas.
- **Phase 6 - US4 P2**: acciones sensibles asistidas, auditadas y nunca
  auto-aprobadas por el modelo.
- **Phase 7 - US5 P3**: contrato preparado para MCP aprobado futuro.
- **Phase 8 - Cierre**: contratos, gates tecnicos, pruebas E2E y actualizacion
  de memoria curada si el usuario lo aprueba.

## Post-Design Constitution Check

El diseno mantiene PASS:

- Supabase sigue como fuente transaccional para skills, configuraciones,
  aprobaciones y auditoria.
- Telegram no expone datos sin vincular identidad y asignacion de vendedor.
- Las acciones sensibles no dependen de una decision del LLM.
- MCP queda preparado pero no ejecutable sin conexion aprobada, permisos y
  timeout constitucional.
- Los contratos FastAPI siguen siendo fuente de OpenAPI; el frontend consume
  tipos generados.
