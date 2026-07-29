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
  let client_prefill = null
  if (lot.estado === 'reservado' || lot.estado === 'vendido') {
    const { data: record } = await supabase
      .from('lot_records')
      .select(
        'etapa_proceso, cliente_nombre, cliente_run, cliente_direccion, cliente_region, cliente_comuna, cliente_estado_civil, cliente_nacionalidad, cliente_ocupacion, cliente_telefono, cliente_email'
      )
      .eq('lot_id', lotId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (record) {
      etapa_proceso = record.etapa_proceso
      client_prefill = record
    }
  }

  return { ...lot, etapa_proceso, client_prefill } as LotDetails
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
  supabaseClient: SupabaseClient,
  context: { organizationId: string; actorUserId: string; operationId: string }
): Promise<Geometry> {
  const { data, error } = await supabaseClient.rpc('assign_project_geometry', {
    p_organization_id: context.organizationId,
    p_project_id: payload.projectId,
    p_lot_id: payload.lotId,
    p_geometry_id: payload.geometryId,
    p_expected_geometry_id: payload.expectedGeometryId,
    p_operation_id: context.operationId,
    p_actor_user_id: context.actorUserId,
  })
  if (error || !data) throw new Error(error?.message ?? 'LOT_GEOMETRY_CONFLICT')
  return data as unknown as Geometry
}

export async function saveInfrastructure(
  payload: SaveInfrastructurePayload,
  supabaseClient: SupabaseClient,
  context: { organizationId: string; operationId: string; sourceHash: string; configHash: string }
): Promise<Geometry> {
  const config = {
    name: payload.name ?? null,
    inputMode: payload.inputMode ?? null,
    widthM: payload.widthM ?? null,
    edgeSide: payload.edgeSide ?? null,
  }
  const { data, error } = await supabaseClient.rpc('commit_project_infrastructure', {
    p_organization_id: context.organizationId,
    p_project_id: payload.projectId,
    p_derivation_type: payload.geometryType,
    p_source_geometry_ids: payload.sourceGeometryIds,
    p_config: config,
    p_source_hash: context.sourceHash,
    p_config_hash: context.configHash,
    p_operation_id: context.operationId,
  })
  if (error || !data) throw new Error(error?.message ?? 'INFRASTRUCTURE_COMMIT_FAILED')
  return data as unknown as Geometry
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
  supabaseClient: SupabaseClient,
  context: {
    projectId: string
    organizationId: string
    actorUserId: string
    operationId: string
    expectedGeometryId: string
  }
): Promise<void> {
  const { error } = await supabaseClient.rpc('assign_project_geometry', {
    p_organization_id: context.organizationId,
    p_project_id: context.projectId,
    p_lot_id: lotId,
    p_geometry_id: null,
    p_expected_geometry_id: context.expectedGeometryId,
    p_operation_id: context.operationId,
    p_actor_user_id: context.actorUserId,
  })
  if (error) throw new Error(error.message)
}
