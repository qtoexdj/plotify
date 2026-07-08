# Implementation Plan: Aprobación por excepción del pipeline venta → minuta

**Branch**: `017-aprobacion-por-excepcion` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-aprobacion-por-excepcion/spec.md`

## Summary

Al validarse una venta, una **cascada server-side** completa el caso de escritura sin actos humanos: staging del puente → snapshot → evaluación de blockers → (revisión jurídica según política de la organización) → aprobación del caso a nombre del sistema → generación de minuta → entrega por Telegram. Si algo falta, el caso queda en **excepción** con causas accionables y se notifica al admin. La mesa pasa de estación de peaje a sala de control de excepciones. **El motor no se toca** (resolutor, gates, puente, renderer, entrega): la cascada es orquestación sobre piezas ya probadas — la mayor parte del trabajo es extraer la lógica de workflow hoy incrustada en `escritura_matrices.py` (2.904 líneas) a un servicio reutilizable y llamarla en secuencia.

## Technical Context

**Language/Version**: Python 3.12 (FastAPI, microservicio `apps/api`), TypeScript 5 / Next.js App Router (`apps/web`)

**Primary Dependencies**: FastAPI + supabase-py (API), Next.js + shadcn/ui + Tailwind 4 (web), python-docx vía `matriz_docx_renderer`, Telegram vía `escritura_delivery`

**Storage**: Supabase PostgreSQL — migraciones exclusivamente en `packages/database/supabase/migrations` (Principio III)

**Testing**: pytest + FakeStore/FakeSupabase (`apps/api/tests`), Vitest (`apps/web/tests`); validación final contra Supabase real (memoria: los fakes ocultan bugs de PostgREST)

**Target Platform**: Vercel (web) + servicio FastAPI, Supabase cloud

**Project Type**: Monorepo web app (apps/web + apps/api + packages/database)

**Performance Goals**: venta aprobada → minuta entregada < 2 min (SC-006); evaluación de excepción visible < 1 min (SC-004)

**Constraints**: cascada idempotente y reanudable (sin duplicar aprobaciones/minutas/entregas); cero regresión del registro inmutable (FR-010); contratos tipados regenerados (`pnpm contracts:generate`, Principio IV)

**Scale/Scope**: proyectos de ~50-100 lotes por organización; la cascada corre una vez por venta + reintentos manuales

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio | Evaluación |
| --- | --- |
| I. Producto piloto primero | PASS — elimina fricción del flujo core (venta → documento) sin agregar features experimentales. La cascada respeta "aprobación administrativa web de reservas/ventas" (la venta sigue siendo aprobada por un humano). |
| II. Geometría como origen | PASS — no toca deslindes ni geometría; consume lo que SDD016 dejó (puente produce servidumbre/deslindes). |
| III. Migraciones canónicas | PASS — 3 migraciones nuevas en `packages/database/supabase/migrations` (política de revisión, warning por proyecto, corridas de cascada); `pnpm verify:migrations` en el gate. **Recordatorio de memoria**: aplicar vía `supabase db push`, NO vía MCP `apply_migration` (evita divergencia del historial). |
| IV. Contratos tipados | PASS — endpoints nuevos (retry, política de revisión, warning-ack) y campos nuevos en `MatrizCaseResponse` entran al OpenAPI y se regenera el cliente con `pnpm contracts:generate`. |
| V. Multi-tenant + auditoría | PASS — la cascada corre server-side con tenant inferido del caso (nunca del frontend); toda decisión del sistema se registra en `legal_review_decisions` con origen `system`, gatillo y molde/versión heredado; el cambio de política de revisión se audita. |
| VI. Testing obligatorio | PASS — toca generación de documentos y transacciones de venta ⇒ tests exigidos: pytest de la cascada (feliz/excepción/reanudación/idempotencia/four-eyes), tests de endpoints con FakeStore, Vitest de la mesa; gates verdes por user story (SC-007). |

**Violaciones**: ninguna. `Complexity Tracking` queda vacío.

## Project Structure

### Documentation (this feature)

```text
specs/017-aprobacion-por-excepcion/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones D1-D8
├── data-model.md        # Fase 1: migraciones y entidades
├── quickstart.md        # Fase 1: validación end-to-end contra Teno
├── contracts/           # Fase 1: contratos de endpoints nuevos
│   └── cascade-endpoints.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks — no lo crea /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/
├── services/
│   ├── escritura_case_workflow.py    # NUEVO: submit/approve/generate extraídos de escritura_matrices.py
│   ├── escritura_auto_pipeline.py    # NUEVO: la cascada (evaluar → revisar → aprobar → generar → entregar → notificar)
│   ├── escritura_sale_hook.py        # MOD: dispara la cascada al validar la venta
│   ├── escritura_delivery.py         # MOD: mensaje de notificación de excepción
│   └── organization_settings.py      # MOD/NUEVO: política de revisión (lectura/cambio auditado)
├── api/v1/endpoints/
│   ├── escritura_matrices.py         # MOD: endpoints delegan al workflow service; retry-cascade; campos cascade en responses
│   └── organizations.py              # MOD: GET/PATCH política de revisión
└── tests/
    ├── test_escritura_auto_pipeline.py   # NUEVO
    └── test_matriz_endpoints.py          # MOD

