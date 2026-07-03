import { createClient } from '@/lib/supabase/server'
import type { Lot, Geometry, GeoJSONGeometry } from '@/types/database.types'
import type { LotDetails } from '@/types/viewer.types'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>
import type {
  SaveAndAssignGeometryPayload,
  SaveInfrastructurePayload,
  AssignGeometryPayload,
} from '@/types/onboarding.types'
import { computeM2FromGeoJSON } from '@/lib/geometry/compute-m2'
import {
  calculateLotServitude,
  normalizeRoadSegmentToFootprint,
  type RoadSegmentInput,
} from '@/lib/geometry/servidumbre-footprints'

const SERVIDUMBRE_CALCULATION_VERSION = 'sdd14.v1'

type AssignedLotRow = {
  id: string
  m2: number | null
  geometry_id: string | null
  servidumbre_calculation_status?: string | null
}

type PersistedRoadSegment = {
  id: string
  name: string | null
  input_geometry: GeoJSONGeometry
  input_mode: RoadSegmentInput['mode']
  width_m: number | null
  edge_side?: 'left' | 'right' | 'both' | null
  status: 'ready' | 'needs_review' | 'invalid'
}

export type RecalculateProjectServidumbresResult = {
  projectId: string
  roadSegments: number
  lotsMatched: number
  lotsUpdated: number
  lotsSkipped: number
}

/**
 * Recalcula la servidumbre de un lote recién asignado a una geometría,
 * usando los tramos canónicos ya guardados en project_road_segments.
 */
async function recalculateLotServidumbreOnAssign(
  supabase: SupabaseClient,
  params: { projectId: string; lotId: string; lotGeometry: GeoJSONGeometry; lotM2: number | null }
): Promise<void> {
  try {
    const { data: readySegments } = await supabase
      .from('project_road_segments')
      .select(
        `
        id,
        name,
        input_geometry,
        input_mode,
        width_m,
        edge_side,
        footprint_geometry,
        status
      `
      )
      .eq('project_id', params.projectId)
      .eq('status', 'ready')

    const roadSegments = readySegments
      ? normalizePersistedRoadSegments(
          readySegments as Array<
            PersistedRoadSegment & { footprint_geometry?: GeoJSONGeometry | null }
          >
        )
      : []

    if (roadSegments.length === 0) return

    await persistLotServitudeFromRoadSegments(supabase, {
      lotId: params.lotId,
      lotGeometry: params.lotGeometry,
      lotM2: params.lotM2,
      roadSegments,
    })
  } catch (err) {
    console.error(
      `[Servidumbre] Error recalculando al asignar geometría (lote ${params.lotId}):`,
      err
    )
  }
}

async function persistLotServitudeFromRoadSegments(
  supabase: SupabaseClient,
  params: {
    lotId: string
    lotGeometry: GeoJSONGeometry
    lotM2: number | null
    roadSegments: PersistedRoadSegment[]
  }
): Promise<boolean> {
  const readySegments = params.roadSegments.filter((segment) => segment.status === 'ready')
  const result = calculateLotServitude({
    lotId: params.lotId,
    lotGeometry: params.lotGeometry,
    totalAreaM2: params.lotM2,
    roadSegments: readySegments.map((segment) => ({
      id: segment.id,
      geometry: segment.input_geometry,
      mode: segment.input_mode,
      widthM: segment.width_m ?? undefined,
      edgeSide: segment.edge_side ?? undefined,
    })),
  })

  const { error } = await supabase
    .from('lots')
    .update(buildServitudeUpdatePayload(result, readySegments))
    .eq('id', params.lotId)

  if (error) {
    console.error(`[Servidumbre] ERROR al actualizar lote ${params.lotId}:`, error)
    return false
  }

  return true
}

