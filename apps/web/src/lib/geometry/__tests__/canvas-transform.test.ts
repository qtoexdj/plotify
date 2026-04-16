/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import {
    extractCoordinates,
    computeBounds,
    computeTransformParams,
    projectPoint,
    projectCoordinates,
    getCentroid,
} from '../canvas-transform'
import type { BoundingBox, CanvasDimensions } from '@/types/canvas-transform.types'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const POLYGON_SIMPLE = {
    type: 'Polygon',
    coordinates: [
        [
            [10, 20],
            [30, 20],
            [30, 40],
            [10, 40],
            [10, 20],
        ],
    ],
}

const MULTI_LINESTRING = {
    type: 'MultiLineString',
    coordinates: [
        [
            [0, 0],
            [5, 5],
        ],
        [
            [10, 10],
            [15, 15],
        ],
    ],
}

const GEOMETRY_COLLECTION = {
    type: 'GeometryCollection',
    geometries: [
        { type: 'Point', coordinates: [100, 200] },
        {
            type: 'LineString',
            coordinates: [
                [0, 0],
                [50, 50],
            ],
        },
    ],
}

const VERTICAL_LINESTRING = {
    type: 'LineString',
    coordinates: [
        [10, 0],
        [10, 50],
    ],
}

const HORIZONTAL_LINESTRING = {
    type: 'LineString',
    coordinates: [
        [0, 10],
        [50, 10],
    ],
}

const SINGLE_POINT = {
    type: 'Point',
    coordinates: [25, 35],
}

const CANVAS: CanvasDimensions = { width: 800, height: 600 }

// ─── extractCoordinates ─────────────────────────────────────────────────────

describe('extractCoordinates', () => {
    it('extracts from a simple Polygon', () => {
        const points = extractCoordinates(POLYGON_SIMPLE)
        expect(points).toHaveLength(5)
        expect(points[0]).toEqual([10, 20])
    })

    it('extracts from MultiLineString', () => {
        const points = extractCoordinates(MULTI_LINESTRING)
        expect(points).toHaveLength(4)
        expect(points[0]).toEqual([0, 0])
        expect(points[3]).toEqual([15, 15])
    })

    it('extracts from GeometryCollection (mixed)', () => {
        const points = extractCoordinates(GEOMETRY_COLLECTION)
        expect(points).toHaveLength(3)
        expect(points[0]).toEqual([100, 200])
        expect(points[1]).toEqual([0, 0])
        expect(points[2]).toEqual([50, 50])
    })

    it('returns empty array for null/undefined geometry', () => {
        expect(extractCoordinates(null as any)).toEqual([])
        expect(extractCoordinates(undefined as any)).toEqual([])
        expect(extractCoordinates({} as any)).toEqual([])
    })
})

// ─── computeBounds ──────────────────────────────────────────────────────────

describe('computeBounds', () => {
    it('computes correct bounds for a simple Polygon', () => {
        const bounds = computeBounds([{ geometry: POLYGON_SIMPLE }])
        expect(bounds).toEqual({ minX: 10, maxX: 30, minY: 20, maxY: 40 })
    })

    it('computes correct bounds for MultiLineString', () => {
        const bounds = computeBounds([{ geometry: MULTI_LINESTRING }])
        expect(bounds).toEqual({ minX: 0, maxX: 15, minY: 0, maxY: 15 })
    })

    it('computes correct bounds for GeometryCollection', () => {
        const bounds = computeBounds([{ geometry: GEOMETRY_COLLECTION }])
        expect(bounds).toEqual({ minX: 0, maxX: 100, minY: 0, maxY: 200 })
    })

    it('returns null for empty features array', () => {
        expect(computeBounds([])).toBeNull()
    })

    it('returns null for features without geometry', () => {
        expect(computeBounds([{ geometry: null as any }])).toBeNull()
        expect(computeBounds([{ geometry: {} as any }])).toBeNull()
    })
})

// ─── computeTransformParams ─────────────────────────────────────────────────