apps/web/src/
├── components/documents/mesa/
│   ├── mesa-escritura.tsx            # MOD: vista "minuta entregada" / "excepción"
│   ├── workflow-acciones.tsx         # MOD: fuera enviar/aprobar del camino feliz; acción Reintentar; sin AlertDialogs reversibles
│   └── estado-preparacion.tsx        # MOD: causas de excepción accionables
├── components/settings/              # MOD: toggle de política de revisión en config de organización (SDD016)
└── components/projects/              # MOD: warning legal en el checklist del proyecto (una vez)

packages/database/supabase/migrations/
├── XXXX_escritura_review_policy.sql        # organizations.escritura_review_policy + auditoría
├── XXXX_project_minuta_warning_ack.sql     # projects.minuta_warning_acknowledged_by/_at
└── XXXX_escritura_cascade_runs.sql         # tabla de corridas de cascada (auditoría + idempotencia)
```

**Structure Decision**: monorepo existente (apps/web + apps/api + packages/database). La pieza nueva central es `escritura_auto_pipeline.py`; como prerequisito se extrae la lógica de workflow de `escritura_matrices.py` a `escritura_case_workflow.py` para que endpoints y cascada compartan una sola implementación (de paso reduce el archivo de 2.904 líneas, deuda ya identificada).

## Fase 0 — Research (resumen; detalle en research.md)

- **D1 — Dónde vive la cascada**: servicio propio (`escritura_auto_pipeline.py`) invocado por el sale hook, por la aprobación de revisión jurídica y por el retry; no en el endpoint ni en un worker (volumen bajo, latencia < 2 min alcanzable en línea).
- **D2 — Aprobación del sistema**: `approved_by`/`submitted_by` NULL + `approval_origin='system'`; el detalle (gatillo, molde/versión, hash) va en `legal_review_decisions`. No se inventa un usuario-sistema.
- **D3 — Estado de cascada**: tabla `escritura_cascade_runs` (histórico de corridas con outcome y causas) en vez de columnas mutables en el caso — auditoría Nivel B gratis y la mesa deriva su vista de la última corrida + datos existentes.
- **D4 — Política de revisión**: columna en `organizations` (enum) + registro de cambio auditado; default `every_sale`.
- **D5 — Warning legal**: columnas en `projects` (`minuta_warning_acknowledged_by/_at`); las generaciones referencian esa confirmación (FR-009) manteniendo las columnas actuales por generación como copia del amparo.
- **D6 — Idempotencia**: por paso — aprobar verifica status; generar verifica generación previa con mismo `snapshot_hash` + versión; entregar reusa los estados de `escritura_deliveries`; la corrida registra qué pasos ejecutó/saltó.
- **D7 — Notificación de excepción**: reuso del canal Telegram de `escritura_delivery` con tipo de mensaje nuevo (lote + causas + link a la mesa); best-effort como la entrega de minuta.
- **D8 — Four-eyes**: con origen `system` en el envío, cualquier humano satisface `LEGAL_REVIEW_REQUIRE_DISTINCT_REVIEWER`; semántica actual intacta en flujo manual.

## Fase 1 — Design & Contracts (resumen; detalle en data-model.md y contracts/)

1. **data-model.md**: 3 migraciones (política de revisión + auditoría, warning por proyecto, cascade_runs), extensión de `legal_review_decisions` (origen/gatillo/molde-versión como columnas o payload), estados derivados del caso para la mesa (`completed` / `exception` / `awaiting_review` / `legacy`).
2. **contracts/cascade-endpoints.md**: `POST /escritura-cases/{id}/retry-cascade`; `GET/PATCH /organizations/{id}/escritura-review-policy`; `POST /projects/{id}/minuta-warning-ack`; campos nuevos en `MatrizCaseResponse` (`cascade_status`, `cascade_causes`, `approval_origin`). Regenerar cliente: `pnpm contracts:generate`.
3. **quickstart.md**: validación end-to-end contra Teno real (memoria: FakeStore oculta bugs de PostgREST) — venta nueva en modo default (1 acto), cambio a `exceptions_only` (0 actos), caso con dato faltante (excepción + notificación + retry).
4. **AGENTS.md**: puntero SPECKIT actualizado a este plan.

## Orden de implementación sugerido (para /speckit-tasks)

1. **US1-prep**: extraer `escritura_case_workflow.py` (submit/approve/generate como funciones puras de servicio) sin cambio de comportamiento; endpoints delegan; tests existentes verdes — es el refactor que habilita todo lo demás.
2. **US1**: migración `cascade_runs` + `escritura_auto_pipeline.py` + disparo desde el sale hook + decisiones `system` + idempotencia + notificación de excepción (FR-001/002/005/006, D1-D3, D6-D7).
3. **US2**: migración + endpoints de política de revisión + integración de la revisión en la cascada + reanudación al aprobar revisión (FR-003/004, D4, D8).
4. **US4**: migración warning por proyecto + su confirmación en checklist/primera generación + cascada la hereda (FR-009, D5) — antes que US3 porque la cascada completa lo necesita para correr sin diálogo.
5. **US3**: mesa como sala de excepciones (vista terminado/excepción, retry, fuera enviar/aprobar del camino feliz, sin AlertDialogs reversibles) (FR-007/008).
6. **Cierre**: quickstart contra Teno real + gates completos + `pnpm contracts:generate` + `pnpm verify:migrations`.

## Complexity Tracking

_Sin violaciones constitucionales que justificar._
