# Contract: Viewer Servidumbre Overlay

**Feature**: 014-servidumbre-precision-visor · **Date**: 2026-07-02

## Feature Properties

Viewer feature collections must support a servitude geometry kind:

```ts
interface ViewerServitudeProperties {
  geometry_id: string
  geometry_type: 'servitude'
  lot_id: string
  numero_lote?: string
  servidumbre_m2: number
  servidumbre_widths_m?: number[]
  servidumbre_ancho_label?: string | null
  source_segment_ids?: string[]
}
```

## Rendering Requirements

- Servitude footprints render as fill polygons with a distinct color/opacity from lot status fills.
- Servitude outlines render above lot fills and below lot labels.
- Road line/polygon rendering remains visible enough to compare road source vs affected footprint.
- Hover/click behavior must still select the owning lot or expose the owning lot id.
- Empty servitude geometry must not create blank or invalid map layers.

## Data Refresh

- If the `viewer-features` source already exists, updated overlay data must replace the source data instead of duplicating layers.
- A recalculated lot must show the new footprint after refresh.

## Required Tests

- Viewer feature collection contains `servitude` features for lots with area > 0.
- Viewer feature collection excludes lots with zero/null servitude geometry.
- Map layer setup includes fill and outline filters for `geometry_type = servitude`.
- Lot panel displays `servidumbre_ancho_label` when present.
