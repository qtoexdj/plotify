'use client'

import { useEffect, useState, useRef } from 'react'
import { useMap } from '@/components/ui/map'
import { ESTADO_CONFIG } from '@/lib/models/lot.model'
import type { ViewerFeature } from '@/types/viewer.types'

interface LotHoverCardProps {
  feature: ViewerFeature | null
}

/**
 * Floating tooltip that follows the mouse cursor when hovering a lot.
 * Shows lot number, estado badge, and basic metrics (m2, price).
 *
 * Renders as a DOM overlay positioned via map.project()
 * instead of a MapLibre popup, for better styling control.
 */
export function LotHoverCard({ feature }: LotHoverCardProps) {
  const { map } = useMap()
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!map || !feature) return

    const handleMouseMove = (e: MouseEvent) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        // Get the map container's bounding rect to calculate relative position
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

  // Derive display position: null out when no feature (avoids setState-in-effect lint)
  const displayPosition = feature ? position : null

  if (!feature || !displayPosition) return null

  const { geometry_type, numero_lote, estado, m2, precio } = feature.properties
  const stateKey = (estado || 'sin_asignar') as keyof typeof ESTADO_CONFIG
  const config = ESTADO_CONFIG[stateKey] || ESTADO_CONFIG.sin_asignar

  // Only show hover card for lots
  if (geometry_type !== 'lot') return null

  return (
    <div
      className="absolute z-50 pointer-events-none"
      style={{ left: displayPosition.x, top: displayPosition.y }}
    >
      <div className="bg-card rounded-lg shadow-lg border border-border px-3 py-2 min-w-35">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-semibold text-card-foreground">
            Lote {numero_lote || '—'}
          </span>
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${config.bgClass} ${config.textClass}`}
          >
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {m2 != null && <span>{m2.toLocaleString()} m²</span>}
          {precio != null && (
            <span>${precio.toLocaleString('es-CL')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
