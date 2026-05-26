import { describe, expect, it } from 'vitest'
import { calculateLegalMetrics } from '@/lib/geometry/utm'
import { getBoundaries } from '@/lib/geometry/utils'
import { generateDeslindeText } from '@/lib/legal/deslinde-generator'
import type { OfficialBoundary } from '@/types/database.types'

const BASE_LAT = -33.45
const BASE_LON = -70.66
const DEG_PER_M_LAT = 1 / 111132
const DEG_PER_M_LON = 1 / (111320 * Math.cos((BASE_LAT * Math.PI) / 180))

function offset(dxMeters: number, dyMeters: number): [number, number] {
  return [BASE_LON + dxMeters * DEG_PER_M_LON, BASE_LAT + dyMeters * DEG_PER_M_LAT]
}

describe('MVP project readiness geometry contract', () => {
  it('derives boundary groups, perimeter, m2, hectares, and legal deslinde inputs', () => {
    const coords = [offset(0, 0), offset(100, 0), offset(100, 100), offset(0, 100), offset(0, 0)]

    const metrics = calculateLegalMetrics(coords)
    const boundaries = getBoundaries(coords)
    const officialBoundaries: OfficialBoundary[] = boundaries.map((boundary) => ({
      label: boundary.direction,
      description: `${boundary.direction} ${boundary.distance.toFixed(2)}m`,
      distance: Number(boundary.distance.toFixed(2)),
      colinda: `Lote ${boundary.direction}`,
    }))
    const deslindeText = generateDeslindeText({
      numero_lote: '24',
      area_official_m2: Math.round(metrics.area_legal_m2),
      m2: Math.round(metrics.area_geodesic_m2),
      servidumbre_m2: 0,
      boundaries_official: officialBoundaries,
    })

    expect(metrics.area_legal_m2).toBeGreaterThan(9900)
    expect(metrics.area_legal_m2).toBeLessThan(10100)
    expect(metrics.area_legal_m2 / 10000).toBeGreaterThan(0.99)
    expect(metrics.perimeter_legal_m).toBeGreaterThan(395)
    expect(metrics.perimeter_legal_m).toBeLessThan(405)
    expect(new Set(boundaries.map((boundary) => boundary.direction))).toEqual(
      new Set(['Norte', 'Sur', 'Oriente', 'Poniente'])
    )
    expect(officialBoundaries).toHaveLength(4)
    expect(deslindeText).toContain('METROS CUADRADOS')
    expect(deslindeText).toContain('deslinda')
    expect(deslindeText).toContain('NORTE')
    expect(deslindeText).toContain('SUR')
  })
})
