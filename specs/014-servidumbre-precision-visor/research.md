# Research: Motor de Servidumbres de Precision para Visor de Proyecto

**Feature**: 014-servidumbre-precision-visor · **Date**: 2026-07-02

## Contexto verificado

Fuentes usadas:

- Codigo real via CodeGraph: `calculateServidumbre`, `saveInfrastructure`, `computeM2FromGeoJSON`, `MapLotLayers`, `viewer.service`, tests de geometria.
- Memoria de producto: `plotify_memori/30 - Arquitectura/Motor de Geometrías.md` y `plotify_memori/20 - Producto & Proyectos/Servidumbres Legal.md`.
- Plano real Teno: tabla con `Superficie Util`, `Servidumbre m2`, `Ancho de servidumbre m`, `Superficie Total m2`; casos 5, 10, 5 Y 10 y lotes sin servidumbre.
- Context7:
  - Turf.js: `intersect(featureCollection([...]))`, `area`, `buffer`, `union(featureCollection([...]))`.
  - MapLibre GL JS 5.19: `addSource` GeoJSON, `addLayer` fill/line, filtros por tipo y actualizacion via source data.
  - Vitest 4.1.6: ejecucion de archivos especificos con `vitest run path` y reporter verbose.

## Decisiones

### D1 — La unidad canonica ya no es "camino global", sino "huella de servidumbre"

**Decision**: representar cada camino asignado como una huella poligonal antes de calcular lotes. La huella puede ser:

- directa: Polygon/MultiPolygon designado como camino/servidumbre;
- derivada: LineString/MultiLineString interpretado como eje y ensanchado por ancho/2;
- borde: linea con lado afecto confirmado por usuario.

**Rationale**: el KMZ no es uniforme; el onboarding existe precisamente porque el usuario debe interpretar que es lote, camino o area comun.

**Alternatives considered**:

- Mantener `projects.road_geometry + road_width_m`: no soporta 5 y 10 ni poligonos de camino.
- Inferir automaticamente eje/borde: riesgo alto; el usuario ya explico que los KMZ varian.

### D2 — El calculo legal por lote es `lote ∩ union(huellas)`

**Decision**: para cada lote, unir las huellas que lo afectan y luego intersectar esa union con el lote. El area se mide sobre la geometria de interseccion usando la misma base legal UTM que el lote.

**Rationale**: sumar intersecciones por tramo puede duplicar area cuando dos caminos se solapan o se cruzan.

**Alternatives considered**:

- Sumar area de cada interseccion: falla en cruces/solapes.
- Confiar en que no habra solapes: no es un guardrail aceptable para datos de KMZ/CAD.

### D3 — No mezclar Turf area persistida con area legal UTM

**Decision**: Turf se usa para operaciones geometricas; el area persistida debe calcularse con un helper legal que soporte Polygon/MultiPolygon y huecos usando la proyeccion UTM existente.

**Rationale**: `computeM2FromGeoJSON` ya usa `calculateLegalMetrics`, pero solo primer poligono/primer anillo. `calculateServidumbre` actual usa `@turf/area`, generando mezcla de bases.

**Alternatives considered**:

- Usar `@turf/area` para servidumbre: rapido, pero inconsistente con superficie legal.
- Mantener primer anillo: no soporta huecos ni MultiPolygon real.

### D4 — Persistencia explicita de segmentos y resultado por lote

**Decision**: agregar estructura persistente para caminos/tramos y resultado calculado por lote, manteniendo columnas existentes de resultado como read-model derivado.

**Rationale**: guardar metadata de ancho/modo en `geometries.properties` seria opaco y dificil de validar con migraciones y tipos. La servidumbre es fundacional y necesita trazabilidad.

**Alternatives considered**:

- Solo `properties` JSONB: menor migracion, mayor deuda y menor descubribilidad.
- Solo recalculo en memoria: no alimenta visor/documentos ni auditoria.

### D5 — Viewer overlay como FeatureCollection separada

**Decision**: exponer huellas afectas por lote al viewer como features `geometry_type = servitude` o fuente separada de overlay, con fill/line layers antes de labels.

**Rationale**: `MapLotLayers` ya usa MapLibre con GeoJSON source; Context7 confirma el patron `addSource` + `addLayer` y actualizacion con `setData`.

**Alternatives considered**:

- Pintar solo camino lineal: no muestra area afecta.
- Dibujar dentro de la capa de lotes sin tipo nuevo: confunde estados de lote y servidumbre.

### D6 — TDD obligatorio antes de tocar servicios/UI

**Decision**: primero tests de motor puro y fixtures Teno-like; luego tests de persistencia; luego tests de visor y documentos.

**Rationale**: este calculo es base de superficies y escrituras. La implementacion debe fallar si vuelve el ancho unico global o si el overlay queda sin geometria.

**Alternatives considered**:

- Ajustar UI primero: seria validar visualmente una base numerica insegura.
- Tests solo e2e: lentos y poco precisos para casos geometricos.

## Riesgos y mitigaciones

- **Geometrias invalidas de KMZ/CAD**: normalizar/validar antes de guardar resultado y dejar calculo pendiente si falla.
- **Union de MultiPolygon compleja**: agregar dependencia modular `@turf/union` o wrapper equivalente con tests de regresion.
- **Migracion en tabla critica `lots`**: usar migracion incremental, campos nullable, compatibilidad con columnas existentes y `pnpm verify:migrations`.
- **Documentos existentes esperan `servidumbre_ancho_m` numerico**: mantener campo derivado para ancho unico y agregar label/array para multiples; adaptar puente/documentos.
- **Rendimiento**: motor puro con bbox prefilter antes de union/intersect y tests de escala.
