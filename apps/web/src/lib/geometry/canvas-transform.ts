// ============================================================================
// Canvas Transform — Funciones puras de transformación geo → canvas (Konva)
//
// Este módulo encapsula la matemática compartida entre geometry-viewer (final)
// y geometry-assignment (editor/onboarding). No depende de React.
//
// Inputs:  Coordenadas GeoJSON (lon/lat o proyectadas)
// Outputs: Coordenadas planas para Konva [x1, y1, x2, y2, ...]
//
// Contrato flipY: Y se invierte. Mayor lat → menor Y canvas (norte arriba).
// ============================================================================

import type {
    BoundingBox,
    CanvasDimensions,
    TransformParams,
    TransformOptions,
} from '@/types/canvas-transform.types'

// ─── Coordinate Extraction ──────────────────────────────────────────────────

type GeoJSONGeometry = {
    type: string
    coordinates?: unknown
    geometries?: GeoJSONGeometry[]
}

/**
 * Extrae recursivamente todos los puntos [x, y] de cualquier geometría GeoJSON.
 *
 * Soporta: Point, MultiPoint, LineString, MultiLineString,
 *          Polygon, MultiPolygon, GeometryCollection.
 *
 * @param geometry - Geometría GeoJSON con `type` y `coordinates`/`geometries`.
 * @returns Array de puntos [x, y].
 */
export function extractCoordinates(geometry: GeoJSONGeometry): number[][] {
    if (!geometry || !geometry.type) return []

    // GeometryCollection: recurrir sobre cada geometría hija
    if (geometry.type === 'GeometryCollection') {
        const results: number[][] = []
        if (Array.isArray(geometry.geometries)) {
            for (const child of geometry.geometries) {
                results.push(...extractCoordinates(child))
            }
        }
        return results
    }

    const coords = geometry.coordinates
    if (!coords || !Array.isArray(coords)) return []

    const points: number[][] = []

    const recurse = (data: unknown): void => {
        if (!Array.isArray(data)) return

        // Si el primer elemento es un número, es un punto [x, y, ...]
        if (typeof data[0] === 'number' && typeof data[1] === 'number') {
            points.push([data[0] as number, data[1] as number])
            return
        }

        // De lo contrario, es un array de arrays anidado
        for (const item of data) {
            recurse(item)
        }
    }

    recurse(coords)
    return points
}

// ─── Bounds ─────────────────────────────────────────────────────────────────

/**
 * Calcula el bounding box global de un conjunto de features GeoJSON.
 *
 * @param features - Array de objetos con propiedad `geometry` (GeoJSON).
 * @returns BoundingBox con las coordenadas extremas, o `null` si no hay
 *          coordenadas válidas (features vacías, sin geometría, etc.).
 */
export function computeBounds(
    features: { geometry: GeoJSONGeometry }[]
): BoundingBox | null {
    if (!features || features.length === 0) return null

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let hasPoints = false

    for (const feature of features) {
        if (!feature.geometry) continue

        const points = extractCoordinates(feature.geometry)
        for (const [x, y] of points) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
            hasPoints = true
        }
    }

    // Si no se encontró ni un punto válido, retornar null
    if (!hasPoints) return null

    return { minX, maxX, minY, maxY }
}

// ─── Transform Params ───────────────────────────────────────────────────────

const DEFAULT_PADDING = 40
const DEFAULT_SCALE_FACTOR = 1.0

/**
 * Calcula los parámetros de transformación para centrar geometrías en canvas.
 *
 * Incluye guard contra división por cero: cuando `rangeX` o `rangeY` es 0
 * (e.g., LineString vertical/horizontal, o un solo Point), se usa 1 como
 * fallback para evitar Infinity/NaN.
 *
 * @param bounds   - Bounding box geográfico.
 * @param canvas   - Dimensiones del canvas en píxeles.
 * @param options  - padding (px) y scaleFactor configurables.
 * @returns TransformParams listos para usar en `projectPoint`.
 */
export function computeTransformParams(
    bounds: BoundingBox,
    canvas: CanvasDimensions,
    options?: TransformOptions
): TransformParams {
    const padding = options?.padding ?? DEFAULT_PADDING
    const scaleFactor = options?.scaleFactor ?? DEFAULT_SCALE_FACTOR

    // Guard: evitar división por cero con fallback a 1
    const rangeX = (bounds.maxX - bounds.minX) || 1
    const rangeY = (bounds.maxY - bounds.minY) || 1

    const availableWidth = canvas.width - padding * 2
    const availableHeight = canvas.height - padding * 2

    const scaleX = availableWidth / rangeX
    const scaleY = availableHeight / rangeY
    const scale = Math.min(scaleX, scaleY) * scaleFactor

    const scaledWidth = rangeX * scale
    const scaledHeight = rangeY * scale
    const offsetX = (canvas.width - scaledWidth) / 2
    const offsetY = (canvas.height - scaledHeight) / 2

    return {
        scale,
        offsetX,
        offsetY,
        canvasHeight: canvas.height,
        boundsMinX: bounds.minX,
        boundsMinY: bounds.minY,
        rangeX,
        rangeY,
    }
}

// ─── Projection ─────────────────────────────────────────────────────────────

/**
 * Proyecta un punto geográfico [x, y] a coordenadas canvas [cx, cy].
 *
 * **flipY**: Y se invierte. Un punto más al norte (mayor Y geográfico)
 * produce un menor Y en el canvas (más arriba en pantalla).
 *
 * @returns Tupla [canvasX, canvasY].
 */
export function projectPoint(
    x: number,
    y: number,
    params: TransformParams
): [number, number] {
    const normalizedX = (x - params.boundsMinX) / params.rangeX
    const normalizedY = (y - params.boundsMinY) / params.rangeY

    const canvasX = normalizedX * params.rangeX * params.scale + params.offsetX
    const canvasY = (1 - normalizedY) * params.rangeY * params.scale + params.offsetY

    return [canvasX, canvasY]
}

/**
 * Proyecta un array de coordenadas geográficas a un flat array para Konva.
 *
 * @param coords - Array de puntos [x, y][].
 * @param params - Parámetros de transformación pre-calculados.
 * @returns Flat array [x1, y1, x2, y2, ...] listo para `<Line points={...} />`.
 */
export function projectCoordinates(
    coords: number[][],
    params: TransformParams
): number[] {
    const result: number[] = []

    for (const point of coords) {
        if (typeof point[0] !== 'number' || typeof point[1] !== 'number') continue
        const [cx, cy] = projectPoint(point[0], point[1], params)
        result.push(cx, cy)
    }

    return result
}

// ─── Centroid ───────────────────────────────────────────────────────────────

/**
 * Calcula el centroide aritmético (promedio simple) de un conjunto de puntos.
 *
 * @param coords - Array de puntos [x, y][].
 * @returns Centroide `{ x, y }`, o `{ x: 0, y: 0 }` si no hay puntos.
 */
export function getCentroid(
    coords: number[][]
): { x: number; y: number } {
    if (!coords || coords.length === 0) return { x: 0, y: 0 }

    let sumX = 0
    let sumY = 0
    let count = 0

    for (const point of coords) {
        if (typeof point[0] === 'number' && typeof point[1] === 'number') {
            sumX += point[0]
            sumY += point[1]
            count++
        }
    }

    if (count === 0) return { x: 0, y: 0 }

    return { x: sumX / count, y: sumY / count }
}
