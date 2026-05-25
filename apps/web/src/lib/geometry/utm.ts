import proj4 from 'proj4'
import { calculatePolygonArea, calculateDistance } from './utils'

/**
 * Representa una coordenada en el plano UTM (metros)
 */
export interface UTMPoint {
  x: number
  y: number
  zone: number
  epsg: string
}

/**
 * Resultado completo de métricas legales
 */
export interface LegalMetrics {
  area_geodesic_m2: number // Superficie "Física" (WGS84 Esférico R=6378k)
  perimeter_geodesic_m: number
  area_legal_m2: number // Superficie "Legal" (Plana UTM Proyectada)
  perimeter_legal_m: number
  utm_zone: number
  epsg: string
}

/**
 * Calcula la zona UTM basada en la longitud.
 * Fórmula estándar: floor((lon + 180) / 6) + 1
 */
export function getUTMZone(lon: number): number {
  return Math.floor((lon + 180) / 6) + 1
}

/**
 * Define la proyección para una zona UTM Sur (EPSG:327xx) en proj4 si no existe.
 * @param zone Número de zona (ej: 19)
 * @returns String de definición EPSG (ej: 'EPSG:32719')
 */
export function getUTMProjection(zone: number): string {
  const epsg = `EPSG:327${zone}`

  // Si proj4 no tiene definida la proyección, la definimos.
  // WGS84 UTM South: +proj=utm +zone=XX +south +ellps=WGS84 +datum=WGS84 +units=m +no_defs
  if (!proj4.defs(epsg)) {
    proj4.defs(epsg, `+proj=utm +zone=${zone} +south +ellps=WGS84 +datum=WGS84 +units=m +no_defs`)
  }

  return epsg
}

/**
 * Convierte Lat/Lon (WGS84) a UTM (EPSG:327xx).
 * @param lat Latitud decimal
 * @param lon Longitud decimal
 * @param forceZone (Opcional) Forzar una zona específica. Si no, se calcula por lon.
 */
export function toUTM(lat: number, lon: number, forceZone?: number): UTMPoint {
  const zone = forceZone || getUTMZone(lon)
  const epsg = getUTMProjection(zone)

  // WGS84 EPSG:4326 es el default de entrada
  const [x, y] = proj4('EPSG:4326', epsg, [lon, lat])

  return { x, y, zone, epsg }
}

/**
 * Calcula el área de un polígono en el plano (Shoelace Formula)
 * @param points Array de puntos {x, y}
 */
export function calculateShoelaceArea(points: { x: number; y: number }[]): number {
  let area = 0
  const n = points.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }

  return Math.abs(area / 2.0)
}

/**
 * Calcula el perímetro plano sumando distancias euclidianas.
 */
export function calculatePlanarPerimeter(points: { x: number; y: number }[]): number {
  let perim = 0
  const n = points.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const dx = points[j].x - points[i].x
    const dy = points[j].y - points[i].y
    perim += Math.sqrt(dx * dx + dy * dy)
  }

  return perim
}

/**
 * Limpia y prepara las coordenadas del polígono para cálculo.
 * 1. Elimina duplicados consecutivos.
 * 2. Asegura que no tenga cierre explícito (Shoelace asume cierre implícito i -> (i+1)%n).
 *    Si el último punto es igual al primero, se remueve.
 */
function cleanPolygonCoordinates(coords: number[][]): number[][] {
  if (coords.length < 3) return coords

  const cleaned: number[][] = []

  // Filtrar duplicados consecutivos
  for (let i = 0; i < coords.length; i++) {
    const curr = coords[i]
    const prev = cleaned.length > 0 ? cleaned[cleaned.length - 1] : null

    // Tolerancia muy fina para igualdad flotante
    if (!prev || Math.abs(curr[0] - prev[0]) > 1e-9 || Math.abs(curr[1] - prev[1]) > 1e-9) {
      cleaned.push(curr)
    }
  }

  // Verificar si el último cierra con el primero
  const first = cleaned[0]
  const last = cleaned[cleaned.length - 1]
  if (
    cleaned.length > 3 &&
    Math.abs(first[0] - last[0]) < 1e-9 &&
    Math.abs(first[1] - last[1]) < 1e-9
  ) {
    cleaned.pop()
  }

  return cleaned
}

/**
 * Helper Principal: Calcula todas las métricas (Geodésicas y Legales/UTM).
 * @param coordinates Array de [lon, lat]
 * @param projectCentroid (Opcional) Centroide del proyecto [lon, lat] para forzar zona UTM común.
 */
export function calculateLegalMetrics(
  coordinates: number[][],
  projectCentroid?: number[]
): LegalMetrics {
  // 1. Métricas Geodésicas (Bases de datos / Realidad física)
  const area_geodesic_m2 = calculatePolygonArea(coordinates)

  // Perímetro geodésico: sumamos distancias esféricas
  let perimeter_geodesic_m = 0
  const cleaned = cleanPolygonCoordinates(coordinates) // Usamos versión limpia para iterar

  // Ojo: calculatePolygonArea maneja su propio cierre, aquí iteramos explícitamente
  for (let i = 0; i < cleaned.length; i++) {
    const p1 = cleaned[i]
    const p2 = cleaned[(i + 1) % cleaned.length]
    perimeter_geodesic_m += calculateDistance(p1, p2)
  }

  // 2. Métricas Legales (Proyección UTM)
  // Definir Zona Central del Proyecto o usar la del primer punto
  let zone: number
  if (projectCentroid) {
    zone = getUTMZone(projectCentroid[0])
  } else if (cleaned.length > 0) {
    zone = getUTMZone(cleaned[0][0])
  } else {
    zone = 19 // Default Santiago/Chile Central safety fallback
  }

  // Proyectar coordenadas a plano UTM
  const utmPoints = cleaned.map((coord) => toUTM(coord[1], coord[0], zone))

  // Calcular en plano
  const area_legal_m2 = calculateShoelaceArea(utmPoints)
  const perimeter_legal_m = calculatePlanarPerimeter(utmPoints)

  return {
    area_geodesic_m2,
    perimeter_geodesic_m,
    area_legal_m2,
    perimeter_legal_m,
    utm_zone: zone,
    epsg: `EPSG:327${zone}`,
  }
}
