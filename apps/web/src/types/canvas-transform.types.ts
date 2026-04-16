// ============================================================================
// Canvas Transform Types
// Tipos compartidos para la transformación de coordenadas geo → canvas (Konva).
// ============================================================================

/** Bounding box en coordenadas geográficas (lon/lat o x/y proyectado). */
export interface BoundingBox {
    minX: number
    maxX: number
    minY: number
    maxY: number
}

/** Dimensiones del canvas en píxeles. */
export interface CanvasDimensions {
    width: number
    height: number
}

/**
 * Parámetros pre-calculados para proyectar coordenadas geográficas a canvas.
 *
 * **Contrato flipY**: Y se invierte durante la proyección.
 * Un punto más al norte (mayor latitud/Y) produce un menor Y en el canvas
 * (más arriba en pantalla). Esto es necesario porque los sistemas de
 * coordenadas geográficas crecen hacia arriba, mientras que el canvas crece
 * hacia abajo.
 */
export interface TransformParams {
    scale: number
    offsetX: number
    offsetY: number
    canvasHeight: number
    boundsMinX: number
    boundsMinY: number
    rangeX: number
    rangeY: number
}

/** Opciones configurables para la transformación. */
export interface TransformOptions {
    /** Margen interno en píxeles (default: 40). */
    padding?: number
    /** Factor de escala adicional (default: 1.0). */
    scaleFactor?: number
}
