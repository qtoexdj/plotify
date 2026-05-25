import { describe, it, expect } from 'vitest'
import { computeM2FromGeoJSON } from '@/lib/geometry/compute-m2'
import type { GeoJSONGeometry } from '@/types/database.types'

describe('computeM2FromGeoJSON', () => {
  // ~100x100m square near Santiago
  const startLat = -33.45
  const startLon = -70.66
  const offsetLat = 100 / 111132
  const offsetLon = 100 / (111320 * Math.cos((startLat * Math.PI) / 180))

  const squareCoords = [
    [startLon, startLat],
    [startLon + offsetLon, startLat],
    [startLon + offsetLon, startLat + offsetLat],
    [startLon, startLat + offsetLat],
    [startLon, startLat],
  ]

  it('should return a positive number for a Polygon', () => {
    const geometry: GeoJSONGeometry = {
      type: 'Polygon',
      coordinates: [squareCoords],
    }

    const m2 = computeM2FromGeoJSON(geometry)
    expect(m2).toBeTypeOf('number')
    expect(m2).not.toBeNull()
    expect(m2!).toBeGreaterThan(9900)
    expect(m2!).toBeLessThan(10100)
  })

  it('should return a positive number for a MultiPolygon', () => {
    const geometry: GeoJSONGeometry = {
      type: 'MultiPolygon',
      coordinates: [[squareCoords]],
    }

    const m2 = computeM2FromGeoJSON(geometry)
    expect(m2).toBeTypeOf('number')
    expect(m2).not.toBeNull()
    expect(m2!).toBeGreaterThan(9900)
    expect(m2!).toBeLessThan(10100)
  })

  it('should return null for a LineString', () => {
    const geometry: GeoJSONGeometry = {
      type: 'LineString',
      coordinates: squareCoords,
    }

    const m2 = computeM2FromGeoJSON(geometry)
    expect(m2).toBeNull()
  })

  it('should return null for a MultiLineString', () => {
    const geometry: GeoJSONGeometry = {
      type: 'MultiLineString',
      coordinates: [squareCoords],
    }

    const m2 = computeM2FromGeoJSON(geometry)
    expect(m2).toBeNull()
  })

  it('should return null for a polygon with fewer than 3 points', () => {
    const geometry: GeoJSONGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    }

    const m2 = computeM2FromGeoJSON(geometry)
    expect(m2).toBeNull()
  })

  it('should return a rounded integer', () => {
    const geometry: GeoJSONGeometry = {
      type: 'Polygon',
      coordinates: [squareCoords],
    }

    const m2 = computeM2FromGeoJSON(geometry)
    expect(m2).toBe(Math.round(m2!))
  })
})