describe('computeTransformParams', () => {
    const bounds: BoundingBox = { minX: 10, maxX: 30, minY: 20, maxY: 40 }

    it('computes with editor defaults (padding=40, factor=1.0)', () => {
        const params = computeTransformParams(bounds, CANVAS, {
            padding: 40,
            scaleFactor: 1.0,
        })

        expect(params.rangeX).toBe(20)
        expect(params.rangeY).toBe(20)
        // scale = min(720/20, 520/20) * 1.0 = min(36, 26) = 26
        expect(params.scale).toBe(26)
    })

    it('computes with viewer settings (padding=60, factor=0.95)', () => {
        const params = computeTransformParams(bounds, CANVAS, {
            padding: 60,
            scaleFactor: 0.95,
        })

        // scale = min(680/20, 480/20) * 0.95 = min(34, 24) * 0.95 = 22.8
        expect(params.scale).toBeCloseTo(22.8, 5)
    })

    it('handles division by zero: vertical LineString (rangeX = 0)', () => {
        const vertBounds = computeBounds([{ geometry: VERTICAL_LINESTRING }])!
        expect(vertBounds.minX).toBe(vertBounds.maxX) // rangeX === 0

        const params = computeTransformParams(vertBounds, CANVAS)
        expect(Number.isFinite(params.scale)).toBe(true)
        expect(Number.isNaN(params.scale)).toBe(false)
        expect(params.rangeX).toBe(1) // fallback
    })

    it('handles division by zero: horizontal LineString (rangeY = 0)', () => {
        const horzBounds = computeBounds([{ geometry: HORIZONTAL_LINESTRING }])!
        expect(horzBounds.minY).toBe(horzBounds.maxY) // rangeY === 0

        const params = computeTransformParams(horzBounds, CANVAS)
        expect(Number.isFinite(params.scale)).toBe(true)
        expect(Number.isNaN(params.scale)).toBe(false)
        expect(params.rangeY).toBe(1) // fallback
    })

    it('handles division by zero: single Point (rangeX = 0, rangeY = 0)', () => {
        const ptBounds = computeBounds([{ geometry: SINGLE_POINT }])!
        const params = computeTransformParams(ptBounds, CANVAS)
        expect(Number.isFinite(params.scale)).toBe(true)
        expect(params.rangeX).toBe(1)
        expect(params.rangeY).toBe(1)
    })
})

// ─── projectPoint + flipY ───────────────────────────────────────────────────

describe('projectPoint', () => {
    const bounds: BoundingBox = { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    const params = computeTransformParams(bounds, CANVAS, { padding: 0 })

    it('flipY: northernmost point (higher Y) → smaller canvas Y', () => {
        const [, canvasY_south] = projectPoint(50, 10, params)
        const [, canvasY_north] = projectPoint(50, 90, params)

        // Norte (Y=90) debe estar MÁS ARRIBA (menor Y canvas)
        expect(canvasY_north).toBeLessThan(canvasY_south)
    })

    it('projects bottom-left corner correctly', () => {
        const [cx, cy] = projectPoint(0, 0, params)
        // Y=0 (mínimo) debe ir al fondo del canvas
        expect(cy).toBeGreaterThan(params.canvasHeight / 2)
        // X=0 (mínimo) debe estar a la izquierda
        expect(cx).toBeLessThan(params.canvasHeight / 2)
    })
})

// ─── projectCoordinates ─────────────────────────────────────────────────────

describe('projectCoordinates', () => {
    it('produces a flat array of the correct length', () => {
        const bounds: BoundingBox = { minX: 0, maxX: 10, minY: 0, maxY: 10 }
        const params = computeTransformParams(bounds, CANVAS)

        const coords = [
            [0, 0],
            [5, 5],
            [10, 10],
        ]
        const result = projectCoordinates(coords, params)

        expect(result).toHaveLength(6) // 3 points × 2 values
        // Todos los valores deben ser finitos
        result.forEach((v) => expect(Number.isFinite(v)).toBe(true))
    })

    it('skips invalid points', () => {
        const bounds: BoundingBox = { minX: 0, maxX: 10, minY: 0, maxY: 10 }
        const params = computeTransformParams(bounds, CANVAS)

        const coords = [[0, 0], ['a' as any, 5], [10, 10]]
        const result = projectCoordinates(coords, params)

        expect(result).toHaveLength(4) // Only 2 valid points
    })
})

// ─── getCentroid ────────────────────────────────────────────────────────────

describe('getCentroid', () => {
    it('computes centroid of a triangle', () => {
        const coords = [
            [0, 0],
            [6, 0],
            [3, 6],
        ]
        const c = getCentroid(coords)
        expect(c.x).toBe(3)
        expect(c.y).toBe(2)
    })

    it('returns {0,0} for empty array', () => {
        expect(getCentroid([])).toEqual({ x: 0, y: 0 })
    })

    it('returns {0,0} for null/undefined', () => {
        expect(getCentroid(null as any)).toEqual({ x: 0, y: 0 })
    })
})
