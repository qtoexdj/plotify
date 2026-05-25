import { calculateLegalMetrics } from './utm'
import type { GeoJSONGeometry } from '@/types/database.types'

/**
 * Extrae las coordenadas del primer anillo de un GeoJSON Polygon/MultiPolygon
 * y calcula el área legal (UTM) redondeada en m².
 *
 * Retorna `null` para geometrías no-polígono (LineString, MultiLineString)
 * o cuando no hay coordenadas suficientes.
 */
export function computeM2FromGeoJSON(geometry: GeoJSONGeometry): number | null {
  if (!geometry) return null

  let coords: number[][] = []

  if (geometry.type === 'Polygon') {
    coords = (geometry.coordinates as number[][][])[0] ?? []
  } else if (geometry.type === 'MultiPolygon') {
    coords = (geometry.coordinates as number[][][][])[0]?.[0] ?? []
  } else {
    // LineString / MultiLineString → no tiene área
    return null
  }

  if (coords.length < 3) return null

  const metrics = calculateLegalMetrics(coords)
  return Math.round(metrics.area_legal_m2)
}
