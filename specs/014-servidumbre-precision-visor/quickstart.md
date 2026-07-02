# Quickstart: validar SDD 014 Servidumbres de Precision

**Feature**: 014-servidumbre-precision-visor · **Date**: 2026-07-02

## Objetivo

Validar que el calculo de servidumbre represente la superficie real de camino que afecta a cada lote, que soporte anchos 5/10/multiples y que el visor/documentos consuman los mismos valores.

## Escenario base esperado

1. Crear fixtures geometricos con coordenadas WGS84 reales en Chile.
2. Definir lotes de area conocida.
3. Definir tres caminos:
   - eje de 5 m;
   - eje de 10 m;
   - huella poligonal directa.
4. Calcular huellas, unirlas, intersectarlas con cada lote y medir area legal UTM.
5. Validar por lote:
   - `servidumbre_m2`;
   - `superficie_neta_m2`;
   - `servidumbre_widths_m`;
   - `servidumbre_ancho_label`;
   - `servidumbre_geometry`.

## Validacion tipo Teno

El fixture Teno-like debe incluir:

- lotes con ancho 5;
- lotes con ancho 10;
- lotes con ancho 5 y 10;
- lotes con servidumbre cero;
- al menos un caso de caminos superpuestos para comprobar no doble conteo;
- al menos un lote MultiPolygon o con hueco.

La identidad obligatoria para cada lote fixture:

```text
abs((superficie_util + servidumbre_m2) - superficie_total) <= 0.5
```

## Comandos por etapa

Motor puro:

```bash
cd apps/web
./node_modules/.bin/vitest run tests/lib/geometry/compute-m2.test.ts tests/lib/geometry/servidumbre-footprints.test.ts --reporter=verbose --pool=forks
```

Persistencia/onboarding:

```bash
cd apps/web
./node_modules/.bin/vitest run tests/onboarding-servidumbre.test.ts --reporter=verbose --pool=forks
```

Visor:

```bash
cd apps/web
./node_modules/.bin/vitest run tests/viewer-servidumbre-overlay.test.tsx --reporter=verbose --pool=forks
```

Documentos/variables:

```bash
cd apps/web
./node_modules/.bin/vitest run tests/servidumbre-documents.test.ts --reporter=verbose --pool=forks
```

Gates finales:

```bash
pnpm verify:migrations
pnpm --filter web lint
pnpm format:check
pnpm typecheck:web
pnpm test:web
pnpm build:web
```

Si se modifica FastAPI o el puente documental:

```bash
pnpm test:api
pnpm contracts:generate
pnpm typecheck:web
```

## Criterios de cierre

- Todos los comandos relevantes pasan.
- `tasks.md` tiene marcada como completada solo la tarea implementada y verificada.
- No quedan caminos `needs_review` aportando calculos persistidos.
- El visor muestra overlay para todos los lotes con servidumbre positiva.
- Documentos y variables leen el mismo `servidumbre_m2` y `servidumbre_ancho_label` que el visor.
