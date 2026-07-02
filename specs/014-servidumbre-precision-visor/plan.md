# Implementation Plan: Motor de Servidumbres de Precision para Visor de Proyecto

**Branch**: `014-servidumbre-precision-visor` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-servidumbre-precision-visor/spec.md`

## Summary

Reemplazar el calculo de servidumbre basado en un unico `projects.road_geometry + road_width_m` por un motor que trabaja con **segmentos de camino interpretados explicitamente** y sus **huellas de servidumbre**. Para cada lote, el resultado sera la interseccion legal entre el lote y la union de huellas que lo afectan, guardando superficie afecta, superficie util, anchos aplicables, geometria renderizable y trazabilidad. El visor debe mostrar la huella afecta y los documentos deben consumir los mismos valores.

La entrega se divide en incrementos: primero motor puro + tests, luego persistencia/onboarding, luego visor, finalmente variables/documentos y validacion tipo Teno.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Next.js App Router en `apps/web`; Python 3.13 / FastAPI solo si se ajusta puente documental.

**Primary Dependencies**: Turf modular (`@turf/buffer`, `@turf/intersect`, `@turf/area`, nuevo `@turf/union` o equivalente de union de poligonos), `proj4`, MapLibre GL JS 5.19, Supabase JS, shadcn/ui + Tailwind CSS 4.

**Storage**: Supabase Postgres. Se requiere migracion canonica en `packages/database/supabase/migrations` para segmentos/huellas y campos derivados por lote.

**Testing**: Vitest para motor, servicios y componentes web; pytest solo si cambia el puente Python de variables/documentos; `pnpm verify:migrations` para schema.

**Target Platform**: Web dashboard administrativo y flujo legal/documental de Plotify.

**Project Type**: Web app + base Supabase + microservicio documental existente.

**Performance Goals**: recalcular servidumbres de hasta 250 lotes y 50 segmentos de camino en menos de 3 segundos en entorno local de desarrollo; actualizar el visor sin bloqueo perceptible para proyectos tipo Teno.

**Constraints**:

- Mantener compatibilidad de lectura con `projects.road_geometry`, `projects.road_width_m`, `lots.servidumbre_m2`, `lots.servidumbre_ancho_m` y `lots.superficie_neta_m2`.
- No mezclar base de area geodesica de Turf con area legal UTM para valores persistidos.
- No sobrescribir overrides oficiales de lote sin accion explicita de recalculo/aceptacion.
- No usar parsing automatico del PDF como fuente de verdad; el PDF Teno es referencia de dominio para fixtures.
- No introducir endpoints ad-hoc sin tipado si se toca FastAPI.

**Scale/Scope**: proyectos de parcelacion chilenos con decenas a pocos cientos de lotes, caminos y areas comunes provenientes de KMZ/KML no uniformes.

## Constitution Check

_Gate evaluado contra `.specify/memory/constitution.md` v1.0.0:_

- **I. Producto Piloto Primero**: el feature fortalece el flujo core KMZ del piloto real y corrige calculos usados en lotes y documentos. PASS.
- **II. Geometria Espacial como Origen de Deslindes y Documentos**: la geometria sigue siendo fuente de verdad, pero ahora conserva huella, ancho y trazabilidad por tramo. PASS.
- **III. Supabase y Migraciones Canonicas**: toda modificacion de schema debe vivir en `packages/database/supabase/migrations` y validarse con `pnpm verify:migrations`. PASS con tarea obligatoria.
- **IV. Contratos Tipados Entre Servicios**: si se modifica el puente FastAPI/documental, se actualizan schemas y contratos generados; si el cambio queda dentro de web/Supabase, no hay OpenAPI nuevo. PASS condicionado.
- **V. Seguridad Multi-Tenant**: nuevas lecturas/escrituras deben inferir autorizacion por proyecto y reutilizar RLS/roles existentes; no se aceptan `organization_id` libres desde cliente. PASS condicionado.
- **VI. Testing y Gates**: este feature toca geometria KMZ, deslindes/servidumbre y documentos; tests y gates son obligatorios. PASS con tareas y verify commands.

**Resultado**: PASS. No hay violaciones aceptadas; las tareas bloqueantes cubren migracion, tests y gates.

## Project Structure

### Documentation (this feature)

```text
specs/014-servidumbre-precision-visor/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── servidumbre-engine.md
│   ├── persistence.md
│   └── viewer-overlay.md
└── checklists/
    ├── requirements.md
    └── test-alignment.md
```

### Source Code (repository root)

```text
apps/web/src/lib/geometry/
├── compute-m2.ts                  # area legal Polygon/MultiPolygon con huecos
├── servidumbre.ts                 # motor legacy + adaptadores
├── servidumbre-footprints.ts      # nuevo motor puro de huellas/intersecciones
└── utm.ts                         # base legal UTM existente

apps/web/src/lib/services/
├── onboarding.service.ts          # recalculo al asignar lotes/caminos
└── viewer.service.ts              # features de overlay para visor

apps/web/src/components/projects/geometry-viewer/
├── MapLotLayers.tsx               # capa MapLibre de huella afecta
└── index.tsx                      # props/datos para overlay de servidumbre

apps/web/src/components/projects/viewer/
└── LotInfoView.tsx                # mostrar anchos multiples y superficie util

apps/web/src/components/projects/
└── LotVerificationPanel.tsx       # override oficial compatible con anchos multiples

apps/web/src/types/
├── database.types.ts              # tipos manuales/compatibilidad
├── onboarding.types.ts            # metadatos de camino
└── viewer.types.ts                # propiedades de overlay

apps/api/services/
├── escritura_operational_bridge.py # si se exponen anchos multiples al caso
└── document_engine.py              # si plantillas legacy requieren ancho label

packages/database/supabase/migrations/
└── 20260702000100_servidumbre_precision.sql

apps/web/tests/lib/geometry/
├── servidumbre-footprints.test.ts
├── compute-m2.test.ts
└── engine-e2e.test.ts

apps/web/tests/
├── onboarding-servidumbre.test.ts
├── viewer-servidumbre-overlay.test.tsx
└── servidumbre-documents.test.ts

apps/api/tests/
└── test_matriz_operational_bridge.py # cobertura de ancho label en puente Python
```

**Structure Decision**: el nucleo debe ser una libreria pura en `apps/web/src/lib/geometry` para poder probar sin UI ni Supabase. Persistencia, visor y documentos consumen ese resultado.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| N/A       | N/A        | N/A                                  |

## Speckit Notes

- `speckit-specify`, `speckit-plan`, `speckit-tasks`, `speckit-checklist` y `speckit-analyze` aplican a este SDD.
- `speckit-git-feature` fue revisado, pero el hook de creacion de rama no pudo ejecutarse por permisos de escritura en `.git`. El directorio `specs/014-servidumbre-precision-visor/` queda como fuente SDD; la rama puede crearse despues si el usuario lo aprueba.
- `speckit-implement` no se ejecuta en esta solicitud: este SDD prepara la implementacion, no cambia codigo productivo.
