import type { ViewerFeature, GeometryBounds } from '@/types/viewer.types'
import type { EstadoLote } from '@/types/database.types'

/**
 * Calcula los bounds (límites) de un conjunto de features
 */
export function calculateBounds(features: ViewerFeature[]): GeometryBounds {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  features.forEach((feature) => {
    if (!feature.geometry) return

    const processCoords = (coords: number[][]) => {
      coords.forEach((point) => {
        const lon = point[0]
        const lat = point[1]
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      })
    }

    if (feature.geometry.type === 'Polygon') {
      const coords = feature.geometry.coordinates as number[][][]
      coords.forEach(processCoords)
    } else if (feature.geometry.type === 'MultiPolygon') {
      const multiCoords = feature.geometry.coordinates as number[][][][]
      multiCoords.forEach((poly) => poly.forEach(processCoords))
    } else if (feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates as number[][]
      processCoords(coords)
    } else if (feature.geometry.type === 'MultiLineString') {
      const multiCoords = feature.geometry.coordinates as number[][][]
      multiCoords.forEach(processCoords)
    }
  })

  return { minLon, maxLon, minLat, maxLat }
}

/**
 * Transforma coordenadas geográficas a coordenadas de canvas
 */
export function transformCoordinates(
  coords: number[][],
  bounds: GeometryBounds,
  canvasWidth: number,
  canvasHeight: number,
  padding = 40
): number[] {
  const { minLon, maxLon, minLat, maxLat } = bounds
  const lonRange = maxLon - minLon || 1
  const latRange = maxLat - minLat || 1

  const availableWidth = canvasWidth - padding * 2
  const availableHeight = canvasHeight - padding * 2

  const scaleX = availableWidth / lonRange
  const scaleY = availableHeight / latRange
  const scale = Math.min(scaleX, scaleY)

  const offsetX = (canvasWidth - lonRange * scale) / 2
  const offsetY = (canvasHeight - latRange * scale) / 2

  const points: number[] = []
  coords.forEach((point) => {
    const x = (point[0] - minLon) * scale + offsetX
    const y = canvasHeight - ((point[1] - minLat) * scale + offsetY)
    points.push(x, y)
  })

  return points
}

/**
 * Colores por estado de lote
 */
export function getFillColor(estado: EstadoLote | 'sin_asignar'): string {
  switch (estado) {
    case 'disponible':
      return '#cbd5e1' // slate-300
    case 'reservado':
      return '#fbbf24' // yellow-400
    case 'vendido':
      return '#10b981' // green-500
    case 'sin_asignar':
    default:
      return '#e5e7eb' // gray-200
  }
}

export function getStrokeColor(estado: EstadoLote | 'sin_asignar'): string {
  switch (estado) {
    case 'disponible':
      return '#64748b' // slate-600
    case 'reservado':
      return '#f59e0b' // yellow-500
    case 'vendido':
      return '#059669' // green-600
    case 'sin_asignar':
    default:
      return '#9ca3af' // gray-400
  }
}

/**
 * Calcula el centroide de un polígono (para colocar texto)
 */
export function getCentroid(points: number[]): { x: number; y: number } {
  let x = 0
  let y = 0
  const numPoints = points.length / 2

  for (let i = 0; i < points.length; i += 2) {
    x += points[i]
    y += points[i + 1]
  }

  return {
    x: x / numPoints,
    y: y / numPoints,
  }
}

/**
 * Combina múltiples LineStrings en un MultiLineString
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function combineLineStrings(geometries: any[]): any {
  const allCoordinates = geometries.map((geom) => {
    if (geom.type === 'LineString') {
      return [geom.coordinates]
    } else if (geom.type === 'MultiLineString') {
      return geom.coordinates
    } else if (geom.type === 'Polygon') {
      // Usar el anillo exterior como línea
      return [geom.coordinates[0]]
    } else if (geom.type === 'MultiPolygon') {
      // Usar anillos exteriores de todos los polígonos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return geom.coordinates.map((poly: any[]) => poly[0])
    }
    return []
  }).flat(1)

  return {
    type: 'MultiLineString',
    coordinates: allCoordinates,
  }
}

/**
 * Combina múltiples Polygons en un MultiPolygon
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function combinePolygons(geometries: any[]): any {
  const allCoordinates = geometries.map((geom) => {
    if (geom.type === 'Polygon') {
      return [geom.coordinates]
    } else if (geom.type === 'MultiPolygon') {
      return geom.coordinates
    }
    return []
  }).flat(1)

  return {
    type: 'MultiPolygon',
    coordinates: allCoordinates,
  }
}

/**
 * Calcula el área de un polígono en metros cuadrados.
 * @param coordinates Arreglo de coordenadas [lon, lat] (debe ser el primer anillo del polígono)
 */
