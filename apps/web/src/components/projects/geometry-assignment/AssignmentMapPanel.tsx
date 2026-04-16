'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Map, MapControls, useMap } from '@/components/ui/map'
import bbox from '@turf/bbox'

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface AssignmentMapPanelProps {
  featureCollection: GeoJSON.FeatureCollection
  children: ReactNode
  className?: string
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function computeBoundsFromFC(
  fc: GeoJSON.FeatureCollection
): [number, number, number, number] | null {
  if (fc.features.length === 0) return null
  try {
    const b = bbox(fc)
    return [b[0], b[1], b[2], b[3]]
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────
// AutoFit (has access to useMap)
// ─────────────────────────────────────────────────────────────────────────

function MapAutoFit({ featureCollection }: { featureCollection: GeoJSON.FeatureCollection }) {
  const { map, isLoaded } = useMap()
  const hasFitted = useRef(false)

  useEffect(() => {
    if (!map || !isLoaded || hasFitted.current) return
    const bounds = computeBoundsFromFC(featureCollection)
    if (!bounds) return
    map.fitBounds(bounds, { padding: 60, maxZoom: 18, duration: 0 })
    hasFitted.current = true
  }, [map, isLoaded, featureCollection])

  return null
}

// ─────────────────────────────────────────────────────────────────────────
// AssignmentMapPanel
// ─────────────────────────────────────────────────────────────────────────

export function AssignmentMapPanel({ featureCollection, children, className }: AssignmentMapPanelProps) {
  const [initialCenter] = useState<[number, number]>(() => {
    const bounds = computeBoundsFromFC(featureCollection)
    if (!bounds) return [-70.65, -33.45] // Santiago default
    const [w, s, e, n] = bounds
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
      <MapControls position="bottom-left" showZoom showFullscreen />
      {children}
    </Map>
  )
}