async function recalculateLotsFromRoadSegments(
  supabase: SupabaseClient,
  params: {
    projectId: string
    roadSegments: PersistedRoadSegment[]
  }
): Promise<RecalculateProjectServidumbresResult> {
  const readySegments = params.roadSegments.filter((segment) => segment.status === 'ready')
  const result: RecalculateProjectServidumbresResult = {
    projectId: params.projectId,
    roadSegments: readySegments.length,
    lotsMatched: 0,
    lotsUpdated: 0,
    lotsSkipped: 0,
  }

  if (readySegments.length === 0) {
    return result
  }

  const { data: assignedLots, error: lotsErr } = await supabase
    .from('lots')
    .select(
      `
      id,
      m2,
      geometry_id,
      servidumbre_calculation_status
    `
    )
    .eq('project_id', params.projectId)
    .not('geometry_id', 'is', null)

  if (lotsErr) {
    console.error('[Servidumbre] ERROR al obtener assignedLots:', lotsErr)
    return result
  }

  if (!assignedLots) return result

  const lots = assignedLots as AssignedLotRow[]
  result.lotsMatched = lots.length

  const geometryIds = [
    ...new Set(lots.map((lot) => lot.geometry_id).filter((id): id is string => Boolean(id))),
  ]

  const geometriesById = await loadLotGeometriesById(supabase, geometryIds)

  const updatePromises = lots.map(async (lot) => {
    if (lot.servidumbre_calculation_status === 'official_override') {
      return 'skipped' as const
    }

    const lotGeom = lot.geometry_id ? geometriesById.get(lot.geometry_id) : null

    if (!lotGeom) {
      console.warn(`[Servidumbre] Lote ${lot.id} omitido por no tener geometry`)
      return 'skipped' as const
    }

    const updated = await persistLotServitudeFromRoadSegments(supabase, {
      lotId: lot.id,
      lotGeometry: lotGeom,
      lotM2: lot.m2,
      roadSegments: readySegments,
    })

    return updated ? ('updated' as const) : ('skipped' as const)
  })

  const outcomes = await Promise.all(updatePromises)
  result.lotsUpdated = outcomes.filter((outcome) => outcome === 'updated').length
  result.lotsSkipped = outcomes.filter((outcome) => outcome === 'skipped').length

  return result
}

function buildServitudeUpdatePayload(
  result: ReturnType<typeof calculateLotServitude>,
  readySegments: PersistedRoadSegment[]
) {
  const primaryWidth = result.widthsM[0] ?? null

  return {
    servidumbre_m2: result.servidumbreM2,
    superficie_neta_m2: result.superficieNetaM2,
    servidumbre_ancho_m: primaryWidth,
    servidumbre_widths_m: result.widthsM.length > 0 ? result.widthsM : null,
    servidumbre_ancho_label: result.widthLabel,
    servidumbre_geometry: result.intersectionGeometry,
    servidumbre_sources:
      result.sourceSegmentIds.length > 0
        ? result.sourceSegmentIds.map((segmentId) => {
            const segment = readySegments.find((item) => item.id === segmentId)
            return {
              segment_id: segmentId,
              width_m: segment?.width_m ?? null,
              input_mode: segment?.input_mode ?? null,
              name: segment?.name ?? null,
            }
          })
        : null,
    servidumbre_calculation_status: result.status,
    servidumbre_calculated_at: new Date().toISOString(),
    servidumbre_calculation_version: SERVIDUMBRE_CALCULATION_VERSION,
  }
}

async function loadReadyProjectRoadSegments(
  supabase: SupabaseClient,
  projectId: string
): Promise<PersistedRoadSegment[]> {
  const { data, error } = await supabase
    .from('project_road_segments')
    .select(
      `
      id,
      name,
      input_geometry,
      input_mode,
      width_m,
      edge_side,
      footprint_geometry,
      status
    `
    )
    .eq('project_id', projectId)
    .eq('status', 'ready')

  if (error) {
    console.error('[Servidumbre] ERROR al leer project_road_segments:', error)
    return []
  }

  if (!data || data.length === 0) {
    return []
  }

  return normalizePersistedRoadSegments(
    data as Array<PersistedRoadSegment & { footprint_geometry?: GeoJSONGeometry | null }>
  )
}

function normalizePersistedRoadSegments(
  segments: Array<PersistedRoadSegment & { footprint_geometry?: GeoJSONGeometry | null }>
): PersistedRoadSegment[] {
  return segments.map((segment) => ({
    id: segment.id,
    name: segment.name,
    input_geometry: segment.footprint_geometry ?? segment.input_geometry,
    input_mode: segment.footprint_geometry ? 'footprint' : segment.input_mode,
    width_m: segment.width_m,
    edge_side: segment.edge_side,
    status: segment.status,
  }))
}

