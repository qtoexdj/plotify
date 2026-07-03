import { describe, expect, it } from 'vitest'
import { calculateLotServitude } from '@/lib/geometry/servidumbre-footprints'
import { tenoServidumbreFixtureCases } from '../tests/lib/geometry/teno-servidumbre.fixture'

describe('verify Teno-like servidumbre precision fixtures', () => {
  it.each(tenoServidumbreFixtureCases)('validates $key: $title', ({ input, expected }) => {
    const result = calculateLotServitude(input)

    expect(result.status).toBe(expected.status)
    expect(result.widthsM).toEqual(expected.widthsM)
    expect(result.widthLabel).toBe(expected.widthLabel)
    expect(result.sourceSegmentIds).toEqual(expected.sourceSegmentIds)
    expect(Boolean(result.intersectionGeometry)).toBe(expected.hasIntersectionGeometry)
    expect(result.servidumbreM2).toBeGreaterThanOrEqual(expected.servidumbreM2Range[0])
    expect(result.servidumbreM2).toBeLessThanOrEqual(expected.servidumbreM2Range[1])
    expect(result.superficieNetaM2).not.toBeNull()
    expect(result.superficieNetaM2).toBeGreaterThanOrEqual(expected.superficieNetaM2Range[0])
    expect(result.superficieNetaM2).toBeLessThanOrEqual(expected.superficieNetaM2Range[1])
    expect(result.superficieNetaM2! + result.servidumbreM2).toBeCloseTo(input.totalAreaM2!, 6)
  })
})
