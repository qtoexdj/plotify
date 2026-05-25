import buffer from '@turf/buffer'
import intersect from '@turf/intersect'
import area from '@turf/area'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import destination from '@turf/destination'
import lineToPolygon from '@turf/line-to-polygon'
import { featureCollection, point as turfPoint } from '@turf/helpers'
import type { GeoJSONGeometry } from '@/types/database.types'
import type {
  ServidumbreEdge,
  ServidumbreTramo,
  ServidumbreAnalysis,
  ServidumbreFrontierType,
  NeighborMetadata,
} from '@/types/database.types'
import type { Feature, Polygon, MultiPolygon, LineString, MultiLineString } from 'geojson'
import {
  calculateDistance,
  calculateBearing,
  getCardinalDirection,
  getPolygonCentroidGeographic,
  getOutwardNormalBearing,
  getFeatureCoords,
} from './utils'

export interface ServidumbreCalculationResult {
  servidumbreM2: number
  intersectionPolygon: Feature<Polygon | MultiPolygon> | null
}

/**
 * Convierte un GeoJSONGeometry (nuestro tipo de base de datos) a un Feature de Turf.js
 * Asume que recibe la geometría pura ("Point", "LineString", "Polygon", etc.)
 */
function toTurfFeature(
  geometry: GeoJSONGeometry
): Feature<Polygon | MultiPolygon | LineString | MultiLineString> | null {
  if (!geometry) return null

  // Turf espera Features, no solo la geometría suelta
  // IMPORTANT: clean coordinates (sometimes geometries from DB have string parsed floats or weird types that turf rejects)
  const cleanGeometry = JSON.parse(JSON.stringify(geometry))

  return {
    type: 'Feature',
    properties: {},
    geometry: cleanGeometry,
  }
}

/**
 * Sanitiza una geometría de lote: si viene como LineString o MultiLineString
 * (perímetro crudo desde KMZ/CAD), lo convierte a Polygon rellenado.
 * Turf.intersect exige Polygon|MultiPolygon; esta función garantiza esa entrada.
 */
function sanitizeLotGeometry(geometry: GeoJSONGeometry): GeoJSONGeometry | null {
  if (!geometry) return null

  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    return geometry
  }

  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    try {
      const feature = toTurfFeature(geometry)
      if (!feature) return null
      const polygon = lineToPolygon(feature as Feature<LineString | MultiLineString>)
      console.log('[Servidumbre] Sanitización: convertido', geometry.type, '→ Polygon')
      return polygon.geometry as unknown as GeoJSONGeometry
    } catch (e) {
      console.error('[Servidumbre] Error convirtiendo', geometry.type, 'a Polygon:', e)
      return null
    }
  }

  return null
}

/**
 * Calcula el área de servidumbre (intersección) entre un lote y un camino.
 * @param lotGeometry La geometría del lote (Polygon o MultiPolygon)
 * @param roadGeometry La geometría del camino (LineString o MultiLineString)
 * @param widthRoadMeters El ancho total del camino en metros
 * @returns ServidumbreCalculationResult con los m2 y el polígono de intersección resultante
 */
