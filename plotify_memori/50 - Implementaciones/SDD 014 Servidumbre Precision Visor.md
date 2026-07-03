---
title: SDD 014 Servidumbre Precision Visor
aliases:
  - SDD 014 Servidumbre Precision
  - Servidumbre Precision Visor
date: 2026-07-03
status: implementacion tecnica en curso
tags:
  - implementacion
  - sdd
  - geometria
  - servidumbre
  - visor
  - documentos
related:
  - "[[Motor de Geometrías]]"
  - "[[Servidumbres Legal]]"
  - "[[Texto de Deslinde]]"
  - "[[Generador de Escrituras de Compraventa]]"
---

# SDD 014 Servidumbre Precision Visor

## Estado

SDD 014 reemplaza el calculo de servidumbre basado en un unico
`projects.road_geometry + road_width_m` por un motor que calcula la superficie
afecta como `lote intersecta union(huellas de camino)`.

La implementacion tecnica ya cubre las fases principales US1-US5:
persistencia de segmentos, recalculo por lote, anchos multiples, overlay de
visor, variables/documentos y regresiones Teno-like. Queda por ejecutar la fase
de polish transversal de `tasks.md` antes de considerar cerrado el SDD completo.

## Artefactos SDD

- `specs/014-servidumbre-precision-visor/spec.md`
- `specs/014-servidumbre-precision-visor/plan.md`
- `specs/014-servidumbre-precision-visor/research.md`
- `specs/014-servidumbre-precision-visor/data-model.md`
- `specs/014-servidumbre-precision-visor/contracts/`
- `specs/014-servidumbre-precision-visor/tasks.md`

## Alcance implementado

- Motor puro en `apps/web/src/lib/geometry/servidumbre-footprints.ts`:
  normaliza segmentos `centerline` y `footprint`, intersecta lote contra
  huellas listas, une solapes y calcula superficie con base legal UTM.
- Area legal robusta en `compute-m2.ts` para Polygon/MultiPolygon con huecos.
- Adaptador legacy en `servidumbre.ts` conserva `calculateServidumbre` para
  proyectos con un solo camino global.
- Persistencia Supabase:
  `project_road_segments`, `servidumbre_widths_m`,
  `servidumbre_ancho_label`, `servidumbre_geometry`,
  `servidumbre_sources` y estado/version de calculo.
- Onboarding recalcula lotes al guardar caminos y al asignar geometria de lote
  despues de existir caminos.
- Visor expone y renderiza features `geometry_type = servitude`, con panel de
  lote mostrando superficie total, servidumbre, superficie util y ancho(s).
- Documentos web, puente operacional Python y motor documental prefieren
  `servidumbre_ancho_label` cuando existe, manteniendo compatibilidad con
  `servidumbre_ancho_m`.

## Validacion Teno-like

La validacion tipo Teno vive en fixtures reproducibles, no en parsing del PDF.
El fixture principal esta en:

- `apps/web/tests/lib/geometry/teno-servidumbre.fixture.ts`

Cubre estos casos:

- ancho `5`;
- ancho `10`;
- ancho multiple `5 y 10`;
- lote sin interseccion;
- solape de huellas sin doble conteo;
- lote con hueco interior.

El verificador read-only esta en:

- `apps/web/scripts/verify_servidumbre_precision_teno.ts`

Se ejecuta con Vitest y valida, para cada caso, estado, anchos, label, fuentes,
geometria de interseccion, rangos de superficie e identidad:

```text
superficie_neta_m2 + servidumbre_m2 = superficie_total_m2
```

## Comandos de verificacion US5

```bash
cd apps/web
./node_modules/.bin/vitest run scripts/verify_servidumbre_precision_teno.ts --reporter=verbose --pool=forks
./node_modules/.bin/vitest run tests/lib/geometry/servidumbre-footprints.test.ts tests/lib/geometry/engine-e2e.test.ts --reporter=verbose --pool=forks
```

Resultados al documentar T043:

- verificador Teno-like: 6 tests passing;
- suite geometria US5: 39 tests passing;
- `pnpm typecheck:web`: OK;
- `pnpm --filter web lint`: OK;
- `git diff --check`: OK;
- `codegraph sync .`: OK.

## Reglas que quedan vigentes

- Los valores persistibles de superficie usan area legal UTM; Turf se usa para
  operaciones geometricas, no como base final de area legal.
- Si dos huellas se cruzan o solapan, se mide la union, no la suma de areas por
  tramo.
- `servidumbre_widths_m` y `servidumbre_ancho_label` son la fuente para anchos
  multiples; `servidumbre_ancho_m` queda como compatibilidad legacy.
- Los documentos y variables deben consumir los mismos valores persistidos que
  el visor.
- El PDF/plano Teno es referencia de dominio, pero la regresion automatizada se
  basa en fixtures controlados.

## Pendientes

Queda la fase de polish transversal de SDD 014:

- `pnpm verify:migrations`
- `pnpm --filter web lint`
- `pnpm format:check`
- `pnpm typecheck:web`
- `pnpm test:web`
- `pnpm build:web`
- `pnpm test:api` y `pnpm contracts:generate` si corresponde por cambios API
- `codegraph sync .`

Hasta pasar esos gates globales, el SDD esta implementado por historias, pero
no cerrado como release tecnica completa.

## Relacionado

- [[Motor de Geometrías]]
- [[Servidumbres Legal]]
- [[Texto de Deslinde]]
- [[Generador de Escrituras de Compraventa]]
