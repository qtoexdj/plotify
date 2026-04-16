
import { describe, it, expect } from 'vitest'
import { calculateDistance, calculatePolygonArea, calculateBearing, getBoundaries } from '@/lib/geometry/utils'

describe('Geometry Utils - Geospatial Accuracy', () => {
    // Reference: WGS84 Equatorial Radius = 6378137m
    // We are testing that our Hotfix (R=6378137) is applied and minimizes error 
    // vs a high-precision reference (Vincenty/Geodesic).

    describe('calculateDistance', () => {
        it('should calculate distance for ~100m side in Santiago (Lat -33)', () => {
            // Santiago: -33.45, -70.66
            // 1 degree lat approx 110996m
            // We create two points separated by roughly 100m in Latitude
            const p1 = [-70.66, -33.45]
            const p2 = [-70.66, -33.45 + (100 / 111132)] // approx 100m north

            const dist = calculateDistance(p1, p2)

            // Expected: Close to 100m. 
            // Without hotfix (R=6371km), this would be ~99.8m. 
            // With hotfix (R=6378km), this should be ~100.0m.
            expect(dist).toBeGreaterThan(99.9)
            expect(dist).toBeLessThan(100.2)
        })

        it('should be consistent for a 1km segment', () => {
            const p1 = [0, 0]
            const p2 = [0, 1 / 111.32] // approx 1km at equator
            const dist = calculateDistance(p1, p2)
            // 1 degree at equator is ~111319m. 
            // 1/111.32 deg is ~1000m
            expect(dist).toBeCloseTo(1000, -1) // check integer part
        })
    })

    describe('calculatePolygonArea', () => {
        it('should calculate area for 100x100m square in Santiago', () => {
            const startLat = -33.45
            const startLon = -70.66
            // Construct a square ~100x100m
            // 1 deg lat = 111132m, 1 deg lon = 111320 * cos(-33.45) = 92935m
            const offsetLat = 100 / 111132
            const offsetLon = 100 / (111320 * Math.cos(startLat * Math.PI / 180))

            const square = [
                [startLon, startLat],
                [startLon + offsetLon, startLat],
                [startLon + offsetLon, startLat + offsetLat],
                [startLon, startLat + offsetLat],
                [startLon, startLat]
            ]

            const area = calculatePolygonArea(square)

            // Should be close to 10,000 m2
            expect(area).toBeGreaterThan(9900)
            expect(area).toBeLessThan(10100)
        })
    })

    describe('Consistency Check', () => {
        it('should have consistent Radius usage (implied by distance/area ratio)', () => {
            // A 1x1 degree square at equator
            // Distance of side: ~111,319m
            // Area: ~12,392,000,000 m2 approx (surface of sphere segment)

            // We verify that small distance * small distance ~ area
            // If radii were mixed (6371 vs 6378), area would be ~0.2% larger than dist^2

            const sizeDeg = 0.001 // small enough to be flat-ish
            const p1 = [0, 0]
            const p2 = [sizeDeg, 0]
            const p3 = [sizeDeg, sizeDeg]
            const p4 = [0, sizeDeg]
            const poly = [p1, p2, p3, p4, p1]

            const sideDist = calculateDistance(p1, p2)
            const calculatedArea = calculatePolygonArea(poly)
            const expectedArea = sideDist * sideDist

            // Difference should be very small (< 0.01%)
            const diffPercent = Math.abs(calculatedArea - expectedArea) / expectedArea * 100
            expect(diffPercent).toBeLessThan(0.01)
        })
    })

    describe('Legal Description Helpers', () => {
        it('should calculate correct initial bearing', () => {
            const p1 = [0, 0]
            const p2 = [0, 1] // North
            const p3 = [1, 0] // East

            const bearingN = calculateBearing(p1, p2)
            const bearingE = calculateBearing(p1, p3)

            expect(bearingN).toBe(0)
            expect(bearingE).toBe(90)
        })

        it('should generate boundary descriptions correctly', () => {
            // 100x100m square roughly
            const p1 = [0, 0]
            const p2 = [0.001, 0] // East
            const p3 = [0.001, 0.001] // North (relative to p2)
            const p4 = [0, 0.001] // West (relative to p3)
            // Closing point implied or explicit? getBoundaries uses points.length - 1 loop
            // So we need [p1, p2, p3, p4, p1]
            const poly = [p1, p2, p3, p4, p1]

            const boundaries = getBoundaries(poly)

            expect(boundaries).toHaveLength(4)
            expect(boundaries[0].direction).toBe('Sur') // p1 -> p2 (bottom edge, outward is South)
            expect(boundaries[1].direction).toBe('Oriente') // p2 -> p3 (right edge, outward is East)
            expect(boundaries[2].direction).toBe('Norte') // p3 -> p4 (top edge, outward is North)
            expect(boundaries[3].direction).toBe('Poniente') // p4 -> p1 (left edge, outward is West)

            // Check distances are substantial (> 0.5m)
            expect(boundaries[0].distance).toBeGreaterThan(100)
        })
    })
})
