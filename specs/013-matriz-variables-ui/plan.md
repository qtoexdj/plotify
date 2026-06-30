# Implementation Plan: Matriz de Variables por Productor — Rediseño del Centro de Control Legal

**Branch**: `013-matriz-variables-ui` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-matriz-variables-ui/spec.md`

## Summary

Reemplazar la sección de variables del Centro de Control Legal —y agregar la vista del borrador de venta por lote— por **una matriz única organizada por productor** (extraída / manual / autoría / hueco de venta), con la evidencia al lado, aprobación en bloque, colapso de las repeticiones por lote y progreso hacia "molde aprobable". Es un cambio de **solo presentación**: el único toque de backend es exponer el `producer` —ya calculado en el catálogo canónico— en la respuesta del inventario. Sin migraciones; el motor (resolutor, gates, snapshot, puente operacional, hook de venta, renderer) no se modifica.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Next.js App Router (web); Python 3.13 / FastAPI (solo lectura del inventario).

**Primary Dependencies**: shadcn/ui, Tailwind CSS 4, iconografía existente (Hugeicons/lucide); Pydantic (schema de respuesta).

**Storage**: Supabase Postgres — **sin cambios de esquema, sin migración**.

**Testing**: vitest (web), pytest (api).

**Target Platform**: web (dashboard administrativo).

**Project Type**: web (frontend Next.js + microservicio FastAPI).

**Performance Goals**: render del inventario (~34 variables distintas, hasta cientos de filas SII por lote) sin bloqueo perceptible; agrupación y colapso O(n) en cliente.

**Constraints**: solo presentación; cero migraciones; un único campo nuevo en el contrato del inventario (`producer`); preservar la funcionalidad fina que hoy vive en los paneles a medida (en particular el ajuste manual de roles SII, FR-013).

**Scale/Scope**: ~14 grupos canónicos, ~34 variables distintas por proyecto real (Teno); repeticiones SII de hasta decenas de lotes; matriz a dos niveles (molde del proyecto + borrador de venta por lote).

## Constitution Check

_GATE evaluado contra `.specify/memory/constitution.md` v1.0.0:_

- **I/II — Piloto core / geometría**: no afecta el flujo KMZ ni la derivación de deslindes; consume datos ya producidos. ✅
- **III — Supabase y migraciones canónicas**: **sin migración** — solo se expone un campo derivado en la respuesta del inventario. ✅
- **IV — Contratos tipados**: ✅ **resuelto en este ciclo**. `producer` se agregó como `computed_field` en la fuente canónica (`VariableResolutionResponse`, `apps/api/schemas/legal_variables.py`) derivado de `catalog.variable_producer`, y `pnpm contracts:generate` regeneró el cliente (`apps/web/src/lib/services/plotify-chat.generated.ts` ahora trae `producer: string` en `VariableResolutionResponse`) y `packages/contracts/openapi/plotify-chat.v1.json`. El frontend debe **consumir el tipo generado** (no hand-typear). Tests `test_escrituras_variable_inventory` + `test_variable_catalog_labels` en verde (11).
- **V — Multi-tenant**: se reutilizan endpoints scopeados existentes (inventario, PATCH variable, bulk-approve, upsert by-key, legal-roles override); no se introduce confianza en `organization_id` del cliente. ✅
- **VI — Testing y shadcn**: componentes nuevos en shadcn/ui + Tailwind 4; tests vitest (agrupación, colapso, conteo, exclusión de venta) y pytest (campo `producer`). Gates aplicables: `typecheck:web`, `test:web`, `build:web`, `test:api`, `contracts:generate`. `verify:migrations` N/A. ✅

**Resultado: PASS** (sin violaciones; sin entradas en Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/013-matriz-variables-ui/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── inventory-producer.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
apps/api/
├── services/legal_variable_resolution.py    # get_project_variable_inventory: setear producer por fila
├── schemas/legal_variables.py               # VariableResolutionResponse.producer: str | None
└── tests/test_escrituras_variable_inventory.py  # cubrir producer por grupo/clave

apps/web/src/
├── components/projects/legal/variable-matrix/   # NUEVO
│   ├── variable-matrix.tsx                   # orquestador (scope proyecto | lote)
│   ├── molde-progress-header.tsx             # progreso + "Aprobar molde" (bulk global)
│   ├── producer-group.tsx                    # sección por productor + bulk por grupo
│   ├── variable-row.tsx                      # valor · confianza · fuente · acciones
│   ├── variable-inspector.tsx               # dato + evidencia lado a lado (V2)
│   ├── sii-lot-group.tsx                     # fila colapsada N lotes + detalle + override (FR-013)
│   └── sale-gap-panel.tsx                    # "se completa en la venta" (no editable)
├── components/projects/detail/legal-control-center.tsx  # reemplazar variables + paneles por <VariableMatrix>
└── lib/legal/variable-resolution-types.ts    # tipo/enum/labels producer + helpers de agrupación y colapso

apps/web/tests/                               # vitest: agrupación, colapso SII, conteo, exclusión de venta
```

Eliminados (su lógica fina migra al detalle genérico): `sag-article-two-panel.tsx`, `plano-archive-panel.tsx`, la tabla + formulario inline de Roles SII y los 3 KPI cards del CCL. Conservados como contexto secundario: `legal-document-status-panel.tsx`, `escritura-readiness-panel.tsx`. El override manual de roles SII se preserva dentro de `sii-lot-group.tsx` reutilizando el endpoint `legal-roles/[lotId]`.

**Structure Decision**: web app (frontend Next.js + servicio FastAPI). El grueso del trabajo es frontend bajo `components/projects/legal/variable-matrix/`; el backend se limita a un campo derivado de lectura en el inventario.

## Complexity Tracking

N/A — la Constitution Check pasa sin violaciones.
