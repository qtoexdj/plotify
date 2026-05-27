import { NextRequest } from 'next/server'
import { extractKmlFromKmz } from '@/lib/services/kmz-parser.service'
import { kmlToGeoJSON, normalizeGeoJSON } from '@/lib/services/kml-to-geojson.service'
import { geometryUploadSchema } from '@/lib/validators/geometry'
import { createClient } from '@/lib/supabase/server'
import type { ParsedFeature } from '@/types/onboarding.types'
import { fileTypeFromBuffer } from 'file-type'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
// export const dynamic = 'force-dynamic' // No necesario con Request body, pero lo mantenemos si hay dudas

export async function POST(request: NextRequest) {
  try {
    // 1. Validar Content-Length (Límite 20MB)
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > 20 * 1024 * 1024) {
      return Response.json({ error: 'El archivo excede el límite de 20MB' }, { status: 413 })
    }

    const formData = await request.formData()

    // Validar con Zod
    const validatedData = {
      file: formData.get('file'),
      projectId: formData.get('project_id'),
      epsg: formData.get('epsg'),
    }

    const result = geometryUploadSchema.safeParse(validatedData)

    if (!result.success) {
      return Response.json(
        { error: 'Datos inválidos', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const { file, projectId } = result.data
    const fileName = file.name.toLowerCase()

    // 2. Identificar Tipo de Archivo y Validar Magic Numbers (Server-side signature check)
    const chunk = file.slice(0, 4096)
    const headerBuffer = Buffer.from(await chunk.arrayBuffer())
    const typeInfo = await fileTypeFromBuffer(headerBuffer)

    let sourceType: 'kmz' | 'kml' | undefined

    // KMZ is essentially a ZIP archive
    if (typeInfo && typeInfo.ext === 'zip' && fileName.endsWith('.kmz')) {
      sourceType = 'kmz'
    }

    const textHeader = headerBuffer.toString('utf8', 0, 100).trim().toLowerCase()

    if (!sourceType && (textHeader.startsWith('<?xml') || textHeader.includes('<kml'))) {
      // KML signature
      sourceType = 'kml'
    }

    if (!sourceType) {
      logger.warn({ fileName, detectedExt: typeInfo?.ext }, 'upload_invalid_file_signature')
      return Response.json(
        {
          error:
            'El archivo subido no coincide con el formato binario esperado (falso o corrupto).',
        },
        { status: 400 }
      )
    }

    // 3. Procesamiento según tipo
    // --- Flujo KMZ/KML ---
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let kmlString = ''
    try {
      if (sourceType === 'kmz') {
        kmlString = await extractKmlFromKmz(buffer)
      } else {
        kmlString = buffer.toString('utf-8')
      }
    } catch (zipError) {
      logger.warn({ projectId, error: zipError }, 'upload_kmz_extraction_failed')
      return Response.json(
        { error: 'No se pudo descomprimir el archivo KMZ. Asegúrate de que no esté corrupto.' },
        { status: 400 }
      )
    }

    let geojson
    try {
      geojson = kmlToGeoJSON(kmlString)
    } catch (parseError) {
      logger.warn({ projectId, error: parseError }, 'upload_kml_parse_failed')
      return Response.json(
        { error: 'El archivo KML tiene un formato XML inválido o corrupto.' },
        { status: 400 }
      )
    }

    // 4. Normalizar y Clasificar
    // normalizeGeoJSON añade 'geometryType' (lot, road, common_area)
    const classifiedFeatures = normalizeGeoJSON(geojson)

    // Validar que existan lotes en las características importadas
    const lotsCount = classifiedFeatures.filter((f) => f.geometryType === 'lot').length
    if (lotsCount === 0) {
      logger.warn({ projectId }, 'upload_no_lots_found')
      return Response.json(
        {
          error: 'El archivo no contiene lotes. Se requiere al menos un lote para la importación.',
        },
        { status: 400 }
      )
    }

    // 5. Preparar Datos para Persistencia
    // Mapeamos a la estructura de la base de datos
    const featuresToInsert = classifiedFeatures.map((feature) => ({
      project_id: projectId,
      geometry_type: feature.geometryType, // 'lot' | 'road' | 'common_area'
      source_type: sourceType,
      geometry: feature.geometry,
      properties: feature.properties || {}, // Incluye area_m2 si viene del microservicio
      name: feature.properties?.name || feature.properties?.layer || `Importado ${sourceType}`,
      // lot_id se asigna después, en el paso de asignación
    }))

    // 6. Bulk Upsert en DB
    const supabase = await createClient()

    // Usamos upsert si queremos permitir re-subidas que reemplacen?
    // Por ahora insert es más seguro para no sobreescribir inadvertidamente sin ID.
    // Pero el requerimiento dice "Persistencia Masiva... Upsert".
    // Como no tenemos IDs estables desde el archivo (salvo handles de CAD que podrían repetirse en distintos archivos),
    // Insert es lo correcto para nuevos registros.
    // Si quisiéramos upsert necesitaríamos un criterio de unicidad (ej. handle + project_id).
    // Asumiremos insert para clean slate de importación.

    const { data: insertedData, error: dbError } = await supabase
      .from('geometries')
      .insert(featuresToInsert)
      .select('id, geometry_type, properties') // Retornamos lo necesario para el frontend

    if (dbError) {
      logger.error({ projectId, error: dbError }, 'upload_db_persistence_error')
      throw new Error('Error al guardar las geometrías en la base de datos')
    }

    // 7. Preparar respuesta para el frontend
    // Re-mapeo fiable: combinamos geometría original con el ID generado en BD
    const mappedFeatures: ParsedFeature[] = classifiedFeatures.map((f, i) => ({
      tempId: insertedData && insertedData[i] ? insertedData[i].id : `temp-${Date.now()}-${i}`,
      geometry: f.geometry,
      properties: f.properties || {},
      geometryType: f.geometryType,
    }))

    const summary = {
      lots: mappedFeatures.filter((f) => f.geometryType === 'lot').length,
      roads: mappedFeatures.filter((f) => f.geometryType === 'road').length,
      commonAreas: mappedFeatures.filter((f) => f.geometryType === 'common_area').length,
    }

    return Response.json({
      message: 'Archivo procesado y guardado exitosamente',
      totalFeatures: mappedFeatures.length,
      sourceType,
      summary,
      features: mappedFeatures,
    })
  } catch (error) {
    console.error('API UPLOAD GEOMETRY ERROR DETAILS:', error)
    logger.error({ error }, 'upload_geometry_error')

    return Response.json(
      { error: error instanceof Error ? error.message : 'Error al procesar archivo' },
      { status: 500 }
    )
  }
}
