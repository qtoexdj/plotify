# Implementation Plan: Remediación del pipeline venta→escritura y reducción de fricción

**Branch**: `016-pipeline-remediacion-ux` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-pipeline-remediacion-ux/spec.md` + plan de auditoría `specs/plan-remediacion-auditoria.md`.

## Summary

Arreglar los tres cortes reales del pipeline venta→escritura (puente que revienta, revisión jurídica sin UI, entrega sin destinatario) y reducir la fricción de configuración/venta (molde en un clic, verificación masiva de lotes, formularios reserva/venta con prefill y aprobación delta, camino guiado del proyecto), más el gate de seguridad para producción. Todo son **cambios aditivos y de corrección** sobre el motor existente (SDD 006→011) y la mesa (SDD 010); **no se reconstruye ningún motor**. La migración de base de datos es aditiva y acotada.

## Technical Context

**Language/Version**: Python 3.13 (FastAPI, apps/api) + TypeScript 5 / Node ≥22 (Next.js 15 App Router, apps/web).

**Primary Dependencies**: FastAPI, Pydantic v2, supabase-py, arq (worker); Next.js, React 19, react-hook-form, zod, shadcn/ui, Tailwind 4, `@hugeicons/react`.

**Storage**: Supabase PostgreSQL (proyecto `swkrnjdpnlrgxgotmfxy`), storage buckets `documents` (privado), `project-files` (a privatizar), `avatars`.

**Testing**: pytest (apps/api, 641 tests hoy verdes), vitest (apps/web, 755/757). Constitución VI exige tests para KMZ/deslindes/contratos/RLS/migraciones/generación de documentos/transacciones/Telegram.

**Target Platform**: Web app (dashboard admin/vendedor) + microservicio FastAPI + worker arq + bot de Telegram.

**Project Type**: Web application (frontend Next.js + backend FastAPI) en monorepo pnpm.

**Performance Goals**: No hay metas nuevas de rendimiento; la verificación masiva de lotes debe resolver 53 lotes en una transacción sin timeout.

**Constraints**: Migraciones solo en `packages/database/supabase/migrations` (Principio III). Contratos regenerados con `pnpm contracts:generate` (Principio IV). Multi-tenant: inferir `organization_id` del JWT, nunca confiar en el frontend (Principio V). Auditoría atómica de cambios comerciales/legales (Principio V).

**Scale/Scope**: 1 org piloto, ~2 proyectos, ~53 lotes/proyecto. 7 user stories, ~1 migración aditiva, ~6 endpoints tocados, ~10 pantallas/componentes.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio                                 | Cumplimiento en este feature                                                                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Producto Piloto Primero**            | ✅ El feature es exactamente el flujo core (venta→escritura→entrega); no agrega funcionalidad experimental.                                                                 |
| **II. Geometría como origen**             | ✅ La verificación masiva respeta CALC vs oficial del plano; no altera el cálculo de deslindes, solo su confirmación en bloque.                                             |
| **III. Supabase y migraciones canónicas** | ✅ Una migración aditiva en `packages/database/supabase/migrations` (columnas `lot_records`, revocaciones de grants, bucket privado). `pnpm verify:migrations` obligatorio. |
| **IV. Contratos tipados**                 | ✅ Cambios en payloads Pydantic → `pnpm contracts:generate`; el frontend consume el cliente generado (no el mirror).                                                        |
| **V. Seguridad multi-tenant**             | ✅ Refuerza el aislamiento (revoca grants a anon, bucket privado, guard server-side de rutas por rol); auditoría de revisión jurídica y verificación masiva.                |
| **VI. Testing y gates**                   | ✅ Cada tarea de implementación lleva su `Verify`; tests de contrato contra el camino venta→escritura (cubre el gap del FakeStore).                                         |

**Resultado: PASS.** No hay violaciones que justificar en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/016-pipeline-remediacion-ux/
├── plan.md              # Este archivo
├── spec.md              # User stories, FR, success criteria
├── research.md          # Decisiones con rationale (Phase 0)
├── data-model.md        # Migración aditiva + entidades (Phase 1)
├── quickstart.md        # Verificación E2E manual (Phase 1)
├── contracts/           # Contratos de endpoints tocados (Phase 1)
│   ├── payloads-comprador.md
│   ├── revision-juridica.md
│   ├── aprobar-molde.md
│   ├── verificacion-masiva-lotes.md
│   ├── entrega-telegram.md
│   └── organizacion-config.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Tareas atómicas (Phase 2, /speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/
├── schemas/approval.py                      # FR-003: campos comprador en payloads
├── services/
│   ├── escritura_operational_bridge.py      # FR-001/002/004: _safe_data + map nacionalidad
│   ├── escritura_readiness.py               # FR-002/014: log error, gates heredados
│   ├── escritura_matrices... (endpoints)    # FR-005/006/007/009/011/012/017: recompute, revisión, delivery, molde 1-clic
│   └── escritura_delivery.py                # FR-009/010: destinatario admin
├── api/v1/endpoints/
│   ├── approvals.py                         # FR-017: delta reserva→venta
│   ├── escritura_matrices.py                # FR-005/006/007/011/012/014
│   └── lots... (verificación masiva)        # FR-026
└── tests/                                   # tests de contrato del camino venta→escritura

apps/web/src/
├── components/projects/
│   ├── LotReservationForm.tsx  → split      # FR-015/016: reservationSchema/saleSchema + prefill
│   ├── viewer/LotInfoView.tsx               # FR-016/025: prefill + aviso lote no verificado
│   ├── geometry-viewer/index.tsx            # FR-019: response.ok en bulk update
│   ├── legal/variable-matrix/               # FR-011/012: Aprobar molde 1-clic
│   └── detail/overview-tab.tsx              # FR-020/021: checklist del proyecto
├── components/documents/mesa/
│   ├── mesa-encabezado.tsx                  # FR-006/008: Verificar + revisión jurídica visible
│   └── panel-datos.tsx / workflow-acciones  # FR-007/014: acción revisión jurídica, gates heredados
├── components/app-sidebar.tsx               # FR-024: scoping por rol
├── app/(dashboard)/settings/               # FR-022/023: config org + Telegram
├── lib/validations/
│   ├── lot-reservation.schema.ts → split    # FR-015
│   └── lot-update.schema.ts                 # FR-018: estado + transiciones
└── actions/request-approval.action.ts       # FR-030: helper común

packages/database/supabase/migrations/
└── 20260706xxxxxx_pipeline_remediacion.sql  # FR-003(cols) + FR-018(transiciones) + FR-027(revoke) + FR-028(bucket)
```

