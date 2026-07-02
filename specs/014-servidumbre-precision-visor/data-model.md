# Data Model: Motor de Servidumbres de Precision para Visor de Proyecto

**Feature**: 014-servidumbre-precision-visor · **Date**: 2026-07-02

## Persisted Entities

### Project Road Segment

Representa un camino/tramo designado durante onboarding.

Propuesta de tabla: `project_road_segments`

| Field                | Type        | Required | Notes                                                                                         |
| -------------------- | ----------- | -------- | --------------------------------------------------------------------------------------------- |
| `id`                 | uuid        | yes      | Primary key                                                                                   |
| `project_id`         | uuid        | yes      | FK a `projects`                                                                               |
| `geometry_id`        | uuid        | nullable | FK opcional a `geometries` original                                                           |
| `name`               | text        | nullable | Nombre visible del camino/tramo                                                               |
| `input_geometry`     | jsonb       | yes      | Geometria original interpretada                                                               |
| `input_mode`         | text        | yes      | `centerline`, `footprint`, `edge`                                                             |
| `width_m`            | numeric     | nullable | Requerido para `centerline` y `edge`; opcional para `footprint` si el poligono ya trae huella |
| `edge_side`          | text        | nullable | `left`, `right`, `both`; requerido solo para `edge` si se implementa                          |
| `footprint_geometry` | jsonb       | yes      | Polygon/MultiPolygon calculado o directo                                                      |
| `source_type`        | text        | yes      | `kmz`, `manual`, `legacy`                                                                     |
| `status`             | text        | yes      | `ready`, `needs_review`, `invalid`                                                            |
| `sort_order`         | integer     | nullable | Orden de presentacion                                                                         |
| `created_at`         | timestamptz | yes      | Audit basica                                                                                  |
| `updated_at`         | timestamptz | yes      | Audit basica                                                                                  |

Validation:

- `input_mode = centerline` requires positive `width_m`.
- `input_mode = footprint` requires Polygon/MultiPolygon `footprint_geometry`.
- `input_mode = edge` requires positive `width_m` and `edge_side` before status can be `ready`.
- `status = ready` is required before a segment contributes to persisted servidumbre.

### Lot Servitude Result

Resultado persistido en `lots`, ampliando columnas existentes.

Campos legacy preservados:

| Field                 | Type    | Behavior                                                                                 |
| --------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `servidumbre_m2`      | numeric | Superficie afecta total calculada u oficial                                              |
| `superficie_neta_m2`  | numeric | Superficie total base menos servidumbre                                                  |
| `servidumbre_ancho_m` | numeric | Compatibilidad para ancho unico; null o primer ancho solo si se decide mantener fallback |

Campos nuevos propuestos:

| Field                             | Type        | Required    | Notes                                                                        |
| --------------------------------- | ----------- | ----------- | ---------------------------------------------------------------------------- |
| `servidumbre_widths_m`            | numeric[]   | nullable    | Anchos unicos ordenados, por ejemplo `{5,10}`                                |
| `servidumbre_ancho_label`         | text        | nullable    | Display legal: `5`, `10`, `5 y 10`                                           |
| `servidumbre_geometry`            | jsonb       | nullable    | Polygon/MultiPolygon de la interseccion lote x huellas                       |
| `servidumbre_sources`             | jsonb       | nullable    | Lista de segmentos que aportaron al resultado                                |
| `servidumbre_calculation_status`  | text        | yes/default | `not_calculated`, `calculated`, `needs_review`, `official_override`, `error` |
| `servidumbre_calculated_at`       | timestamptz | nullable    | Timestamp del ultimo calculo automatico                                      |
| `servidumbre_calculation_version` | text        | nullable    | Version logica del motor                                                     |

Validation:

- `servidumbre_m2 = 0` implies empty/null widths, null geometry and null label.
- `servidumbre_m2 > 0` implies at least one width or a footprint source marked width unknown but reviewed.
- `servidumbre_ancho_label` is derived from `servidumbre_widths_m` unless official override says otherwise.
- `official_override` status protects manual legal values from automatic overwrite.

### Viewer Servitude Feature

Entidad derivada, no necesariamente persistida como tabla.

| Property                  | Type        | Notes                          |
| ------------------------- | ----------- | ------------------------------ |
| `geometry_id`             | string      | Stable id for MapLibre feature |
| `geometry_type`           | `servitude` | New viewer geometry kind       |
| `lot_id`                  | string      | Lote afectado                  |
| `numero_lote`             | string      | Label/context                  |
| `servidumbre_m2`          | number      | Area afecta                    |
| `servidumbre_widths_m`    | number[]    | Widths                         |
| `servidumbre_ancho_label` | string      | Display label                  |
| `source_segment_ids`      | string[]    | Traceability                   |

### Servitude Calculation Input

Tipo puro para motor.

```ts
interface RoadSegmentInput {
  id: string
  geometry: GeoJSONGeometry
  mode: 'centerline' | 'footprint' | 'edge'
  widthM?: number
  edgeSide?: 'left' | 'right' | 'both'
}

interface LotServitudeInput {
  lotId: string
  lotGeometry: GeoJSONGeometry
  totalAreaM2: number | null
  roadSegments: RoadSegmentInput[]
}
```

### Servitude Calculation Output

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

## Relationships

- `projects` has many `project_road_segments`.
- `geometries` may reference road segments through `geometry_id`.
- `lots` store the latest result for operational use.
- Viewer features derive from lots with `servidumbre_geometry`.
- Document variables derive from lots and preserve `servidumbre_sources` for traceability.

## State Transitions

```text
road segment created
  -> needs_review (ambiguous line, missing width, invalid geometry)
  -> ready (mode + width/footprint valid)
  -> invalid (cannot normalize)

lot servitude
  -> not_calculated
  -> calculated (automatic result persisted)
  -> needs_review (ambiguous or invalid source)
  -> official_override (admin legal override)
  -> calculated (only after explicit recalc acceptance)
```

## Compatibility Rules

- Existing projects without `project_road_segments` are adapted from `projects.road_geometry` and `projects.road_width_m` as one legacy centerline segment.
- Existing `lots.servidumbre_ancho_m` continues to work for single-width projects.
- New multi-width lots must use `servidumbre_widths_m` and `servidumbre_ancho_label`.
- Any template or bridge that currently reads only `servidumbre_ancho_m` must prefer `servidumbre_ancho_label` when present.
