import { calculateLegalMetrics } from './utm'
import type { GeoJSONGeometry } from '@/types/database.types'

/**
 * Calcula area legal UTM para Polygon/MultiPolygon, sumando todos los
 * componentes y descontando anillos interiores.
 *
 * Retorna `null` para geometrías no-polígono (LineString, MultiLineString)
 * o cuando no hay coordenadas suficientes.
 */
export function computeM2FromGeoJSON(geometry: GeoJSONGeometry): number | null {
  if (!geometry) return null

  if (geometry.type === 'Polygon') {
    const areaM2 = calculatePolygonLegalArea(geometry.coordinates as number[][][])
    return areaM2 === null ? null : Math.round(areaM2)
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates as number[][][][]
    const referencePoint = findFirstCoordinate(polygons)

    if (!referencePoint) return null

    let totalAreaM2 = 0
    let hasValidPolygon = false

    for (const polygon of polygons) {
      const areaM2 = calculatePolygonLegalArea(polygon, referencePoint)

      if (areaM2 !== null) {
        totalAreaM2 += areaM2
        hasValidPolygon = true
      }
    }

    return hasValidPolygon ? Math.round(totalAreaM2) : null
  }

  // LineString / MultiLineString → no tiene área
  return null
}

function calculatePolygonLegalArea(rings: number[][][], projectCentroid?: number[]): number | null {
  const outerRing = rings[0] ?? []

  if (!isValidRing(outerRing)) return null

  const referencePoint = projectCentroid ?? outerRing[0]
  let areaM2 = calculateLegalMetrics(outerRing, referencePoint).area_legal_m2

  for (const innerRing of rings.slice(1)) {
    if (isValidRing(innerRing)) {
      areaM2 -= calculateLegalMetrics(innerRing, referencePoint).area_legal_m2
    }
  }

  return Math.max(areaM2, 0)
}

function isValidRing(ring: number[][]): boolean {
  return ring.length >= 3
}

function findFirstCoordinate(polygons: number[][][][]): number[] | null {
  for (const polygon of polygons) {
    const coordinate = polygon[0]?.[0]

    if (coordinate) {
      return coordinate
    }
  }

  return null
}
