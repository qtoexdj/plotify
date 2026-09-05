import { describe, expect, it } from 'vitest'
import { normalizeGeoJSON } from '@/lib/services/kml-to-geojson.service'
import { computeM2FromGeoJSON } from '@/lib/geometry/compute-m2'

/** Anillo cerrado ~30m x 30m, como lo exporta un CAD: LineString, no Polygon. */
const closedRing = [
  [-71.5, -34.5],
  [-71.4997, -34.5],
  [-71.4997, -34.4997],
  [-71.5, -34.4997],
  [-71.5, -34.5],
]

const openLine = [
  [-71.5, -34.5],
  [-71.4, -34.4],
  [-71.3, -34.3],
]

function collection(geometry: unknown, properties: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry, properties }] } as any
}

describe('normalizeGeoJSON — perímetros CAD como LineString cerrada', () => {
  it('convierte una LineString cerrada en Polygon y la clasifica como lote', () => {
    const [feature] = normalizeGeoJSON(collection({ type: 'LineString', coordinates: closedRing }))

    expect(feature.geometry.type).toBe('Polygon')
    expect(feature.geometryType).toBe('lot')
    // El objetivo real de la conversión: que el lote tenga superficie.
    expect(computeM2FromGeoJSON(feature.geometry)).toBeGreaterThan(0)
  })

  it('deja intacta una LineString abierta y la mantiene como camino', () => {
    const [feature] = normalizeGeoJSON(collection({ type: 'LineString', coordinates: openLine }))

    expect(feature.geometry.type).toBe('LineString')
    expect(feature.geometryType).toBe('road')
  })

  it('respeta el nombre del KML al clasificar un perímetro cerrado que es camino', () => {
    const [feature] = normalizeGeoJSON(
      collection({ type: 'LineString', coordinates: closedRing }, { name: 'Camino interior' })
    )

    expect(feature.geometry.type).toBe('Polygon')
    expect(feature.geometryType).toBe('road')
  })

  it('no adivina con un MultiLineString de varias líneas (contorno vs. islas)', () => {
    const [feature] = normalizeGeoJSON(
      collection({ type: 'MultiLineString', coordinates: [closedRing, closedRing] })
    )

    expect(feature.geometry.type).toBe('MultiLineString')
  })

  it('conserva los Polygon que ya venían bien', () => {
    const [feature] = normalizeGeoJSON(collection({ type: 'Polygon', coordinates: [closedRing] }))

    expect(feature.geometry.type).toBe('Polygon')
    expect(feature.geometryType).toBe('lot')
  })
})
