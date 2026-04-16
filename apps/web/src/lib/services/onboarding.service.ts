import { createClient } from '@/lib/supabase/server'
import type { Lot, Geometry } from '@/types/database.types'
import type { LotDetails } from '@/types/viewer.types'
import type {
  SaveAndAssignGeometryPayload,
  SaveInfrastructurePayload,
  AssignGeometryPayload,
} from '@/types/onboarding.types'
import { computeM2FromGeoJSON } from '@/lib/geometry/compute-m2'
import { combineLineStrings } from '@/lib/geometry/utils'
import { calculateServidumbre } from '@/lib/geometry/servidumbre'

export async function getLotsByProject(projectId: string): Promise<Lot[]> {
  const supabase = await createClient()

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

export async function getLotById(lotId: string): Promise<LotDetails | null> {
  const supabase = await createClient()

  const { data: lot, error } = await supabase
    .from('lots')
    .select('*')
    .eq('id', lotId)
    .single()

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

export async function updateLot(
  lotId: string,
  updates: Partial<Lot>
): Promise<Lot> {
  const supabase = await createClient()

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
  unassignedOnly = false
): Promise<Geometry[]> {
  const supabase = await createClient()

  let query = supabase
    .from('geometries')
    .select('*')
    .eq('project_id', projectId)

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
  payload: SaveAndAssignGeometryPayload
): Promise<Geometry> {
  const supabase = await createClient()

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

  return geometry
}

export async function saveInfrastructure(
  payload: SaveInfrastructurePayload
): Promise<Geometry> {
  const supabase = await createClient()

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

  // Si es un camino (road), actualizar el roadmap unificado del proyecto y recálculo de servidumbres
  if (payload.geometryType === 'road') {
    try {
      // 1. Obtener todos los caminos asignados al proyecto
      const { data: assignedRoads } = await supabase
        .from('geometries')
        .select('geometry')
        .eq('project_id', payload.projectId)
        .eq('geometry_type', 'road')
        .eq('is_assigned', true)

      if (assignedRoads && assignedRoads.length > 0) {
        // 2. Combinarlos en un solo MultiLineString
        const combinedRoad = combineLineStrings(assignedRoads.map((r) => r.geometry))

        // 3. Obtener el ancho del camino configurado en el proyecto
        const { data: project } = await supabase
          .from('projects')
          .select('road_width_m')
          .eq('id', payload.projectId)
          .single()

        const roadWidth = project?.road_width_m || 6 // Fallback a 6m

        // 4. Guardar camino unificado en projects
        console.log('[Servidumbre] Guardando camino combinado en projects:', Object.keys(combinedRoad))
        const { error: projUpdateErr } = await supabase
          .from('projects')
          .update({ road_geometry: combinedRoad })
          .eq('id', payload.projectId)

        if (projUpdateErr) {
          console.error('[Servidumbre] ERROR al actualizar projects:', projUpdateErr)
        }

        // 5. Recalcular servidumbres para todos los lotes asignados del proyecto
        // Hacemos join con geometries para obtener la geometría del lote
        const { data: assignedLots, error: lotsErr } = await supabase
          .from('lots')
          .select(`
            id,
            m2,
            geometry_id,
            geometries:geometries!lots_geometry_id_fkey (
              geometry
            )
          `)
          .eq('project_id', payload.projectId)
          .not('geometry_id', 'is', null)

        if (lotsErr) {
          console.error('[Servidumbre] ERROR al obtener assignedLots:', lotsErr)
        }

        if (assignedLots) {
          console.log(`[Servidumbre] Encontrados ${assignedLots.length} lotes asignados para calcular`)
          // Procesar las actualizaciones en paralelo para mejor rendimiento
          const updatePromises = assignedLots.map(async (lot) => {
            const lotGeom = Array.isArray(lot.geometries)
              ? lot.geometries[0]?.geometry
              : (lot.geometries as unknown as { geometry: unknown })?.geometry

            if (!lotGeom) {
              console.warn(`[Servidumbre] Lote ${lot.id} omitido por no tener geometry`)
              return
            }

            const calc = calculateServidumbre(lotGeom, combinedRoad, roadWidth)
            const superficieNeta = lot.m2 ? lot.m2 - calc.servidumbreM2 : null

            console.log(`[Servidumbre] Lote ${lot.id} => Servidumbre: ${calc.servidumbreM2}, Neta: ${superficieNeta}`)

            const { error: lotUpdateErr } = await supabase
              .from('lots')
              .update({
                servidumbre_m2: calc.servidumbreM2,
                superficie_neta_m2: superficieNeta
              })
              .eq('id', lot.id)

            if (lotUpdateErr) {
              console.error(`[Servidumbre] ERROR al actualizar lote ${lot.id}:`, lotUpdateErr)
            }
          })

          await Promise.all(updatePromises)
          console.log('[Servidumbre] Finalizado actualización de lotes')
        }
      }
    } catch (infraError) {
      console.error('Error procesando servidumbres en saveInfrastructure:', infraError)
      // No lanzamos error para no romper la inserción inicial, pero logueamos
    }
  }

  return data
}

export async function assignGeometry(payload: AssignGeometryPayload): Promise<Geometry> {
  const supabase = await createClient()

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

  return updatedGeometry
}

/**
 * Elimina la geometría asignada a un lote y desvincula el lote.
 * Permite corregir asignaciones incorrectas durante el onboarding.
 */
export async function deleteGeometryByLotId(lotId: string): Promise<void> {
  const supabase = await createClient()

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
  const { error: deleteError } = await supabase
    .from('geometries')
    .delete()
    .eq('id', geometryId)

  if (deleteError) {
    // Rollback: restaurar geometry_id en el lote
    await supabase.from('lots').update({ geometry_id: geometryId }).eq('id', lotId)
    throw new Error('Error al eliminar geometría')
  }
}