async function loadLotGeometriesById(
  supabase: SupabaseClient,
  geometryIds: string[]
): Promise<Map<string, GeoJSONGeometry>> {
  if (geometryIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('geometries')
    .select('id, geometry')
    .in('id', geometryIds)

  if (error) {
    console.error('[Servidumbre] ERROR al obtener geometrías de lotes:', error)
    return new Map()
  }

  const geometries = new Map<string, GeoJSONGeometry>()

  for (const row of (data || []) as Array<{ id: string; geometry?: unknown }>) {
    if (isGeoJSONGeometry(row.geometry)) {
      geometries.set(row.id, row.geometry)
    }
  }

  return geometries
}

function isGeoJSONGeometry(geometry: unknown): geometry is GeoJSONGeometry {
  if (!geometry || typeof geometry !== 'object' || !('type' in geometry)) {
    return false
  }

  return true
}

function inferRoadInputMode(payload: SaveInfrastructurePayload): RoadSegmentInput['mode'] {
  if (payload.inputMode) return payload.inputMode

  return payload.geometry.type === 'Polygon' || payload.geometry.type === 'MultiPolygon'
    ? 'footprint'
    : 'centerline'
}

async function loadProjectRoadSegmentsForCalculation(
  supabase: SupabaseClient,
  projectId: string
): Promise<PersistedRoadSegment[]> {
  const { data: readySegments, error: segmentError } = await supabase
    .from('project_road_segments')
    .select(
      `
      id,
      name,
      input_geometry,
      input_mode,
      width_m,
      edge_side,
      footprint_geometry,
      status
    `
    )
    .eq('project_id', projectId)
    .eq('status', 'ready')

  if (segmentError) {
    console.error('[Servidumbre] ERROR al leer project_road_segments:', segmentError)
  }

  if (readySegments && readySegments.length > 0) {
    return normalizePersistedRoadSegments(
      readySegments as Array<PersistedRoadSegment & { footprint_geometry?: GeoJSONGeometry | null }>
    )
  }

  return []
}

export async function recalculateProjectServidumbres(
  projectId: string,
  supabaseClient?: SupabaseClient
): Promise<RecalculateProjectServidumbresResult> {
  const supabase = supabaseClient || (await createClient())
  const roadSegments = await loadProjectRoadSegmentsForCalculation(supabase, projectId)

  return recalculateLotsFromRoadSegments(supabase, {
    projectId,
    roadSegments,
  })
}

export async function getLotsByProject(
  projectId: string,
  supabaseClient?: SupabaseClient
): Promise<Lot[]> {
  const supabase = supabaseClient || (await createClient())

  const { data, error } = await supabase
    .from('lots')
    .select('*')
    .eq('project_id', projectId)
    .order('numero_lote', { ascending: true })

  if (error) {
    console.error('Error fetching lots:', error)
    throw new Error('Error al obtener lotes')
  }

  return data || []
}

export async function getLotById(
  lotId: string,
  supabaseClient?: SupabaseClient
): Promise<LotDetails | null> {
  const supabase = supabaseClient || (await createClient())

  const { data: lot, error } = await supabase.from('lots').select('*').eq('id', lotId).single()

  if (error || !lot) {
    console.error('Error fetching lot:', error)
    return null
  }

  let etapa_proceso = null
  if (lot.estado === 'reservado' || lot.estado === 'vendido') {
    const { data: record } = await supabase
      .from('lot_records')
      .select('etapa_proceso')
      .eq('lot_id', lotId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (record) {
      etapa_proceso = record.etapa_proceso
    }
  }

  return { ...lot, etapa_proceso } as LotDetails
}

export async function updateRoadSegmentWidthAndRecalculateServidumbres(
  projectId: string,
  roadSegmentId: string,
  widthM: number,
  supabaseClient?: SupabaseClient
): Promise<RecalculateProjectServidumbresResult> {
  const supabase = supabaseClient || (await createClient())

  const { data: segment, error: segmentError } = await supabase
    .from('project_road_segments')
    .select(
      `
      id,
      input_geometry,
      input_mode,
      edge_side
    `
    )
    .eq('project_id', projectId)
    .eq('id', roadSegmentId)
    .single()

  if (segmentError || !segment) {
    console.error('[Servidumbre] ERROR al obtener project_road_segments:', segmentError)
    throw new Error('Tramo de camino no encontrado')
  }

  const normalized = normalizeRoadSegmentToFootprint({
    id: segment.id,
    geometry: segment.input_geometry as GeoJSONGeometry,
    mode: segment.input_mode,
    widthM,
    edgeSide: segment.edge_side ?? undefined,
  })

  const { error: updateError } = await supabase
    .from('project_road_segments')
    .update({
      width_m: widthM,
      footprint_geometry: normalized.geometry?.geometry ?? null,
      status: normalized.status,
      updated_at: new Date().toISOString(),
    })
    .eq('project_id', projectId)
    .eq('id', roadSegmentId)

  if (updateError) {
    console.error('[Servidumbre] ERROR al actualizar ancho de project_road_segments:', updateError)
    throw new Error('Error al actualizar el ancho del tramo de camino')
  }

  return recalculateProjectServidumbres(projectId, supabase)
}

export async function updateLot(
  lotId: string,
  updates: Partial<Lot>,
  supabaseClient?: SupabaseClient
): Promise<Lot> {
  const supabase = supabaseClient || (await createClient())

  const { data, error } = await supabase
    .from('lots')
    .update(updates)
    .eq('id', lotId)
    .select()
    .single()

  if (error) {
    console.error('Error updating lot:', error)
    throw new Error('Error al actualizar lote')
  }

  return data
}

export async function getGeometriesByProject(
  projectId: string,
  unassignedOnly = false,
  supabaseClient?: SupabaseClient
): Promise<Geometry[]> {
  const supabase = supabaseClient || (await createClient())

  let query = supabase.from('geometries').select('*').eq('project_id', projectId)

  if (unassignedOnly) {
    query = query.is('lot_id', null)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching geometries:', error)
    throw new Error('Error al obtener geometrías')
  }

  return data || []
}

export async function saveAndAssignGeometry(
  payload: SaveAndAssignGeometryPayload,
  supabaseClient?: SupabaseClient
): Promise<Geometry> {
  const supabase = supabaseClient || (await createClient())

  // Verificar que el lote no tenga geometría asignada
  const { data: existingLot, error: lotError } = await supabase
    .from('lots')
    .select('geometry_id')
    .eq('id', payload.lotId)
    .single()

  if (lotError) {
    throw new Error('Lote no encontrado')
  }

  if (existingLot.geometry_id) {
    throw new Error('El lote ya tiene una geometría asignada')
  }

  // Crear geometría
  const { data: geometry, error: geomError } = await supabase
    .from('geometries')
    .insert({
      project_id: payload.projectId,
      lot_id: payload.lotId,
      geometry_type: payload.geometryType,
      source_type: payload.sourceType,
      geometry: payload.geometry,
      properties: payload.properties,
      is_assigned: true, // <-- Flag para nueva arquitectura
    })
    .select()
    .single()

  if (geomError) {
    console.error('Error creating geometry:', geomError)
    throw new Error('Error al crear geometría')
  }

  // Calcular m2 desde la geometría asignada
  const m2 = computeM2FromGeoJSON(payload.geometry)

  // Actualizar lote con geometry_id y m2 calculado
  const { error: updateError } = await supabase
    .from('lots')
    .update({ geometry_id: geometry.id, ...(m2 !== null && { m2 }) })
    .eq('id', payload.lotId)

  if (updateError) {
    console.error('Error updating lot:', updateError)
    // Rollback: eliminar geometría
    await supabase.from('geometries').delete().eq('id', geometry.id)
    throw new Error('Error al asignar geometría al lote')
  }

  await recalculateLotServidumbreOnAssign(supabase, {
    projectId: payload.projectId,
    lotId: payload.lotId,
    lotGeometry: payload.geometry,
    lotM2: m2,
  })

  return geometry
}

export async function saveInfrastructure(
  payload: SaveInfrastructurePayload,
  supabaseClient?: SupabaseClient
): Promise<Geometry> {
  const supabase = supabaseClient || (await createClient())

  const { data, error } = await supabase
    .from('geometries')
    .insert({
      project_id: payload.projectId,
      lot_id: null, // Infraestructura no tiene lote
      geometry_type: payload.geometryType,
      source_type: payload.sourceType,
      geometry: payload.geometry,
      properties: payload.properties,
      name: payload.name,
      is_assigned: true, // <-- Flag para nueva arquitectura
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving infrastructure:', error)
    throw new Error('Error al guardar infraestructura')
  }

  // Si es un camino (road), persistir su tramo canónico y recalcular servidumbres.
  if (payload.geometryType === 'road') {
    try {
      const inputMode = inferRoadInputMode(payload)
      const widthM = payload.widthM ?? 6
      const normalized = normalizeRoadSegmentToFootprint({
        id: data.id,
        geometry: payload.geometry,
        mode: inputMode,
        widthM,
        edgeSide: payload.edgeSide,
      })
      const segmentPayload = {
        project_id: payload.projectId,
        geometry_id: data.id,
        name: payload.name,
        input_geometry: payload.geometry,
        input_mode: inputMode,
        width_m: widthM,
        edge_side: payload.edgeSide ?? null,
        footprint_geometry: normalized.geometry?.geometry ?? null,
        source_type: payload.sourceType,
        status: normalized.status,
      }

      const { data: roadSegment, error: roadSegmentError } = await supabase
        .from('project_road_segments')
        .insert(segmentPayload)
        .select()
        .single()

      if (roadSegmentError) {
        console.error('[Servidumbre] ERROR al guardar project_road_segments:', roadSegmentError)
      }

      if (roadSegment) {
        const segmentForCalculation: PersistedRoadSegment = {
          id: roadSegment.id,
          name: roadSegment.name,
          input_geometry:
            (roadSegment.footprint_geometry as GeoJSONGeometry | null) ??
            (roadSegment.input_geometry as GeoJSONGeometry),
          input_mode: roadSegment.footprint_geometry ? 'footprint' : roadSegment.input_mode,
          width_m: roadSegment.width_m,
          edge_side: roadSegment.edge_side,
          status: roadSegment.status,
        }
        const readyRoadSegments = await loadReadyProjectRoadSegments(supabase, payload.projectId)

        await recalculateLotsFromRoadSegments(supabase, {
          projectId: payload.projectId,
          roadSegments: readyRoadSegments.length > 0 ? readyRoadSegments : [segmentForCalculation],
        })
      }
    } catch (infraError) {
      console.error('Error procesando servidumbres en saveInfrastructure:', infraError)
      // No lanzamos error para no romper la inserción inicial, pero logueamos
    }
  }

  return data
}

export async function assignGeometry(
  payload: AssignGeometryPayload,
  supabaseClient?: SupabaseClient
): Promise<Geometry> {
  const supabase = supabaseClient || (await createClient())

  // Verificar que geometría y lote existan
  const { data: geometry, error: geomError } = await supabase
    .from('geometries')
    .select('project_id')
    .eq('id', payload.geometryId)
    .single()

  if (geomError || !geometry) {
    throw new Error('Geometría no encontrada')
  }

  const { data: lot, error: lotError } = await supabase
    .from('lots')
    .select('project_id, geometry_id')
    .eq('id', payload.lotId)
    .single()

  if (lotError || !lot) {
    throw new Error('Lote no encontrado')
  }

  if (geometry.project_id !== lot.project_id) {
    throw new Error('Geometría y lote pertenecen a proyectos diferentes')
  }

  if (lot.geometry_id) {
    throw new Error('El lote ya tiene una geometría asignada')
  }

  // Asignar geometría a lote
  const { data: updatedGeometry, error: updateGeomError } = await supabase
    .from('geometries')
    .update({ lot_id: payload.lotId })
    .eq('id', payload.geometryId)
    .select()
    .single()

  if (updateGeomError) {
    throw new Error('Error al asignar geometría')
  }

  // Calcular m2 desde la geometría asignada
  const m2 = computeM2FromGeoJSON(updatedGeometry.geometry)

  // Actualizar lote con geometry_id y m2 calculado
  await supabase
    .from('lots')
    .update({ geometry_id: payload.geometryId, ...(m2 !== null && { m2 }) })
    .eq('id', payload.lotId)

  await recalculateLotServidumbreOnAssign(supabase, {
    projectId: lot.project_id,
    lotId: payload.lotId,
    lotGeometry: updatedGeometry.geometry,
    lotM2: m2,
  })

  return updatedGeometry
}

/**
 * Elimina la geometría asignada a un lote y desvincula el lote.
 * Permite corregir asignaciones incorrectas durante el onboarding.
 */
export async function deleteGeometryByLotId(
  lotId: string,
  supabaseClient?: SupabaseClient
): Promise<void> {
  const supabase = supabaseClient || (await createClient())

  // Obtener geometry_id del lote
  const { data: lot, error: lotError } = await supabase
    .from('lots')
    .select('geometry_id')
    .eq('id', lotId)
    .single()

  if (lotError || !lot) {
    throw new Error('Lote no encontrado')
  }

  if (!lot.geometry_id) {
    throw new Error('El lote no tiene geometría asignada')
  }

  const geometryId = lot.geometry_id

  // Desvincular el lote primero (quitar geometry_id y limpiar m2)
  const { error: unlinkError } = await supabase
    .from('lots')
    .update({ geometry_id: null, m2: null })
    .eq('id', lotId)

  if (unlinkError) {
    throw new Error('Error al desvincular geometría del lote')
  }

  // Eliminar la geometría de la base de datos
  const { error: deleteError } = await supabase.from('geometries').delete().eq('id', geometryId)

  if (deleteError) {
    // Rollback: restaurar geometry_id en el lote
    await supabase.from('lots').update({ geometry_id: geometryId }).eq('id', lotId)
    throw new Error('Error al eliminar geometría')
  }
}