export function calculateServidumbre(
  lotGeometry: GeoJSONGeometry,
  roadGeometry: GeoJSONGeometry,
  widthRoadMeters: number
): ServidumbreCalculationResult {
  console.log('[Servidumbre] Iniciando cálculo:', {
    lotType: lotGeometry?.type,
    roadType: roadGeometry?.type,
    width: widthRoadMeters,
    lotCoordsLength: lotGeometry?.coordinates?.length,
    roadCoordsLength: roadGeometry?.coordinates?.length,
  })

  if (!lotGeometry || !roadGeometry || widthRoadMeters <= 0) {
    console.log('[Servidumbre] Aborted: Missing inputs')
    return { servidumbreM2: 0, intersectionPolygon: null }
  }

  try {
    // Sanitizar: convertir LineString/MultiLineString → Polygon si es necesario
    const sanitizedLotGeom = sanitizeLotGeometry(lotGeometry)
    if (!sanitizedLotGeom) {
      console.error('[Servidumbre] No se pudo sanitizar la geometría del lote')
      return { servidumbreM2: 0, intersectionPolygon: null }
    }

    const lotFeature = toTurfFeature(sanitizedLotGeom)
    const roadFeature = toTurfFeature(roadGeometry)

    if (!lotFeature || !roadFeature) {
      return { servidumbreM2: 0, intersectionPolygon: null }
    }

    // 1. Crear el buffer del camino (convierte línea a polígono con el ancho deseado)
    // IMPORTANTE: turf.buffer espera RADIO, no diámetro.
    // widthRoadMeters = ancho total de la calle → radio = ancho / 2
    // Ej: calle de 6m → buffer de 3m a cada lado del eje
    const radiusMeters = widthRoadMeters / 2
    console.log('[Servidumbre] Buffer:', { widthRoadMeters, radiusMeters })
    const bufferedRoad = buffer(roadFeature, radiusMeters, { units: 'meters' })

    if (!bufferedRoad) {
      return { servidumbreM2: 0, intersectionPolygon: null }
    }

    // 2. Intersectar el lote con el camino con buffer
    const intersection = intersect(
      featureCollection([
        lotFeature as Feature<Polygon | MultiPolygon>,
        bufferedRoad as Feature<Polygon | MultiPolygon>,
      ])
    )

    if (!intersection) {
      // No hay superposición
      return { servidumbreM2: 0, intersectionPolygon: null }
    }

    // 3. Calcular el área resultante en m2 (1 decimal para precisión legal)
    // NOTA: El buffer de Turf genera tapas redondeadas (semicírculos) en los
    // extremos, lo que infla ligeramente el área real (~πr²). Para lotes con
    // camino pasante (sin cabezas expuestas), el efecto es mínimo. Validar
    // visualmente contra el plano topográfico de referencia.
    const areaM2 = parseFloat(area(intersection).toFixed(1))

    console.log(`[Servidumbre] Cálculo exitoso: ${areaM2} m2`)

    return {
      servidumbreM2: areaM2,
      intersectionPolygon: intersection as Feature<Polygon | MultiPolygon>,
    }
  } catch (error) {
    console.error('[Servidumbre] ERROR DE TURF:', error)
    return { servidumbreM2: 0, intersectionPolygon: null }
  }
}

// ─── Servidumbre Boundary Analysis ──────────────────────────────────────────

/** Contexto del lote vecino para detección de fronteras externas */
interface LotContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: { type: string; coordinates: any }
  properties: { geometry_type?: string; lot_id?: string; numero_lote?: string }
}

/**
 * Extrae las coordenadas del anillo exterior de un Polygon o MultiPolygon Feature de Turf.
 * Si es MultiPolygon, retorna las coordenadas del primer polígono.
 * @internal Utilidad auxiliar para futuros usos de debugging/exporting.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getIntersectionCoords(feat: Feature<Polygon | MultiPolygon>): number[][] | null {
  const { type, coordinates } = feat.geometry
  if (type === 'Polygon') return coordinates[0]
  if (type === 'MultiPolygon') return coordinates[0]?.[0]
  return null
}

/**
 * Obtiene TODOS los anillos exteriores de un resultado de intersección.
 * Si es MultiPolygon, retorna cada sub-polígono como un anillo separado.
 */
function getAllIntersectionRings(feat: Feature<Polygon | MultiPolygon>): number[][][] {
  const { type, coordinates } = feat.geometry
  if (type === 'Polygon') return [coordinates[0]]
  if (type === 'MultiPolygon') return coordinates.map((poly: number[][][]) => poly[0])
  return []
}

// ─── Fusión Colineal (Guardrail #2) ────────────────────────────────────────

interface RawSegment {
  p1: number[]
  p2: number[]
  distance: number
  direction: string
  bearing: number
}

/**
 * Aplica fusión colineal a un arreglo de segmentos crudos.
 * Tolerancia de 3° para considerar dos segmentos consecutivos como colineales.
 * Esto elimina artefactos CAD heredados del intersect de Turf.
 */
function fuseCollinearSegments(segments: RawSegment[]): RawSegment[] {
  if (segments.length === 0) return []

  let processed = [...segments]
  let currentLen = 0

  const mergePass = (input: RawSegment[]): RawSegment[] => {
    const merged: RawSegment[] = []
    for (const cur of input) {
      if (merged.length === 0) {
        merged.push({ ...cur })
        continue
      }
      const last = merged[merged.length - 1]

      const diffBearing = Math.abs(cur.bearing - last.bearing)
      const minDiffBearing = Math.min(diffBearing, 360 - diffBearing)
      const isCollinear = minDiffBearing < 3.0

      if (isCollinear) {
        last.p2 = cur.p2
        last.distance += cur.distance
        last.bearing = calculateBearing(last.p1, last.p2)
        // Re-calcular dirección tras fusión
        // (no necesitamos centroide aquí, se recalculará después)
      } else {
        merged.push({ ...cur })
      }
    }
    return merged
  }

  while (processed.length !== currentLen) {
    currentLen = processed.length
    processed = mergePass(processed)
  }

  return processed
}

