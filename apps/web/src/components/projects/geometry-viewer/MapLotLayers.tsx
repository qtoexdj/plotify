'use client'

import { useEffect, useRef } from 'react'
import { useMap } from '@/components/ui/map'
import { useTheme } from 'next-themes'
import { ESTADO_CONFIG } from '@/lib/models/lot.model'
import type { ViewerFeatureCollection } from '@/types/viewer.types'
import type MapLibreGL from 'maplibre-gl'

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const SOURCE_ID = 'viewer-features'
const LOT_FILL_LAYER = 'lot-fill'
const LOT_OUTLINE_LAYER = 'lot-outline'
const LOT_LABELS_LAYER = 'lot-labels'
const ROAD_LAYER = 'road-line'
const COMMON_AREA_FILL_LAYER = 'common-area-fill'
const COMMON_AREA_OUTLINE_LAYER = 'common-area-outline'

const INFRA_CONFIG = {
  road: { stroke: '#f59e0b' },
  common_area: { fill: '#a78bfa', stroke: '#7c3aed' },
} as const

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build a MapLibre-compatible FeatureCollection, injecting fill/stroke
 * colors and centroid coordinates for labels.
 */
function enrichFeatureCollection(fc: ViewerFeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      const { geometry_type, estado } = f.properties
      let fillColor: string
      let strokeColor: string

      if (geometry_type === 'common_area') {
        fillColor = INFRA_CONFIG.common_area.fill
        strokeColor = INFRA_CONFIG.common_area.stroke
      } else if (geometry_type === 'lot') {
        const stateKey = (estado || 'sin_asignar') as keyof typeof ESTADO_CONFIG
        const cfg = ESTADO_CONFIG[stateKey] || ESTADO_CONFIG.sin_asignar
        fillColor = cfg.fill
        strokeColor = cfg.stroke
      } else {
        fillColor = 'transparent'
        strokeColor = INFRA_CONFIG.road.stroke
      }

      return {
        type: 'Feature' as const,
        geometry: f.geometry as GeoJSON.Geometry,
        properties: {
          ...f.properties,
          _fill_color: fillColor,
          _stroke_color: strokeColor,
        },
      }
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────

interface MapLotLayersProps {
  featureCollection: ViewerFeatureCollection
  selectedIds: Set<string>
  hoveredFeatureId: string | null
  onFeatureClick: (featureId: string, isMultiSelect: boolean) => void
  onFeatureHover: (featureId: string | null) => void
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

/**
 * Renders GeoJSON lots/roads/common_areas as MapLibre layers.
 *
 * Preserves all F7–F13 visual behaviours:
 * - Color by estado (disponible/reservado/vendido/sin_asignar)
 * - Roads as yellow lines
 * - Common areas as purple fills
 * - Lot number labels at centroids
 * - Hover highlight
 * - Selection highlight (blue border + shadow)
 * - Dimming of unselected features
 */
export function MapLotLayers({
  featureCollection,
  selectedIds,
  hoveredFeatureId,
  onFeatureClick,
  onFeatureHover,
}: MapLotLayersProps) {
  const { map, isLoaded } = useMap()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const layersAdded = useRef(false)

  // ─── Setup source + layers ────────────────────────────────────────────
  useEffect(() => {
    if (!map || !isLoaded) return

    const enriched = enrichFeatureCollection(featureCollection)

    // If source already exists (same theme, data update only), just update data
    const existingSource = map.getSource(SOURCE_ID) as MapLibreGL.GeoJSONSource | undefined
    if (existingSource && map.getLayer(LOT_FILL_LAYER)) {
      existingSource.setData(enriched)
      return
    }

    // Clean up stale sources if they exist without layers (after style change)
    if (existingSource) map.removeSource(SOURCE_ID)

    // Add source
    map.addSource(SOURCE_ID, { type: 'geojson', data: enriched })

    // ─── Common Areas (bottom) ──────────────────────────────────────────
    map.addLayer({
      id: COMMON_AREA_FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'geometry_type'], 'common_area'],
      paint: {
        'fill-color': ['get', '_fill_color'],
        'fill-opacity': 0.6,
      },
    })
    map.addLayer({
      id: COMMON_AREA_OUTLINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'geometry_type'], 'common_area'],
      paint: {
        'line-color': ['get', '_stroke_color'],
        'line-width': 1.5,
      },
    })

    // ─── Lot Fill ───────────────────────────────────────────────────────
    map.addLayer({
      id: LOT_FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'geometry_type'], 'lot'],
      paint: {
        'fill-color': ['get', '_fill_color'],
        'fill-opacity': 0.75,
      },
    })

    // ─── Lot Outline ────────────────────────────────────────────────────
    map.addLayer({
      id: LOT_OUTLINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'geometry_type'], 'lot'],
      paint: {
        'line-color': ['get', '_stroke_color'],
        'line-width': 1.5,
      },
    })

    // ─── Road Lines ─────────────────────────────────────────────────────
    map.addLayer({
      id: ROAD_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'geometry_type'], 'road'],
      paint: {
        'line-color': INFRA_CONFIG.road.stroke,
        'line-width': 2.5,
        'line-opacity': 0.9,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    })

    // ─── Lot Number Labels (placed on polygons directly by MapLibre) ───
    map.addLayer({
      id: LOT_LABELS_LAYER,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['all',
        ['==', ['get', 'geometry_type'], 'lot'],
        ['has', 'numero_lote'],
      ],
      layout: {
        'symbol-placement': 'point',
        'text-field': ['to-string', ['get', 'numero_lote']],
        'text-size': 12,
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': isDark ? '#e5e7eb' : '#1f2937',
        'text-halo-color': isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
        'text-halo-width': 1.8,
      },
    })

    layersAdded.current = true
  }, [map, isLoaded, featureCollection, isDark])

  // ─── Hover events ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !isLoaded || !layersAdded.current) return

    const interactiveLayers = [LOT_FILL_LAYER, ROAD_LAYER, COMMON_AREA_FILL_LAYER]

    const handleMouseMove = (e: MapLibreGL.MapLayerMouseEvent) => {
      if (e.features && e.features.length > 0) {
        const geoId = e.features[0].properties?.geometry_id as string
        onFeatureHover(geoId)
        map.getCanvas().style.cursor = 'pointer'
      }
    }

    const handleMouseLeave = () => {
      onFeatureHover(null)
      map.getCanvas().style.cursor = ''
    }

    const handleClick = (e: MapLibreGL.MapLayerMouseEvent) => {
      if (e.features && e.features.length > 0) {
        const geoId = e.features[0].properties?.geometry_id as string
        const isMulti = e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey
        onFeatureClick(geoId, isMulti)
      }
    }

    for (const layer of interactiveLayers) {
      map.on('mousemove', layer, handleMouseMove)
      map.on('mouseleave', layer, handleMouseLeave)
      map.on('click', layer, handleClick)
    }

    return () => {
      for (const layer of interactiveLayers) {
        map.off('mousemove', layer, handleMouseMove)
        map.off('mouseleave', layer, handleMouseLeave)
        map.off('click', layer, handleClick)
      }
    }
  }, [map, isLoaded, onFeatureClick, onFeatureHover])

  // ─── Selection & Hover visual states ──────────────────────────────────
  useEffect(() => {
    if (!map || !isLoaded || !layersAdded.current) return
    // Defensive: layers may have been removed by a style change (theme toggle)
    if (!map.getLayer(LOT_FILL_LAYER)) return

    const hasSelection = selectedIds.size > 0
    const selectedArr = Array.from(selectedIds)

    // --- Lot Fill opacity (F12 dimming + F13 selected) ---
    if (hasSelection) {
      map.setPaintProperty(LOT_FILL_LAYER, 'fill-opacity', [
        'case',
        ['in', ['get', 'geometry_id'], ['literal', selectedArr]],
        0.95, // selected
        hoveredFeatureId
          ? ['case', ['==', ['get', 'geometry_id'], hoveredFeatureId], 0.85, 0.4]
          : 0.4, // dimmed
      ])
    } else {
      map.setPaintProperty(LOT_FILL_LAYER, 'fill-opacity', [
        'case',
        hoveredFeatureId
          ? ['==', ['get', 'geometry_id'], hoveredFeatureId]
          : false,
        0.85,
        0.75, // default
      ])
    }

    // --- Lot Outline (F13 selected = blue border) ---
    map.setPaintProperty(LOT_OUTLINE_LAYER, 'line-color', [
      'case',
      ['in', ['get', 'geometry_id'], ['literal', selectedArr.length > 0 ? selectedArr : ['__none__']]],
      '#1d4ed8', // selected blue
      ['get', '_stroke_color'], // default
    ])
    map.setPaintProperty(LOT_OUTLINE_LAYER, 'line-width', [
      'case',
      ['in', ['get', 'geometry_id'], ['literal', selectedArr.length > 0 ? selectedArr : ['__none__']]],
      3.5,
      hoveredFeatureId
        ? ['case', ['==', ['get', 'geometry_id'], hoveredFeatureId], 2.5, 1.5]
        : 1.5,
    ])

    // --- Road hover (F11) ---
    map.setPaintProperty(ROAD_LAYER, 'line-width', [
      'case',
      hoveredFeatureId
        ? ['==', ['get', 'geometry_id'], hoveredFeatureId]
        : false,
      4,
      2.5,
    ])

    // --- Common area dimming ---
    if (hasSelection) {
      map.setPaintProperty(COMMON_AREA_FILL_LAYER, 'fill-opacity', 0.35)
    } else {
      map.setPaintProperty(COMMON_AREA_FILL_LAYER, 'fill-opacity', 0.6)
    }

    // --- Label bold for selected lots (F10 + F13) ---
    const defaultLabelColor = isDark ? '#f3f4f6' : '#1f2937'
    const selectedLabelColor = isDark ? '#93c5fd' : '#1e3a8a'

    if (hasSelection) {
      map.setLayoutProperty(LOT_LABELS_LAYER, 'text-size', [
        'case',
        ['in', ['get', 'geometry_id'], ['literal', selectedArr]],
        14,
        12,
      ])
      map.setPaintProperty(LOT_LABELS_LAYER, 'text-color', [
        'case',
        ['in', ['get', 'geometry_id'], ['literal', selectedArr]],
        selectedLabelColor,
        defaultLabelColor,
      ])
    } else {
      map.setLayoutProperty(LOT_LABELS_LAYER, 'text-size', 12)
      map.setPaintProperty(LOT_LABELS_LAYER, 'text-color', defaultLabelColor)
    }

    // --- Label halo adapts to theme ---
    map.setPaintProperty(LOT_LABELS_LAYER, 'text-halo-color', isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)')
    map.setPaintProperty(LOT_LABELS_LAYER, 'text-halo-width', 2)
  }, [map, isLoaded, selectedIds, hoveredFeatureId, isDark])

  // ─── Cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (!map) return
      try {
        const layers = [
          LOT_LABELS_LAYER, ROAD_LAYER, LOT_OUTLINE_LAYER,
          LOT_FILL_LAYER, COMMON_AREA_OUTLINE_LAYER, COMMON_AREA_FILL_LAYER,
        ]
        for (const id of layers) {
          if (map.getLayer(id)) map.removeLayer(id)
        }
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      } catch {
        // Map instance already destroyed
      }
      layersAdded.current = false
    }
  }, [map])

  return null // This is a renderless component — uses imperative MapLibre API
}
