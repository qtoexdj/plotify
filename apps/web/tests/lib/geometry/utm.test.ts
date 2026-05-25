import { describe, it, expect } from 'vitest'
import { calculateLegalMetrics, getUTMZone, toUTM } from '@/lib/geometry/utm'

describe('UTM Legal Metrics Engine', () => {
  describe('getUTMZone', () => {
    it('should correctly identify Zone 19 for Santiago/Central Chile', () => {
      // Santiago approx -70.6
      const zone = getUTMZone(-70.6)
      expect(zone).toBe(19)
    })

    it('should identify Zone 18 for Southern Chile (e.g. Aysen)', () => {
      // Aysen approx -73.0
      const zone = getUTMZone(-73.0)
      expect(zone).toBe(18)
    })
  })

  describe('toUTM Projection (WGS84 South)', () => {
    it('should convert Santiago coordinate to approx known UTM values', () => {
      // Reference: Santiago Plaza de Armas
      // Lat: -33.4372, Lon: -70.6506
      // Expected UTM Zone 19S approx: E 346585, N 6298930
      const lat = -33.4372
      const lon = -70.6506

      const utm = toUTM(lat, lon)

      expect(utm.zone).toBe(19)
      expect(utm.epsg).toBe('EPSG:32719')
      expect(utm.x).toBeCloseTo(346585, -2) // +/- 100m tolerance for this rough check
      expect(utm.y).toBeCloseTo(6299025, -2)
    })
  })

  describe('calculateLegalMetrics (Santiago 100x100m Square)', () => {
    // We reuse the case from the audit to confirm the discrepancy is captured correctly
    const startLat = -33.45
    const startLon = -70.66
    const offsetLat = 100 / 111132
    const offsetLon = 100 / (111320 * Math.cos((startLat * Math.PI) / 180))

    const square = [
      [startLon, startLat],
      [startLon + offsetLon, startLat],
      [startLon + offsetLon, startLat + offsetLat],
      [startLon, startLat + offsetLat],
      [startLon, startLat], // Closed loop
    ]

    it('should return both Geodesic and Legal metrics', () => {
      const metrics = calculateLegalMetrics(square)

      // Geodesic (Physical Reality)
      // Should be ~10,000m2 (approx 10016 due to earth curvature/radius expansion logic)
      expect(metrics.area_geodesic_m2).toBeGreaterThan(10000)

      // Legal (UTM Projection)
      // Should be SMALLER due to scale factor 0.9996 in Zone 19 center
      expect(metrics.area_legal_m2).toBeLessThan(metrics.area_geodesic_m2)

      // Verify Discrepancy %
      const diff = metrics.area_geodesic_m2 - metrics.area_legal_m2
      const diffPct = (diff / metrics.area_legal_m2) * 100

      // From audit we expect ~0.28%
      expect(diffPct).toBeGreaterThan(0.2)
      expect(diffPct).toBeLessThan(0.4)
    })

    it('should handle polygon cleaning (duplicate points)', () => {
      const messySquare = [
        ...square,
        square[0], // Extra closing point
      ]

      const metrics = calculateLegalMetrics(messySquare)
      // Area should be same as clean square
      expect(metrics.area_legal_m2).toBeGreaterThan(9900)
      expect(metrics.area_legal_m2).toBeLessThan(10000)
    })
  })
})
