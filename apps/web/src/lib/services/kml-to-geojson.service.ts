import { DOMParser } from '@xmldom/xmldom'
import * as toGeoJSON from '@tmcw/togeojson'
import type { GeoJSONFeatureCollection, GeoJSONFeature, GeometryType } from '@/types/database.types'

/**
 * Convierte KML (string XML) a GeoJSON FeatureCollection
 */
export function kmlToGeoJSON(kmlString: string): GeoJSONFeatureCollection {
  try {
    // Parsear XML a DOM
    const parser = new DOMParser()
    const kmlDom = parser.parseFromString(kmlString, 'text/xml')

    // Convertir a GeoJSON usando togeojson
    const geojson = toGeoJSON.kml(kmlDom) as GeoJSONFeatureCollection

    return geojson
  } catch (error) {
    console.error('Error al convertir KML a GeoJSON:', error)
    throw new Error(`Error al procesar KML: ${error}`)
  }
}

/**
 * Detecta el tipo de geometría basado en propiedades del KML
 * - Si es LineString/MultiLineString -> 'road'
 * - Si tiene palabras clave de área común -> 'common_area'
 * - Por defecto -> 'lot'
 */
function detectGeometryType(feature: GeoJSONFeature, geomType: string): GeometryType {
  // LineStrings son caminos
  if (geomType === 'LineString' || geomType === 'MultiLineString') {
    return 'road'
  }

  // Buscar palabras clave en propiedades para detectar áreas comunes
  const props = feature.properties || {}
  const propsText = JSON.stringify(props).toLowerCase()
  const name = (props.name || props.Name || '').toLowerCase()

  const roadKeywords = [
    'camino',
    'calle',
    'avenida',
    'ruta',
    'carretera',
    'servidumbre',
    'transito',
    'acceso',
    'pasaje',
    'via',
  ]
  const commonAreaKeywords = [
    'plaza',
    'parque',
    'area comun',
    'área común',
    'espacio verde',
    'equipamiento',
  ]

  // Verificar si es camino por nombre/propiedades
  if (roadKeywords.some((kw) => name.includes(kw) || propsText.includes(kw))) {
    return 'road'
  }

  // Verificar si es área común
  if (commonAreaKeywords.some((kw) => name.includes(kw) || propsText.includes(kw))) {
    return 'common_area'
  }

  return 'lot'
}

export interface ClassifiedFeature extends GeoJSONFeature {
  geometryType: GeometryType
}

/**
 * Normaliza FeatureCollection para extraer geometrías válidas
 * Incluye: Polygon, MultiPolygon, LineString, MultiLineString
 * Extrae geometrías de GeometryCollections
 * Clasifica cada feature según su tipo
 */
export function normalizeGeoJSON(geojson: GeoJSONFeatureCollection): ClassifiedFeature[] {
  const validFeatures: ClassifiedFeature[] = []

  const validTypes = ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']

  for (const feature of geojson.features) {
    if (!feature.geometry) continue

    const geomType = feature.geometry.type

    // Enriquecer y normalizar propiedades
    const origProps = feature.properties || {}
    const name = (origProps.name || origProps.Name || '').toString().trim()

    // Intentar inferir número de lote a partir de campos existentes o del nombre
    let inferredLotNumber = (
      origProps.lot_number ||
      origProps.numero_lote ||
      origProps.number ||
      ''
    )
      .toString()
      .trim()
    if (!inferredLotNumber && name) {
      const lotMatch = name.match(/(?:lote|lotes|plot|parcela)\s*(\w+)/i)
      if (lotMatch && lotMatch[1]) {
        inferredLotNumber = lotMatch[1]
      } else {
        const numMatch = name.match(/^\d+$/)
        if (numMatch) {
          inferredLotNumber = name
        }
      }
    }

    const enrichedProperties = {
      ...origProps,
      name,
      inferred_lot_number: inferredLotNumber,
      layer: origProps.layer || origProps.Layer || 'Importado',
    }

    // Aceptar tipos válidos directamente
    if (validTypes.includes(geomType)) {
      validFeatures.push({
        ...feature,
        properties: enrichedProperties,
        geometryType: detectGeometryType(feature, geomType),
      })
    } else if (geomType === 'GeometryCollection') {
      // Extraer geometrías de GeometryCollection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geometries = (feature.geometry as any).geometries || []

      for (const geom of geometries) {
        if (validTypes.includes(geom.type)) {
          validFeatures.push({
            type: 'Feature',
            geometry: geom,
            properties: enrichedProperties,
            geometryType: detectGeometryType(feature, geom.type),
          })
        }
      }
    }
  }

  return validFeatures
}
