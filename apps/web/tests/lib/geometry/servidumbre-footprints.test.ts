import { describe, expect, it } from 'vitest'
import {
  calculateLotServitude,
  formatServidumbreWidths,
  normalizeRoadSegmentToFootprint,
} from '@/lib/geometry/servidumbre-footprints'
import {
  lineStringFromMeters,
  metricServidumbreFixtures,
  rectanglePolygon,
} from './servidumbre-fixtures'
import { tenoServidumbreFixtureCases } from './teno-servidumbre.fixture'

describe('servidumbre footprint engine', () => {
  it('formats servitude widths as the legal display label for single and multiple road widths', () => {
    expect(formatServidumbreWidths([])).toBeNull()
    expect(formatServidumbreWidths([5])).toBe('5')
    expect(formatServidumbreWidths([10])).toBe('10')
    expect(formatServidumbreWidths([5, 10])).toBe('5 y 10')
    expect(formatServidumbreWidths([10, 5, 10])).toBe('5 y 10')
    expect(formatServidumbreWidths([7.5, 5])).toBe('5 y 7.5')
  })

  it('normalizes centerline road segments to ready footprints using the full road width', () => {
    const footprint = normalizeRoadSegmentToFootprint({
      id: 'road-5m',
      geometry: metricServidumbreFixtures.centerline5m,
      mode: 'centerline',
      widthM: 5,
    })

    expect(footprint.status).toBe('ready')
    expect(footprint.segmentId).toBe('road-5m')
    expect(footprint.widthM).toBe(5)
    expect(footprint.widthLabel).toBe('5')
    expect(footprint.geometry?.geometry.type).toMatch(/Polygon/)
    expect(footprint.warnings).toEqual([])
  })

  it('uses polygon footprint inputs directly without buffering them again', () => {
    const polygonFootprint = rectanglePolygon(10, 10, 20, 30)

    const footprint = normalizeRoadSegmentToFootprint({
      id: 'road-polygon',
      geometry: polygonFootprint,
      mode: 'footprint',
      widthM: 10,
    })

    expect(footprint.status).toBe('ready')
    expect(footprint.geometry?.geometry).toEqual(polygonFootprint)
    expect(footprint.widthM).toBe(10)
    expect(footprint.widthLabel).toBe('10')
  })

  it('calculates lot servitude from the union of 5m and 10m footprints without double counting their overlap', () => {
    const result = calculateLotServitude({
      lotId: 'lot-1',
      lotGeometry: metricServidumbreFixtures.lot100x100,
      totalAreaM2: 10_000,
      roadSegments: [
        {
          id: 'road-5m-horizontal',
          geometry: lineStringFromMeters([
            [-10, 25],
            [110, 25],
          ]),
          mode: 'centerline',
          widthM: 5,
        },
        {
          id: 'road-10m-vertical',
          geometry: lineStringFromMeters([
            [50, -10],
            [50, 110],
          ]),
          mode: 'centerline',
          widthM: 10,
        },
      ],
    })

    expect(result.status).toBe('calculated')
    expect(result.servidumbreM2).toBeGreaterThan(1_425)
    expect(result.servidumbreM2).toBeLessThan(1_475)
    expect(result.superficieNetaM2).toBeGreaterThan(8_525)
    expect(result.superficieNetaM2).toBeLessThan(8_575)
    expect(result.widthsM).toEqual([5, 10])
    expect(result.widthLabel).toBe('5 y 10')
    expect(result.sourceSegmentIds).toEqual(['road-5m-horizontal', 'road-10m-vertical'])
    expect(result.intersectionGeometry?.geometry.type).toMatch(/Polygon/)
  })

  it('counts overlapping footprints once even when multiple road segments affect the same strip', () => {
    const result = calculateLotServitude({
      lotId: 'lot-1',
      lotGeometry: metricServidumbreFixtures.lot100x100,
      totalAreaM2: 10_000,
      roadSegments: [
        {
          id: 'road-a',
          geometry: lineStringFromMeters([
            [-10, 50],
            [110, 50],
          ]),
          mode: 'centerline',
          widthM: 10,
        },
        {
          id: 'road-b',
          geometry: lineStringFromMeters([
            [-10, 50],
            [110, 50],
          ]),
          mode: 'centerline',
          widthM: 10,
        },
      ],
    })

    expect(result.status).toBe('calculated')
    expect(result.servidumbreM2).toBeGreaterThan(975)
    expect(result.servidumbreM2).toBeLessThan(1_025)
    expect(result.widthsM).toEqual([10])
    expect(result.widthLabel).toBe('10')
    expect(result.sourceSegmentIds).toEqual(['road-a', 'road-b'])
  })

  it.each(tenoServidumbreFixtureCases)(
    'preserves usable + servitude = total area for Teno-like case $key',
    ({ input, expected }) => {
      const result = calculateLotServitude(input)

      expect(result.status).toBe(expected.status)
      expect(result.widthsM).toEqual(expected.widthsM)
      expect(result.widthLabel).toBe(expected.widthLabel)
      expect(result.sourceSegmentIds).toEqual(expected.sourceSegmentIds)
      expect(Boolean(result.intersectionGeometry)).toBe(expected.hasIntersectionGeometry)
      expect(result.servidumbreM2).toBeGreaterThanOrEqual(expected.servidumbreM2Range[0])
      expect(result.servidumbreM2).toBeLessThanOrEqual(expected.servidumbreM2Range[1])
      expect(result.superficieNetaM2).toBeGreaterThanOrEqual(expected.superficieNetaM2Range[0])
      expect(result.superficieNetaM2).toBeLessThanOrEqual(expected.superficieNetaM2Range[1])
      expect(result.superficieNetaM2).not.toBeNull()
      expect(result.superficieNetaM2! + result.servidumbreM2).toBeCloseTo(input.totalAreaM2!, 6)
    }
  )
})
