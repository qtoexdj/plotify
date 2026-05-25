# Motor de Geometrías

**Tag:** #arquitectura #geometria
**Relacionado:** [[Arquitectura General]], [[Servidumbres Legal]], [[Texto de Deslinde]]

---

## Vision general

El motor de geometrías es el corazon geoespacial de Plotify. Convierte archivos KMZ/KML en lotes con área calculada y genera analisis de servidumbre de tránsito.

## Tecnologias

| Libreria | Uso |
|----------|-----|
| **Turf.js** (10 paquetes) | Buffer, intersect, area, bbox, line-intersect, etc. |
| **proj4** | Conversion UTM ↔ WGS84 |
| **@tmcw/togeojson** | Parsing KML a GeoJSON |
| **JSZip** | Descompresión de archivos KMZ |

## Archivos clave

### servidumbre.ts

Motor de calculo de servidumbre de transito:

- `calculateServidumbre()` — Hace buffer del camino (radio = ancho/2) e intersecta con geometria del lote. Retorna area en m2 y poligono de interseccion.
- `sanitizeLotGeometry()` — Convierte LineString/MultiLineString a Polygon (maneja perimetros crudos de KMZ/CAD).
- `analyzeServidumbreBoundaries()` — Clasifica cada arista del poligono de servidumbre:
  - `internal` — limita con area util del propio lote.
  - `neighbor` — limita con servidumbre de lote vecino.
  - `external` — limita con algo fuera de la subdivision.

### Guardrails

- **Guardrail #1**: Micro ray-casting (proyeccion de 0.1m en normal outward) para determinar si un punto cae dentro del lote.
- **Guardrail #2**: Fusion de segmentos colineales (tolerancia 3 grados) para eliminar artefactos de CAD.

### utm.ts

Manejo de coordenadas UTM, conversion a/de WGS84, formato para textos legales. Incluye `calculateLegalMetrics()` que retorna area geodesica y area planar UTM.

### compute-m2.ts

Calculo de area con Turf.js `@turf/area` desde GeoJSON Polygon/MultiPolygon.

### canvas-transform.ts

Transformaciones de canvas para el viewer (zoom, pan, scale). Funciones puras de math: `extractCoordinates`, `computeBounds`, `computeTransformParams`, `projectPoint`, `getCentroid`.

### utils.ts

Utilidades geometricas: `calculateBounds`, `transformCoordinates`, `getFillColor`, `getStrokeColor`, `getCentroid`, `calculatePolygonArea`, `calculateDistance`, `calculateBearing`, `getCardinalDirection`, `getBoundaries`, `getBoundariesWithNeighbors`.

### utm_comparison.ts (experimental)

Comparacion de calculo geodesico vs UTM planar. Implementacion standalone con formulas Karney/Snyder Transverse Mercator. **No usado en produccion.**

### audit_experiments.ts (experimental)

Audit de consistencia entre `calculatePolygonArea` y `calculateDistance` vs implementaciones de referencia (Vincenty, tangent plane). **No usado en produccion.**

## Flujo de importacion KMZ

```
Upload KMZ → JSZip descomprime → toGeojson parsea
→ extrae Features → cada Feature → Geometry en DB
→ asignacion visual en mapa → calculo m2 automatico
```

## Relacionado
- [[Servidumbres Legal]] — Texto legal generado a partir del analisis geometrico
- [[Texto de Deslinde]] — Descripcion de limites usando datos geometricos