**Structure Decision**: Web application en monorepo (apps/web + apps/api + packages/database). Se respeta la separación existente; no se crean carpetas nuevas de alto nivel. Una sola migración aditiva agrupa los cambios de esquema/seguridad para minimizar pasos de despliegue.

## Complexity Tracking

> No aplica: Constitution Check = PASS sin violaciones.

## Phased Delivery (alineado a user stories y a los 3 sprints del plan)

- **Fase Setup (T001–T003):** punteros + la única migración aditiva.
- **Fase Foundational (bloqueante):** contratos regenerados + helper `_safe_data` + tests de contrato base.
- **US1 (P1, MVP):** pipeline de punta a punta (FR-001..010).
- **US2 (P2):** molde en un clic (FR-011..014).
- **US3 (P2):** formularios + prefill + delta + estado de lote (FR-015..019).
- **US4 (P2):** camino guiado + config org/Telegram + roles (FR-020..025).
- **US5 (P2):** verificación masiva de lotes (FR-026).
- **US6 (gate de piloto):** seguridad (FR-027..028) — **HG-2**.
- **US7 (P3):** salud de código + limpieza (FR-029..030).

**Regla del repo:** una tarea sin checkear por pasada, salvo pedido explícito de mayor alcance. Web/frontend cierra con `pnpm --filter web lint` + `pnpm format:check` + `pnpm build:web`; cambios de contrato/tipos suman `pnpm typecheck:web`; API suma `pnpm test:api`; migración suma `pnpm verify:migrations`.
