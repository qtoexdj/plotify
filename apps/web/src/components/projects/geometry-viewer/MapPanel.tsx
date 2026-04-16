'use client'

import { useRef, useEffect, useState, type ReactNode } from 'react'
import { Map, MapControls, useMap } from '@/components/ui/map'
import bbox from '@turf/bbox'
import type { ViewerFeatureCollection } from '@/types/viewer.types'
import type MapLibreGL from 'maplibre-gl'

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface MapPanelProps {
  featureCollection: ViewerFeatureCollection
  children: ReactNode
  className?: string
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Computes [west, south, east, north] bounds from the FeatureCollection,
 * adding a small padding so polygons don't touch edges.
 */
function computeBoundsFromFC(
  fc: ViewerFeatureCollection
): MapLibreGL.LngLatBoundsLike | null {
  if (fc.features.length === 0) return null

  try {
    // bbox returns [minX, minY, maxX, maxY] = [west, south, east, north]
    const geojson = fc as unknown as GeoJSON.FeatureCollection
    const b = bbox(geojson)
    return [b[0], b[1], b[2], b[3]] as [number, number, number, number]
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Inner component (has access to useMap)
// ─────────────────────────────────────────────────────────────────────────

function MapAutoFit({ featureCollection }: { featureCollection: ViewerFeatureCollection }) {
  const { map, isLoaded } = useMap()
  const hasFitted = useRef(false)

  useEffect(() => {
    if (!map || !isLoaded || hasFitted.current) return

    const bounds = computeBoundsFromFC(featureCollection)
    if (!bounds) return

    map.fitBounds(bounds, { padding: 60, maxZoom: 18, duration: 0 })
    hasFitted.current = true
  }, [map, isLoaded, featureCollection])

  // Re-fit when features change significantly (e.g. project switch via refreshKey)
  useEffect(() => {
    if (!map || !isLoaded) return
    const bounds = computeBoundsFromFC(featureCollection)
    if (!bounds) return

    // Only re-fit if it's after initial load and feature count changed
    if (hasFitted.current) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 18, duration: 500 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureCollection.features.length])

  return null
}

// ─────────────────────────────────────────────────────────────────────────
// MapPanel
// ─────────────────────────────────────────────────────────────────────────

/**
 * Wraps mapcn <Map> with:
 * - Auto-fit bounds to FeatureCollection
 * - Zoom/fullscreen controls (bottom-left to match current UI)
 * - Children slot for GeoJSON layers and hover cards
 */
export function MapPanel({ featureCollection, children, className }: MapPanelProps) {
  // Compute initial center from the FC to avoid flicker
  const [initialCenter] = useState<[number, number]>(() => {
    const bounds = computeBoundsFromFC(featureCollection)
    if (!bounds) return [-70.65, -33.45] // Santiago default
    const [w, s, e, n] = bounds as [number, number, number, number]
    return [(w + e) / 2, (s + n) / 2]
  })

  return (
    <Map
      className={className}
      center={initialCenter}
      zoom={14}
      scrollZoom
      dragPan
      touchZoomRotate
      doubleClickZoom
      attributionControl={false}
    >
      <MapAutoFit featureCollection={featureCollection} />
      <MapControls position="top-left" showCompass showZoom={false} />
      <MapControls
        position="bottom-left"
        showZoom
        showFullscreen
      />
      {children}
    </Map>
  )
}