// ─── Detección de Vecinos en Servidumbre ──────────────────────────────────────

/**
 * Detecta qué lotes vecinos colindan con un segmento dado del mini-polígono.
 * Reutiliza la lógica de overlap/FaceLen de utils.ts pero aislada para servidumbre.
 */
function detectNeighborsForSegment(
  p1: number[],
  p2: number[],
  bearing: number,
  otherLots: { name: string; coords: number[][] }[],
  centroid: number[],
  DEG_TO_M_LAT: number,
  DEG_TO_M_LON: number
): NeighborMetadata[] {
  const mx1 = (p1[0] - centroid[0]) * DEG_TO_M_LON
  const my1 = (p1[1] - centroid[1]) * DEG_TO_M_LAT
  const mx2 = (p2[0] - centroid[0]) * DEG_TO_M_LON
  const my2 = (p2[1] - centroid[1]) * DEG_TO_M_LAT
  const dx = mx2 - mx1
  const dy = my2 - my1
  const L = Math.hypot(dx, dy)

  if (L <= 0) return []

  const ux = dx / L
  const uy = dy / L

  const results: NeighborMetadata[] = []

  for (const lot of otherLots) {
    let maxOverlap = 0
    let isNeighbor = false
    let totalNeighborFaceLen = 0

    for (let j = 0; j < lot.coords.length - 1; j++) {
      const a = lot.coords[j],
        b = lot.coords[j + 1]

      // 1. Overlap (Proyectado)
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
        const d1 = Math.hypot(
          ax + f1 * (bx - ax) - (mx1 + tMin * ux),
          ay + f1 * (by - ay) - (my1 + tMin * uy)
        )
        const f2 = ta === tb ? 1 : (tMax - ta) / (tb - ta)
        const d2 = Math.hypot(
          ax + f2 * (bx - ax) - (mx1 + tMax * ux),
          ay + f2 * (by - ay) - (my1 + tMax * uy)
        )

        if (d1 < 0.1 && d2 < 0.1) {
          isNeighbor = true
          if (overlap > maxOverlap) maxOverlap = overlap
        }
      }

      // 2. FaceLen (Suma Colineal)
      const nBearing = calculateBearing(a, b)
      const diff = Math.abs(nBearing - bearing)
      const minDiff = Math.min(diff, 360 - diff)

      if (minDiff < 3.0 || Math.abs(minDiff - 180) < 3.0) {
        const midX = (a[0] + b[0]) / 2
        const midY = (a[1] + b[1]) / 2
        const midX_m = (midX - centroid[0]) * DEG_TO_M_LON
        const midY_m = (midY - centroid[1]) * DEG_TO_M_LAT

        const numerator = Math.abs(
          (my2 - my1) * midX_m - (mx2 - mx1) * midY_m + mx2 * my1 - my2 * mx1
        )
        const denominator = Math.hypot(my2 - my1, mx2 - mx1)
        const distToLine = denominator === 0 ? 0 : numerator / denominator

        if (distToLine < 3.0) {
          totalNeighborFaceLen += calculateDistance(a, b)
        }
      }
    }

    if (isNeighbor) {
      const isPartial = maxOverlap < totalNeighborFaceLen - 0.5
      results.push({
        name: `lote ${lot.name}`,
        is_partial: isPartial,
      })
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Agrupación en Tramos ──────────────────────────────────────────────────

/**
 * Detecta la dirección cardinal "dominante" del polígono de servidumbre
 * respecto al lote original. Se usa para agrupar en tramos.
 *
 * Algoritmo: cada arista cuya frontera sea INTERNA aporta la dirección
 * OPUESTA como "deslinde principal". Las aristas externas aportan su propia
 * dirección. Se agrupan consecutivas con misma dirección.
 */
function groupEdgesIntoTramos(edges: ServidumbreEdge[]): ServidumbreTramo[] {
  if (edges.length === 0) return []

  // Paso 1: Determinar la dirección "cardinal dominante" de cada arista
  // Para aristas internas, la normal apunta HACIA el lote → la servidumbre "corre"
  // en la dirección del borde. Usamos la dirección de la arista como referencia.
  // Para tramos, agrupamos por la dirección cardinal de las aristas internas
  // (que nos dicen "por dónde corre la servidumbre").

  // Estrategia: buscar patrones de dirección cardinal agrupados.
  // Las aristas internas (que miran hacia el lote) son las que definen
  // "por qué deslinde corre" la servidumbre.

  // Encontrar las direcciones de las aristas internas para determinar el "deslinde dominante"
  const internalDirections: { idx: number; direction: string }[] = []
  for (let i = 0; i < edges.length; i++) {
    if (edges[i].frontierType === 'internal') {
      internalDirections.push({ idx: i, direction: edges[i].direction })
    }
  }

  // Si no hay aristas internas (caso raro), un solo tramo con la dirección más frecuente
  if (internalDirections.length === 0) {
    const dirCounts: Record<string, number> = {}
    for (const e of edges) {
      dirCounts[e.direction] = (dirCounts[e.direction] || 0) + 1
    }
    const dominantDir = Object.entries(dirCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Norte'
    return [{ direction: dominantDir, edges }]
  }

  // Agrupar aristas internas consecutivas con misma dirección
  const internalGroups: { direction: string; startIdx: number; endIdx: number }[] = []
  let currentGroup = {
    direction: internalDirections[0].direction,
    startIdx: internalDirections[0].idx,
    endIdx: internalDirections[0].idx,
  }

  for (let i = 1; i < internalDirections.length; i++) {
    if (internalDirections[i].direction === currentGroup.direction) {
      currentGroup.endIdx = internalDirections[i].idx
    } else {
      internalGroups.push({ ...currentGroup })
      currentGroup = {
        direction: internalDirections[i].direction,
        startIdx: internalDirections[i].idx,
        endIdx: internalDirections[i].idx,
      }
    }
  }
  internalGroups.push(currentGroup)

  // Si solo hay 1 grupo de dirección interna → 1 tramo
  if (internalGroups.length <= 1) {
    return [{ direction: internalGroups[0].direction, edges }]
  }

  // Multi-tramo: distribuir aristas entre tramos según cercanía a grupo interno
  const tramos: ServidumbreTramo[] = []

  for (let gIdx = 0; gIdx < internalGroups.length; gIdx++) {
    const group = internalGroups[gIdx]
    const nextGroup = internalGroups[gIdx + 1]

    // Rango de aristas para este tramo
    const startEdge = gIdx === 0 ? 0 : group.startIdx
    const endEdge = nextGroup ? nextGroup.startIdx : edges.length

    const tramoEdges = edges.slice(startEdge, endEdge)
    if (tramoEdges.length > 0) {
      tramos.push({ direction: group.direction, edges: tramoEdges })
    }
  }

  return tramos
}

// ─── Función Principal de Análisis ──────────────────────────────────────────

/**
 * Analiza las aristas del mini-polígono de servidumbre (intersección lote × camino)
 * y clasifica cada borde como frontera interna, vecino o externa.
 *
 * Implementa los dos guardrails:
 * - Guardrail #1: Proyección de testPoint a 0.1m (micro-ray casting seguro)
 * - Guardrail #2: Fusión colineal de artefactos CAD antes de clasificación
 *
 * @param lotGeometry Geometría del lote original
 * @param roadGeometry Geometría del camino (LineString/MultiLineString)
 * @param widthRoadMeters Ancho del camino en metros
 * @param lotNumber Número del lote (ej. "3")
 * @param allLotFeatures Todos los features del proyecto (para detección de vecinos)
 * @param currentLotId ID del lote actual (para excluirlo de vecinos)
 * @returns ServidumbreAnalysis con tramos y aristas clasificadas
 */
export function analyzeServidumbreBoundaries(
  lotGeometry: GeoJSONGeometry,
  roadGeometry: GeoJSONGeometry,
  widthRoadMeters: number,
  lotNumber: string,
  allLotFeatures: LotContext[],
  currentLotId?: string
): ServidumbreAnalysis | null {
  // 1. Obtener el mini-polígono de servidumbre
  const calcResult = calculateServidumbre(lotGeometry, roadGeometry, widthRoadMeters)
  if (!calcResult.intersectionPolygon || calcResult.servidumbreM2 <= 0) {
    return null
  }

  const miniPolygon = calcResult.intersectionPolygon

  // 2. Preparar el lote como Feature para booleanPointInPolygon
  // Sanitizar: el lote puede venir como LineString desde el KMZ
  const sanitizedLotGeom = sanitizeLotGeometry(lotGeometry)
  if (!sanitizedLotGeom) return null
  const lotFeature = toTurfFeature(sanitizedLotGeom) as Feature<Polygon | MultiPolygon>
  if (!lotFeature) return null

  // 3. Preparar datos de vecinos
  const otherLots = allLotFeatures
    .filter(
      (f) =>
        f.properties.geometry_type === 'lot' &&
        f.properties.lot_id !== currentLotId &&
        f.properties.numero_lote
    )
    .map((f) => ({ name: f.properties.numero_lote!, coords: getFeatureCoords(f) }))
    .filter((l): l is { name: string; coords: number[][] } => l.coords !== null)

  // 4. Procesar cada anillo del mini-polígono (puede ser MultiPolygon)
  const allRings = getAllIntersectionRings(miniPolygon)
  const allEdges: ServidumbreEdge[] = []

  for (const ring of allRings) {
    if (!ring || ring.length < 3) continue

    // Guardrail #2: Crear segmentos crudos y fusionar colineales
    const centroid = getPolygonCentroidGeographic(ring)

    const cosLat = Math.cos((centroid[1] * Math.PI) / 180)
    const DEG_TO_M_LAT = 111132
    const DEG_TO_M_LON = 111132 * cosLat

    const rawSegments: RawSegment[] = []
    for (let i = 0; i < ring.length - 1; i++) {
      const p1 = ring[i]
      const p2 = ring[i + 1]
      const dist = calculateDistance(p1, p2)
      if (dist < 0.01) continue // Ignorar micro-aristas CAD

      const bearing = calculateBearing(p1, p2)
      const normalBearing = getOutwardNormalBearing(p1, p2, centroid)
      const direction = getCardinalDirection(normalBearing)

      rawSegments.push({ p1, p2, distance: dist, direction, bearing })
    }

    // Fusión Colineal (Guardrail #2)
    const fusedSegments = fuseCollinearSegments(rawSegments)

    // 5. Recalcular dirección y clasificar cada segmento fusionado
    for (const seg of fusedSegments) {
      // Recalcular la normal exterior con el centroide correcto
      const normalBearing = getOutwardNormalBearing(seg.p1, seg.p2, centroid)
      const direction = getCardinalDirection(normalBearing)

      // Guardrail #1: Proyectar testPoint a 0.1m sobre la normal exterior
      const midPoint = [(seg.p1[0] + seg.p2[0]) / 2, (seg.p1[1] + seg.p2[1]) / 2]
      const testPointFeature = destination(
        turfPoint(midPoint),
        0.0001, // 0.1 metros = 0.0001 km
        normalBearing,
        { units: 'kilometers' }
      )
      const testCoords = testPointFeature.geometry.coordinates

      // ¿El punto de prueba cae DENTRO del lote original?
      const isInsideLot = booleanPointInPolygon(turfPoint(testCoords), lotFeature)

      let frontierType: ServidumbreFrontierType
      let neighbors: NeighborMetadata[] = []

      if (isInsideLot) {
        // FRONTERA INTERNA: colinda con el área útil del propio lote
        frontierType = 'internal'
      } else {
        // FRONTERA EXTERNA: buscar vecinos
        neighbors = detectNeighborsForSegment(
          seg.p1,
          seg.p2,
          seg.bearing,
          otherLots,
          centroid,
          DEG_TO_M_LAT,
          DEG_TO_M_LON
        )

        if (neighbors.length > 0) {
          frontierType = 'neighbor'
        } else {
          frontierType = 'external'
        }
      }

      const edge: ServidumbreEdge = {
        direction,
        distance: parseFloat(seg.distance.toFixed(1)),
        frontierType,
        selfLotNumber: frontierType === 'internal' ? lotNumber : undefined,
        neighbors,
        bearing: seg.bearing,
        p1: seg.p1,
        p2: seg.p2,
      }

      allEdges.push(edge)
    }
  }

  // 6. Agrupar en tramos
  const tramos = groupEdgesIntoTramos(allEdges)

  return {
    lotNumber,
    areaM2: calcResult.servidumbreM2,
    isMultiTramo: tramos.length > 1,
    tramos,
    allEdges,
  }
}
