'use client'

import { useEffect, useState, useRef } from 'react'
import { useMap } from '@/components/ui/map'
import { ASSIGNMENT_COLORS } from './types'

interface AssignmentHoverCardProps {
  featureId: string | null
  featureCollection: GeoJSON.FeatureCollection
}

export function AssignmentHoverCard({ featureId, featureCollection }: AssignmentHoverCardProps) {
  const { map } = useMap()
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  const feature = featureId
    ? featureCollection.features.find((f) => f.properties?.tempId === featureId)
    : null

  useEffect(() => {
    if (!map || !feature) return

    const handleMouseMove = (e: MouseEvent) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const canvas = map.getCanvas()
        const rect = canvas.getBoundingClientRect()
        setPosition({
          x: e.clientX - rect.left + 12,
          y: e.clientY - rect.top - 12,
        })
      })
    }

    const canvas = map.getCanvas()
    canvas.addEventListener('mousemove', handleMouseMove)

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [map, feature])

  const displayPosition = feature ? position : null

  if (!feature || !displayPosition) return null

  const geometryType = (feature.properties?.geometryType || 'lot') as keyof typeof ASSIGNMENT_COLORS
  const name = feature.properties?.name || feature.properties?.Name || ''
  const typeLabel =
    geometryType === 'lot' ? 'Lote' : geometryType === 'road' ? 'Camino' : 'Área Común'

  const typeColor =
    geometryType === 'lot'
      ? 'bg-emerald-100 text-emerald-700'
      : geometryType === 'road'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-violet-100 text-violet-700'

  return (
    <div
      className="absolute z-50 pointer-events-none"
      style={{ left: displayPosition.x, top: displayPosition.y }}
    >
      <div className="bg-card rounded-lg shadow-lg border border-border px-3 py-2 min-w-28">
        <div className="flex items-center justify-between gap-2 mb-1">
          {name && (
            <span className="text-sm font-semibold text-card-foreground truncate max-w-32">
              {String(name)}
            </span>
          )}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeColor}`}>
            {typeLabel}
          </span>
        </div>
        {/* Show up to 2 extra KML properties */}
        {feature.properties && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {Object.entries(feature.properties)
              .filter(
                ([k]) =>
                  !['tempId', 'geometryType', 'name', 'Name', '_fill_color', '_stroke_color'].includes(k)
              )
              .slice(0, 2)
              .map(([key, val]) => (
                <span key={key}>
                  {key}: {String(val ?? '-')}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