export function calculatePolygonArea(coordinates: number[][]): number {
  if (!coordinates || coordinates.length < 3) return 0

  const radius = 6378137 // Radio de la Tierra en metros
  let area = 0

  for (let i = 0; i < coordinates.length; i++) {
    const p1 = coordinates[i]
    const p2 = coordinates[(i + 1) % coordinates.length]

    const lon1 = (p1[0] * Math.PI) / 180
    const lat1 = (p1[1] * Math.PI) / 180
    const lon2 = (p2[0] * Math.PI) / 180
    const lat2 = (p2[1] * Math.PI) / 180

    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2))
  }

  area = (area * radius * radius) / 2
  return Math.abs(area)
}

/**
 * Calcula la distancia entre dos puntos en metros usando Haversine.
 * NOTA: Se usa el Radio Ecuatorial (6378137) para consistencia con el cálculo de área.
 * Aunque Haversine asume una esfera, usar el radio mayor minimiza el error de distancia en
 * latitudes medias/bajas y evita discrepancias legales donde Perímetro no calza con Área.
 */
export function calculateDistance(p1: number[], p2: number[]): number {
  const R = 6378137 // metros (Radio Ecuatorial WGS84, antes 6371000)
  const lat1 = (p1[1] * Math.PI) / 180
  const lat2 = (p2[1] * Math.PI) / 180
  const dLat = ((p2[1] - p1[1]) * Math.PI) / 180
  const dLon = ((p2[0] - p1[0]) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

/**
 * Calcula el rumbo (bearing) entre dos puntos en grados.
 */
export function calculateBearing(p1: number[], p2: number[]): number {
  const lat1 = (p1[1] * Math.PI) / 180
  const lat2 = (p2[1] * Math.PI) / 180
  const dLon = ((p2[0] - p1[0]) * Math.PI) / 180

  const y = Math.sin(dLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const brng = (Math.atan2(y, x) * 180) / Math.PI

  return (brng + 360) % 360
}

/**
 * Convierte grados de rumbo a dirección cardinal en español.
 * Sistema de azimut estándar: 8 sectores iguales de 45° (±22.5°),
 * centrados en cada punto cardinal/intercardinal.
 * 0°=Norte, 45°=Nororiente, 90°=Oriente, 135°=Suroriente,
 * 180°=Sur, 225°=Surponiente, 270°=Poniente, 315°=Norponiente
 */
export function getCardinalDirection(bearing: number): string {
  const directions = [
    'Norte',
    'Nororiente',
    'Oriente',
    'Suroriente',
    'Sur',
    'Surponiente',
    'Poniente',
    'Norponiente',
    'Norte'
  ]
  const index = Math.round(bearing / 45)
  return directions[index]
}

/**
 * Calcula el centroide (promedio) de un conjunto de coordenadas que conforman un anillo de polígono.
 * Remueve el último punto si este es igual al primero para no sesgar el promedio.
 */
export function getPolygonCentroidGeographic(coordinates: number[][]): number[] {
  let x = 0
  let y = 0

  // Si el último punto es igual al primero (polígono cerrado), no lo contamos en el promedio
  const len = coordinates.length
  let validPoints = len

  if (len > 1 && coordinates[0][0] === coordinates[len - 1][0] && coordinates[0][1] === coordinates[len - 1][1]) {
    validPoints = len - 1
  }

  if (validPoints === 0) return [0, 0]

  for (let i = 0; i < validPoints; i++) {
    x += coordinates[i][0]
    y += coordinates[i][1]
  }

  return [x / validPoints, y / validPoints]
}

/**
 * Calcula el ángulo normal exterior de un segmento.
 * Compara las dos normales perpendiculares del segmento y escoge la que
 * más se asemeja al vector que va del centroide topográfico al punto medio.
 */
export function getOutwardNormalBearing(p1: number[], p2: number[], centroid: number[]): number {
  const segmentBearing = calculateBearing(p1, p2)
  const midPoint = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
  const centroidToMidBearing = calculateBearing(centroid, midPoint)

  const normal1 = (segmentBearing + 90) % 360
  const normal2 = (segmentBearing + 270) % 360

  const diff1 = Math.abs(normal1 - centroidToMidBearing)
  const minDiff1 = Math.min(diff1, 360 - diff1)

  const diff2 = Math.abs(normal2 - centroidToMidBearing)
  const minDiff2 = Math.min(diff2, 360 - diff2)

  return minDiff1 < minDiff2 ? normal1 : normal2
}

export interface Boundary {
  direction: string
  distance: number
}

/**
 * Obtiene los deslindes de un polígono calculando la orientación
 * desde el centroide del lote hacia el punto medio de cada segmento.
 */
export function getBoundaries(coordinates: number[][]): Boundary[] {
  if (!coordinates || coordinates.length < 2) return []

  const centroid = getPolygonCentroidGeographic(coordinates)
  const boundaries: Boundary[] = []

  for (let i = 0; i < coordinates.length - 1; i++) {
    const p1 = coordinates[i]
    const p2 = coordinates[i + 1]
    const distance = calculateDistance(p1, p2)

    // Ocultar micro-segmentos erróneos (< 1cm) originados por CAD
    if (distance > 0.01) {
      const outwardNormalBearing = getOutwardNormalBearing(p1, p2, centroid)
      const direction = getCardinalDirection(outwardNormalBearing)
      boundaries.push({ direction, distance })
    }
  }

  return boundaries
}

// ─── Neighbor Detection ─────────────────────────────────────────────────────

import type { NeighborMetadata } from '@/types/database.types'

export interface BoundaryWithNeighbor extends Boundary {
  neighbors: NeighborMetadata[]  // Metadata estructurada de vecinos
  touchesRoad: boolean  // true si al menos un punto del segmento toca el camino
  roadContactFull: boolean  // true si TODOS los puntos muestreados tocan el camino
}



/**
 * Obtiene las coordenadas del primer anillo de un polígono desde un feature.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFeatureCoords(feature: { geometry: { type: string; coordinates: any } }): number[][] | null {
  const { type, coordinates } = feature.geometry
  if (type === 'Polygon') return coordinates[0]
  if (type === 'MultiPolygon') return coordinates[0]?.[0]
  // LineString: coordenadas directas (común en geometrías importadas desde CAD)
  if (type === 'LineString') return coordinates
  if (type === 'MultiLineString') return coordinates[0]
  return null
}

export function getBoundariesWithNeighbors(
  coordinates: number[][],
  allLotFeatures: Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geometry: { type: string; coordinates: any }
    properties: { geometry_type?: string; lot_id?: string; numero_lote?: string }
  }>,
  currentLotId?: string,
): BoundaryWithNeighbor[] {
  if (!coordinates || coordinates.length < 2) return []

  const centroid = getPolygonCentroidGeographic(coordinates)

  const ROAD_THRESHOLD_M = 4

  const cosLat = Math.cos((centroid[1] * Math.PI) / 180)
  const DEG_TO_M_LAT = 111132
  const DEG_TO_M_LON = 111132 * cosLat

  const otherLots = allLotFeatures
    .filter(f => f.properties.geometry_type === 'lot' && f.properties.lot_id !== currentLotId && f.properties.numero_lote)
    .map(f => ({ name: f.properties.numero_lote!, coords: getFeatureCoords(f) }))
    .filter((l): l is { name: string; coords: number[][] } => l.coords !== null)

  const roadLines: number[][][] = []
  for (const f of allLotFeatures) {
    if (f.properties.geometry_type !== 'road') continue
    const { type, coordinates: coords } = f.geometry
    if (type === 'LineString') { roadLines.push(coords) }
    else if (type === 'MultiLineString') { for (const line of coords) roadLines.push(line) }
    else if (type === 'Polygon') { for (const ring of coords) roadLines.push(ring) }
    else if (type === 'MultiPolygon') { for (const poly of coords) for (const ring of poly) roadLines.push(ring) }
  }

  const result: BoundaryWithNeighbor[] = []

  // 1. Recolección Inicial de Micro-Aristas con sus vecinos iniciales
  const rawSegments: {
    p1: number[];
    p2: number[];
    distance: number;
    direction: string;
    bearing: number;
    neighbors: { name: string; overlap: number; faceLen: number }[];
    touchesRoad: boolean;
  }[] = []

  for (let i = 0; i < coordinates.length - 1; i++) {
    const p1 = coordinates[i]
    const p2 = coordinates[i + 1]
    const curDistance = calculateDistance(p1, p2)

    if (curDistance < 0.01) continue

    const curOutwardNormal = getOutwardNormalBearing(p1, p2, centroid)
    const curDirection = getCardinalDirection(curOutwardNormal)
    const curBearing = calculateBearing(p1, p2)

    // Detección de vecinos para este micro-tramo
    const mx1 = (p1[0] - centroid[0]) * DEG_TO_M_LON
    const my1 = (p1[1] - centroid[1]) * DEG_TO_M_LAT
    const mx2 = (p2[0] - centroid[0]) * DEG_TO_M_LON
    const my2 = (p2[1] - centroid[1]) * DEG_TO_M_LAT
    const dx = mx2 - mx1
    const dy = my2 - my1
    const L = Math.hypot(dx, dy)

    const segmentNeighbors: { name: string; overlap: number; faceLen: number }[] = []
    let touchesRoad = false

    if (L > 0) {
      const ux = dx / L
      const uy = dy / L

      for (const lot of otherLots) {
        let maxOverlap = 0
        let isNeighbor = false
        let totalNeighborFaceLen = 0

        for (let j = 0; j < lot.coords.length - 1; j++) {
          const a = lot.coords[j], b = lot.coords[j + 1]

          // 1. Cálculo de Overlap (Proyectado)
          const ax = (a[0] - centroid[0]) * DEG_TO_M_LON
          const ay = (a[1] - centroid[1]) * DEG_TO_M_LAT
          const bx = (b[0] - centroid[0]) * DEG_TO_M_LON
          const by = (b[1] - centroid[1]) * DEG_TO_M_LAT

          const ta = (ax - mx1) * ux + (ay - my1) * uy
          const tb = (bx - mx1) * ux + (by - my1) * uy
          const tMin = Math.max(0, Math.min(ta, tb))
          const tMax = Math.min(L, Math.max(ta, tb))
          const overlap = tMax - tMin

          if (overlap > 0.05) {
            const f1 = ta === tb ? 0 : (tMin - ta) / (tb - ta)
            const d1 = Math.hypot(ax + f1 * (bx - ax) - (mx1 + tMin * ux), ay + f1 * (by - ay) - (my1 + tMin * uy))
            const f2 = ta === tb ? 1 : (tMax - ta) / (tb - ta)
            const d2 = Math.hypot(ax + f2 * (bx - ax) - (mx1 + tMax * ux), ay + f2 * (by - ay) - (my1 + tMax * uy))

            if (d1 < 0.1 && d2 < 0.1) {
              isNeighbor = true
              if (overlap > maxOverlap) {
                maxOverlap = overlap
              }
            }
          }

          // 2. Cálculo de FaceLen (Suma Colineal del Vecino)
          // Usamos distancia Punto(vecino)-Recta(objetivo)
          const nBearing = calculateBearing(a, b)
          const diff = Math.abs(nBearing - curBearing)
          const minDiff = Math.min(diff, 360 - diff)

          if (minDiff < 3.0 || Math.abs(minDiff - 180) < 3.0) {
            const midX = (a[0] + b[0]) / 2;
            const midY = (a[1] + b[1]) / 2;

            // Convertir a coordenadas métricas para cálculo de distancia
            const midX_m = (midX - centroid[0]) * DEG_TO_M_LON;
            const midY_m = (midY - centroid[1]) * DEG_TO_M_LAT;

            // Distancia punto a recta infinita (en metros)
            const numerator = Math.abs((my2 - my1) * midX_m - (mx2 - mx1) * midY_m + mx2 * my1 - my2 * mx1);
            const denominator = Math.hypot(my2 - my1, mx2 - mx1);
            const distToLine = denominator === 0 ? 0 : numerator / denominator;

            if (distToLine < 3.0) { // ~3 metros de tolerancia para caras adyacentes
              totalNeighborFaceLen += calculateDistance(a, b)
            }
          }
        }

        if (isNeighbor) {
          segmentNeighbors.push({
            name: lot.name,
            overlap: maxOverlap,
            faceLen: totalNeighborFaceLen
          })
        }
      }

      // Servidumbre Check (Muestreo simple)
      const SAMPLE_FRACTIONS = [0, 0.5, 1]
      let hits = 0
      for (const frac of SAMPLE_FRACTIONS) {
        const sx = p1[0] + frac * (p2[0] - p1[0]), sy = p1[1] + frac * (p2[1] - p1[1])
        const spx = sx * DEG_TO_M_LON, spy = sy * DEG_TO_M_LAT
        let hitAtThisFrac = false
        for (const line of roadLines) {
          if (hitAtThisFrac) break
          for (let j = 0; j < line.length - 1; j++) {
            const ra = line[j], rb = line[j + 1]
            const rax = ra[0] * DEG_TO_M_LON, ray = ra[1] * DEG_TO_M_LAT
            const rbx = rb[0] * DEG_TO_M_LON, rby = rb[1] * DEG_TO_M_LAT
            const rdx = rbx - rax, rdy = rby - ray
            const rlenSq = rdx * rdx + rdy * rdy
            let dist = 0
            if (rlenSq === 0) dist = Math.hypot(spx - rax, spy - ray)
            else {
              let t = ((spx - rax) * rdx + (spy - ray) * rdy) / rlenSq
              t = Math.max(0, Math.min(1, t))
              dist = Math.hypot(spx - (rax + t * rdx), spy - (ray + t * rdy))
            }
            if (dist < ROAD_THRESHOLD_M) { hitAtThisFrac = true; break; }
          }
        }
        if (hitAtThisFrac) hits++
      }
      touchesRoad = (hits > 0)
    }

    rawSegments.push({
      p1, p2, distance: curDistance, direction: curDirection, bearing: curBearing,
      neighbors: segmentNeighbors, touchesRoad
    })
  }

  // 2. Proceso de Fusión (Multi-paso)
  let processed = [...rawSegments]

  const mergePass = () => {
    const merged: typeof rawSegments = []
    for (const cur of processed) {
      if (merged.length === 0) {
        merged.push({ ...cur })
        continue
      }
      const last = merged[merged.length - 1]

      // Regla 1: Fusión Colineal (Tolerancia 3°)
      const diffBearing = Math.abs(cur.bearing - last.bearing)
      const minDiffBearing = Math.min(diffBearing, 360 - diffBearing)
      const isCollinear = minDiffBearing < 3.0

      // Regla 2: Respaldo (Mismo Direction + Mismos Vecinos)
      const curNSet = new Set(cur.neighbors.map(n => n.name))
      const lastNSet = new Set(last.neighbors.map(n => n.name))
      const sameDirection = cur.direction === last.direction
      const sameNeighbors = curNSet.size === lastNSet.size && [...curNSet].every(n => lastNSet.has(n))

      if (isCollinear || (sameDirection && sameNeighbors)) {
        last.p2 = cur.p2
        last.distance += cur.distance
        last.bearing = calculateBearing(last.p1, last.p2) // Re-calcular bearing del tramo fusionado
        // Fusionar vecinos (matemáticamente sumar overlaps si es el mismo vecino)
        for (const curN of cur.neighbors) {
          const existing = last.neighbors.find(ln => ln.name === curN.name)
          if (existing) {
            existing.overlap += curN.overlap
            existing.faceLen = Math.max(existing.faceLen, curN.faceLen)
          } else {
            last.neighbors.push({ ...curN })
          }
        }
        last.touchesRoad = last.touchesRoad || cur.touchesRoad
      } else {
        merged.push({ ...cur })
      }
    }
    return merged
  }

  // Ejecutamos fusión hasta que no haya más cambios (estabilidad)
  let currentLen = 0
  while (processed.length !== currentLen) {
    currentLen = processed.length
    processed = mergePass()
  }

  // 3. Generación de Resultado Final con Precisión Semántica
  for (const edge of processed) {
    const neighborMetas: NeighborMetadata[] = []

    for (const n of edge.neighbors) {
      console.log(`[GEOMETRY] Analizando vecino ${n.name}:`)
      console.log(` - Longitud Compartida (overlap): ${n.overlap.toFixed(3)}m`)
      console.log(` - Longitud Arista Vecino (faceLen): ${n.faceLen.toFixed(3)}m`)

      const isPartial = n.overlap < (n.faceLen - 0.5)

      if (isPartial) {
        console.log(` - Resultado: PARTE DEL LOTE (Diff: ${(n.faceLen - n.overlap).toFixed(3)}m > 0.5m)`)
      } else {
        console.log(` - Resultado: LOTE COMPLETO (Diff: ${(n.faceLen - n.overlap).toFixed(3)}m <= 0.5m)`)
      }

      neighborMetas.push({
        name: `lote ${n.name}`,
        is_partial: isPartial
      })
    }

    result.push({
      direction: edge.direction,
      distance: parseFloat(edge.distance.toFixed(2)),
      neighbors: neighborMetas.sort((a, b) => a.name.localeCompare(b.name)),
      touchesRoad: edge.touchesRoad,
      roadContactFull: false
    })
  }

  console.log('[DEBUG-GEOMETRY] Resultado Final getBoundariesWithNeighbors:', JSON.stringify(result, null, 2))
  return result
}
