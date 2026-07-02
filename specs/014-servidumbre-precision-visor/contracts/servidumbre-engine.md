# Contract: Servidumbre Geometry Engine

**Feature**: 014-servidumbre-precision-visor · **Date**: 2026-07-02

## Purpose

Define the pure geometry contract that all services, viewer code and document flows must consume.

## Public Functions

### `normalizeRoadSegmentToFootprint(segment)`

Input:

```ts
type RoadInputMode = 'centerline' | 'footprint' | 'edge'

interface RoadSegmentInput {
  id: string
  geometry: GeoJSONGeometry
  mode: RoadInputMode
  widthM?: number
  edgeSide?: 'left' | 'right' | 'both'
}
```

Output:

```ts
interface RoadFootprint {
  segmentId: string
  widthM: number | null
  widthLabel: string | null
  geometry: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null
  status: 'ready' | 'needs_review' | 'invalid'
  warnings: string[]
}
```

Rules:

- `centerline` requires positive `widthM`; footprint is buffer radius `widthM / 2`.
- `footprint` accepts Polygon/MultiPolygon directly and must not buffer again.
- `edge` requires `widthM` and side before `ready`; otherwise `needs_review`.
- Invalid/unsupported geometries return `invalid` and warnings, not thrown UI errors.

### `calculateLotServitude(input)`

Input:

```ts
interface LotServitudeInput {
  lotId: string
  lotGeometry: GeoJSONGeometry
  totalAreaM2: number | null
  roadSegments: RoadSegmentInput[]
}
```

Output:

```ts
interface LotServitudeResult {
  lotId: string
  servidumbreM2: number
  superficieNetaM2: number | null
  widthsM: number[]
  widthLabel: string | null
  intersectionGeometry: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null
  sourceSegmentIds: string[]
  status: 'calculated' | 'needs_review' | 'error'
  warnings: string[]
}
```

Rules:

- Result geometry = lot polygon intersected with union of ready footprints.
- Area is calculated with legal UTM area helper, not raw `@turf/area`.
- Overlapping footprints are counted once.
- `widthsM` contains unique widths that actually intersect the lot.
- `superficieNetaM2 = totalAreaM2 - servidumbreM2` when total area exists.
- Zero intersection returns zero area, null geometry and empty widths.

## Required Test Cases

- Centerline width 5 m.
- Centerline width 10 m.
- Polygon footprint direct.
- Mixed 5 m and 10 m widths in one lot.
- Overlapping footprints no double count.
- No intersection.
- MultiPolygon lot.
- Polygon with inner hole.
- Legacy project road adapter.
