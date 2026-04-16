'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useMap } from '@/components/ui/map'
import { useTheme } from 'next-themes'
import { ASSIGNMENT_COLORS } from './types'
import type MapLibreGL from 'maplibre-gl'

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const SOURCE_ID = 'assignment-features'
const LOT_FILL_LAYER = 'assignment-lot-fill'
const LOT_OUTLINE_LAYER = 'assignment-lot-outline'
const LOT_LABELS_LAYER = 'assignment-lot-labels'
const ROAD_LAYER = 'assignment-road-line'
const COMMON_AREA_FILL_LAYER = 'assignment-common-area-fill'
const COMMON_AREA_OUTLINE_LAYER = 'assignment-common-area-outline'

const INTERACTIVE_LAYERS = [LOT_FILL_LAYER, ROAD_LAYER, COMMON_AREA_FILL_LAYER]

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function enrichFeatureCollection(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      const geometryType = (f.properties?.geometryType || 'lot') as keyof typeof ASSIGNMENT_COLORS
      const cfg = ASSIGNMENT_COLORS[geometryType] || ASSIGNMENT_COLORS.lot

      return {
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: {
          ...f.properties,
          _fill_color: cfg.fill,
          _stroke_color: cfg.stroke,
        },
      }
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────

interface AssignmentMapLayersProps {
  featureCollection: GeoJSON.FeatureCollection
  selectedIds: Set<string>
  hoveredFeatureId: string | null
  onFeatureClick: (featureId: string, isMultiSelect: boolean) => void
  onFeatureHover: (featureId: string | null) => void
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export function AssignmentMapLayers({
  featureCollection,
  selectedIds,
  hoveredFeatureId,
  onFeatureClick,
  onFeatureHover,
}: AssignmentMapLayersProps) {
  const { map, isLoaded } = useMap()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const layersAdded = useRef(false)
  const eventsAdded = useRef(false)
  const mapRef = useRef(map)

  // Stable refs — events always call the latest callback without rebinding
  const onClickRef = useRef(onFeatureClick)
  const onHoverRef = useRef(onFeatureHover)

  useEffect(() => {
    onClickRef.current = onFeatureClick
    onHoverRef.current = onFeatureHover
    mapRef.current = map
  }, [onFeatureClick, onFeatureHover, map])

  // Stable event handlers that delegate to refs (never change identity)
  const handleMouseMove = useCallback((e: MapLibreGL.MapLayerMouseEvent) => {
    if (e.features && e.features.length > 0) {
      const tempId = e.features[0].properties?.tempId as string
      onHoverRef.current(tempId)
      e.target.getCanvas().style.cursor = 'pointer'
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    onHoverRef.current(null)
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = ''
  }, [])

  const handleClick = useCallback((e: MapLibreGL.MapLayerMouseEvent) => {
    if (e.features && e.features.length > 0) {
      const tempId = e.features[0].properties?.tempId as string
      const isMulti = e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey
      onClickRef.current(tempId, isMulti)
    }
  }, [])

  // ─── Setup source + layers ────────────────────────────────────────────
  useEffect(() => {
    if (!map || !isLoaded) return

    const enriched = enrichFeatureCollection(featureCollection)

    const existingSource = map.getSource(SOURCE_ID) as MapLibreGL.GeoJSONSource | undefined
    if (existingSource && map.getLayer(LOT_FILL_LAYER)) {
      existingSource.setData(enriched)
      return
    }

    // If layers were previously bound, clear stale event listeners
    if (eventsAdded.current) {
      for (const layer of INTERACTIVE_LAYERS) {
        map.off('mousemove', layer, handleMouseMove)
        map.off('mouseleave', layer, handleMouseLeave)
        map.off('click', layer, handleClick)
      }
      eventsAdded.current = false
    }

    if (existingSource) map.removeSource(SOURCE_ID)

    map.addSource(SOURCE_ID, { type: 'geojson', data: enriched })

    // ─── Common Areas (bottom) ──────────────────────────────────────────
    map.addLayer({
      id: COMMON_AREA_FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'geometryType'], 'common_area'],
      paint: {
        'fill-color': ['get', '_fill_color'],
        'fill-opacity': 0.6,
      },
    })
    map.addLayer({
      id: COMMON_AREA_OUTLINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'geometryType'], 'common_area'],
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
      filter: ['==', ['get', 'geometryType'], 'lot'],
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
      filter: ['==', ['get', 'geometryType'], 'lot'],
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
      filter: ['==', ['get', 'geometryType'], 'road'],
      paint: {
        'line-color': ASSIGNMENT_COLORS.road.stroke,
        'line-width': 2.5,
        'line-opacity': 0.9,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    })

    // ─── Labels ─────────────────────────────────────────────────────────
    map.addLayer({
      id: LOT_LABELS_LAYER,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['==', ['get', 'geometryType'], 'lot'],
      layout: {
        'symbol-placement': 'point',
        'text-field': ['coalesce', ['get', 'name'], ['get', 'Name'], ''],
        'text-size': 11,
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

    // ─── Bind events once, right after layer creation ─────────────────
    for (const layer of INTERACTIVE_LAYERS) {
      map.on('mousemove', layer, handleMouseMove)
      map.on('mouseleave', layer, handleMouseLeave)
      map.on('click', layer, handleClick)
    }
    eventsAdded.current = true
  }, [map, isLoaded, featureCollection, isDark, handleMouseMove, handleMouseLeave, handleClick])

  // ─── Selection & Hover visual states ──────────────────────────────────
  useEffect(() => {
    if (!map || !isLoaded || !layersAdded.current) return
    if (!map.getLayer(LOT_FILL_LAYER)) return

    const hasSelection = selectedIds.size > 0
    const selectedArr = Array.from(selectedIds)

    // --- Lot Fill opacity ---
    if (hasSelection) {
      map.setPaintProperty(LOT_FILL_LAYER, 'fill-opacity', [
        'case',
        ['in', ['get', 'tempId'], ['literal', selectedArr]],
        0.95,
        hoveredFeatureId
          ? ['case', ['==', ['get', 'tempId'], hoveredFeatureId], 0.85, 0.4]
          : 0.4,
      ])
    } else {
      map.setPaintProperty(LOT_FILL_LAYER, 'fill-opacity', [
        'case',
        hoveredFeatureId
          ? ['==', ['get', 'tempId'], hoveredFeatureId]
          : false,
        0.85,
        0.75,
      ])
    }

    // --- Lot Outline (selected = blue border) ---
    map.setPaintProperty(LOT_OUTLINE_LAYER, 'line-color', [
      'case',
      ['in', ['get', 'tempId'], ['literal', selectedArr.length > 0 ? selectedArr : ['__none__']]],
      '#1d4ed8',
      ['get', '_stroke_color'],
    ])
    map.setPaintProperty(LOT_OUTLINE_LAYER, 'line-width', [
      'case',
      ['in', ['get', 'tempId'], ['literal', selectedArr.length > 0 ? selectedArr : ['__none__']]],
      3.5,
      hoveredFeatureId
        ? ['case', ['==', ['get', 'tempId'], hoveredFeatureId], 2.5, 1.5]
        : 1.5,
    ])

    // --- Road selection + hover ---
    const selOrNone = selectedArr.length > 0 ? selectedArr : ['__none__']
    map.setPaintProperty(ROAD_LAYER, 'line-color', [
      'case',
      ['in', ['get', 'tempId'], ['literal', selOrNone]],
      '#1d4ed8',
      ASSIGNMENT_COLORS.road.stroke,
    ])
    map.setPaintProperty(ROAD_LAYER, 'line-width', [
      'case',
      ['in', ['get', 'tempId'], ['literal', selOrNone]],
      4.5,
      hoveredFeatureId
        ? ['case', ['==', ['get', 'tempId'], hoveredFeatureId], 4, 2.5]
        : 2.5,
    ])
    map.setPaintProperty(ROAD_LAYER, 'line-opacity', [
      'case',
      ['in', ['get', 'tempId'], ['literal', selOrNone]],
      1,
      hasSelection ? 0.45 : 0.9,
    ])

    // --- Common area dimming ---
    map.setPaintProperty(COMMON_AREA_FILL_LAYER, 'fill-opacity', hasSelection ? 0.35 : 0.6)

    // --- Label highlight ---
    const defaultLabelColor = isDark ? '#f3f4f6' : '#1f2937'
    const selectedLabelColor = isDark ? '#93c5fd' : '#1e3a8a'

    if (hasSelection) {
      map.setLayoutProperty(LOT_LABELS_LAYER, 'text-size', [
        'case',
        ['in', ['get', 'tempId'], ['literal', selectedArr]],
        14,
        11,
      ])
      map.setPaintProperty(LOT_LABELS_LAYER, 'text-color', [
        'case',
        ['in', ['get', 'tempId'], ['literal', selectedArr]],
        selectedLabelColor,
        defaultLabelColor,
      ])
    } else {
      map.setLayoutProperty(LOT_LABELS_LAYER, 'text-size', 11)
      map.setPaintProperty(LOT_LABELS_LAYER, 'text-color', defaultLabelColor)
    }

    map.setPaintProperty(LOT_LABELS_LAYER, 'text-halo-color', isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)')
    map.setPaintProperty(LOT_LABELS_LAYER, 'text-halo-width', 2)
  }, [map, isLoaded, selectedIds, hoveredFeatureId, isDark])

  // ─── Cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (!map) return
      try {
        // Remove event listeners
        if (eventsAdded.current) {
          for (const layer of INTERACTIVE_LAYERS) {
            map.off('mousemove', layer, handleMouseMove)
            map.off('mouseleave', layer, handleMouseLeave)
            map.off('click', layer, handleClick)
          }
          eventsAdded.current = false
        }

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
  }, [map, handleMouseMove, handleMouseLeave, handleClick])

  return null
}
