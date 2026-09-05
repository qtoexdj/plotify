'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  officialOverrideSchema,
  saveAndVerifySchema,
  type OfficialOverrideInput,
  type SaveAndVerifyInput,
} from '@/lib/validations/lot-verification.schema'
import { logger } from '@/lib/logger'
import { validateLotDocumentReadiness, type MinimalBoundary } from '@/lib/legal/readiness'
import type { ServidumbreSource, VerifiedStatus } from '@/types/database.types'
import { updateRoadSegmentWidthAndRecalculateServidumbres } from '@/lib/services/onboarding.service'

interface NonReadyLotDetail {
  numero_lote: string
  errors: string[]
}

interface ActionResult {
  success: boolean
  message?: string
  error?: string
}

function isCanonicalRoadSegmentId(segmentId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    segmentId
  )
}

/**
 * Etiqueta del ancho tal como la lee el puente a la escritura
 * (`servidumbre.ancho_label`). Sin ella la minuta se quedaría sin el ancho.
 */
function formatOfficialServitudeWidth(widthM: number | undefined): string | null {
  if (widthM === undefined || !Number.isFinite(widthM) || widthM <= 0) return null
  const rounded = Number.isInteger(widthM) ? widthM.toString() : widthM.toFixed(2)
  return `${rounded} m`
}

function getCanonicalRoadSegmentWidthTarget(
  sources: ServidumbreSource[] | null | undefined,
  requestedSegmentId?: string
) {
  if (!Array.isArray(sources)) return null

  const sourceSegmentIds = sources
    .map((source) => source.segment_id)
    .filter(
      (segmentId): segmentId is string => Boolean(segmentId) && isCanonicalRoadSegmentId(segmentId)
    )

  if (requestedSegmentId) {
    const source = sources.find((item) => item.segment_id === requestedSegmentId)
    return source && isCanonicalRoadSegmentId(requestedSegmentId)
      ? { segmentId: requestedSegmentId, currentWidthM: source.width_m ?? null }
      : null
  }

  const uniqueSegmentIds = Array.from(new Set(sourceSegmentIds))

  if (uniqueSegmentIds.length !== 1) {
    return null
  }

  const source = sources.find((item) => item.segment_id === uniqueSegmentIds[0])
  return {
    segmentId: uniqueSegmentIds[0],
    currentWidthM: source?.width_m ?? null,
  }
}

function hasWidthChanged(widthM: number | undefined, currentWidthM: number | null) {
  if (widthM === undefined) return false
  return currentWidthM == null || widthM !== currentWidthM
}

function resolveWidthTarget(
  sources: ServidumbreSource[] | null | undefined,
  widthM: number | undefined,
  requestedSegmentId?: string
) {
  if (widthM === undefined) {
    return { widthChanged: false, target: null }
  }

  const target = getCanonicalRoadSegmentWidthTarget(sources, requestedSegmentId)
  return {
    widthChanged: hasWidthChanged(widthM, target?.currentWidthM ?? null),
    target,
  }
}

function getWidthAuditValue(
  sources: ServidumbreSource[] | null | undefined,
  requestedSegmentId: string | undefined,
  fallbackWidth: number | null
) {
  if (!requestedSegmentId) return fallbackWidth

  return (
    sources?.find((source) => source.segment_id === requestedSegmentId)?.width_m ?? fallbackWidth
  )
}

async function recalculateServidumbresAfterCanonicalWidthChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  roadSegmentId: string,
  widthM: number | undefined
): Promise<ActionResult | null> {
  if (widthM === undefined) return null

  try {
    await updateRoadSegmentWidthAndRecalculateServidumbres(
      projectId,
      roadSegmentId,
      widthM,
      supabase
    )
    return null
  } catch (error) {
    logger.error(
      { projectId, roadSegmentId, widthM, error },
      'recalculate_servidumbres_after_width_change_failed'
    )
    return { success: false, error: 'Error al recalcular servidumbres con el nuevo ancho' }
  }
}

// ─── Permissions Helper ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkUserPermissions(supabase: any, projectId: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { allowed: false, userId: null as string | null }

  const { data, error } = await supabase.from('projects').select('id').eq('id', projectId).single()

  if (error || !data) return { allowed: false, userId: user.id }
  return { allowed: true, userId: user.id }
}

/**
 * La verificación legal (deslindes, superficie, servidumbre) es tarea de
 * administrador: RLS permite a un vendedor asignado hacer UPDATE en `lots`
 * (para reservar/gestionar su venta), así que `checkUserPermissions` (que
 * solo confirma acceso de lectura al proyecto) no alcanza para bloquear a un
 * vendedor de editar deslindes oficiales. Se usan las RPCs `is_project_admin`
 * / `is_super_admin` (las mismas que usan las RLS policies de `lots_update`)
 * para exigir rol de administrador aquí en el servidor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAdminPermissions(supabase: any, projectId: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { allowed: false, userId: null as string | null }

  const [{ data: isProjectAdmin }, { data: isSuperAdmin }] = await Promise.all([
    supabase.rpc('is_project_admin', { target_project_id: projectId }),
    supabase.rpc('is_super_admin'),
  ])

  return { allowed: Boolean(isProjectAdmin || isSuperAdmin), userId: user.id }
}

// ─── Save Official Override ─────────────────────────────────────────────────

export async function saveOfficialOverride(
  input: Omit<OfficialOverrideInput, 'projectId' | 'lotId'> & { projectId: string; lotId: string }
): Promise<ActionResult> {
  const supabase = await createClient()

  // 1. Validate input
  const validation = officialOverrideSchema.safeParse(input)
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message }
  }

  const {
    projectId,
    lotId,
    area_official_m2,
    perimeter_official_m,
    servidumbre_m2,
    servidumbre_ancho_m,
    servidumbre_road_segment_id,
    boundaries_official,
  } = validation.data

  // 2. Check permissions (solo administradores editan datos legales)
  const { allowed, userId } = await checkAdminPermissions(supabase, projectId)
  if (!allowed) {
    return {
      success: false,
      error: 'Solo un administrador puede editar los datos legales del lote',
    }
  }

  try {
    // 3. Get current lot for audit diff
    const { data: currentLot, error: fetchError } = await supabase
      .from('lots')
      .select(
        'area_official_m2, perimeter_official_m, boundaries_official, verified_status, servidumbre_m2, servidumbre_ancho_m, servidumbre_sources'
      )
      .eq('id', lotId)
      .single()

    if (fetchError || !currentLot) {
      return { success: false, error: 'Lote no encontrado' }
    }

    // 4. Build update payload (only non-undefined values)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    if (area_official_m2 !== undefined) updatePayload.area_official_m2 = area_official_m2
    if (perimeter_official_m !== undefined)
      updatePayload.perimeter_official_m = perimeter_official_m
    if (servidumbre_m2 !== undefined) updatePayload.servidumbre_m2 = servidumbre_m2

    if (boundaries_official !== undefined) updatePayload.boundaries_official = boundaries_official

    // Solo revertir a draft si algún valor oficial realmente cambió respecto
    // a lo ya guardado; re-guardar los mismos valores no debe desverificar
    // el lote (antes esto pasaba siempre, incluso sin cambios).
    const currentSources = currentLot.servidumbre_sources as ServidumbreSource[] | null
    const currentWidthForAudit = getWidthAuditValue(
      currentSources,
      servidumbre_road_segment_id,
      currentLot.servidumbre_ancho_m
    )
    const { widthChanged, target: widthTarget } = resolveWidthTarget(
      currentSources,
      servidumbre_ancho_m,
      servidumbre_road_segment_id
    )

    const officialDataChanged =
      (area_official_m2 !== undefined && area_official_m2 !== currentLot.area_official_m2) ||
      (perimeter_official_m !== undefined &&
        perimeter_official_m !== currentLot.perimeter_official_m) ||
      (servidumbre_m2 !== undefined && servidumbre_m2 !== currentLot.servidumbre_m2) ||
      widthChanged ||
      (boundaries_official !== undefined &&
        JSON.stringify(boundaries_official) !== JSON.stringify(currentLot.boundaries_official))

    if (currentLot.verified_status !== 'draft' && officialDataChanged) {
      updatePayload.verified_status = 'draft'
      updatePayload.verified_at = null
      updatePayload.verified_by = null
    }

    // Con un tramo canónico el ancho sigue siendo derivado: editarlo recalcula la
    // geometría. Sin tramo no hay nada que recalcular, pero la escritura igual
    // necesita el ancho, y manda el plano oficial: se guarda como valor oficial.
    const hasCanonicalSource = Array.isArray(currentSources) && currentSources.length > 0
    if (widthChanged && !widthTarget) {
      if (hasCanonicalSource) {
        return {
          success: false,
          error: 'El ancho se edita desde el tramo de camino correspondiente',
        }
      }
      updatePayload.servidumbre_ancho_m = servidumbre_ancho_m
      updatePayload.servidumbre_ancho_label = formatOfficialServitudeWidth(servidumbre_ancho_m)
    }

    // 5. Update lot
    const { error: updateError } = await supabase.from('lots').update(updatePayload).eq('id', lotId)

    if (updateError) {
      logger.error({ lotId, error: updateError }, 'update_official_values_failed')
      return { success: false, error: 'Error al guardar valores oficiales' }
    }

    // 6. Audit log
    await supabase.from('audit_logs').insert({
      actor: userId,
      action: 'UPDATE',
      entity: 'lots',
      entity_id: lotId,
      payload: {
        type: 'official_override',
        prev: {
          area_official_m2: currentLot.area_official_m2,
          perimeter_official_m: currentLot.perimeter_official_m,
          boundaries_official: currentLot.boundaries_official,
          servidumbre_m2: currentLot.servidumbre_m2,
          servidumbre_ancho_m: currentWidthForAudit,
        },
        next: {
          area_official_m2: area_official_m2 ?? currentLot.area_official_m2,
          perimeter_official_m: perimeter_official_m ?? currentLot.perimeter_official_m,
          servidumbre_m2: servidumbre_m2 ?? currentLot.servidumbre_m2,
          servidumbre_ancho_m: servidumbre_ancho_m ?? currentWidthForAudit,
          boundaries_official: boundaries_official ?? currentLot.boundaries_official,
          servidumbre_road_segment_id,
        },
      },
    })

    if (widthChanged && widthTarget) {
      const recalculateError = await recalculateServidumbresAfterCanonicalWidthChange(
        supabase,
        projectId,
        widthTarget.segmentId,
        servidumbre_ancho_m
      )
      if (recalculateError) return recalculateError
    }

    revalidatePath(`/proyectos/${projectId}`)
    return {
      success: true,
      message: widthChanged
        ? 'Ancho actualizado y servidumbres recalculadas correctamente'
        : 'Valores oficiales guardados correctamente',
    }
  } catch (err) {
    logger.error({ lotId, error: err }, 'save_official_override_error')
    return { success: false, error: 'Error del servidor' }
  }
}

// ─── Save + Verify Lot (unified) ────────────────────────────────────────────

/**
 * Reemplaza el par Guardar/Verificar: persiste todos los valores oficiales
 * (incluida servidumbre y su ancho, que antes solo guardaba el botón
 * "Guardar") y marca el lote como verificado en una sola escritura atómica.
 * Evita el catch-22 anterior donde verificar no guardaba servidumbre y
 * guardar después revertía la verificación.
 */
export async function saveAndVerifyLot(input: SaveAndVerifyInput): Promise<ActionResult> {
  const supabase = await createClient()

  // 1. Validate input
  const validation = saveAndVerifySchema.safeParse(input)
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message }
  }

  const {
    projectId,
    lotId,
    verified_status,
    area_official_m2,
    perimeter_official_m,
    servidumbre_m2,
    servidumbre_ancho_m,
    servidumbre_road_segment_id,
    boundaries_official,
    calculated_snapshot,
  } = validation.data

  // 2. Check permissions (solo administradores verifican datos legales)
  const { allowed, userId } = await checkAdminPermissions(supabase, projectId)
  if (!allowed) {
    return { success: false, error: 'Solo un administrador puede verificar este lote' }
  }

  try {
    // 3. Verify lot exists and get current state
    const { data: currentLot, error: fetchError } = await supabase
      .from('lots')
      .select(
        'area_official_m2, perimeter_official_m, boundaries_official, verified_status, m2, servidumbre_ancho_m, servidumbre_sources'
      )
      .eq('id', lotId)
      .single()

    if (fetchError || !currentLot) {
      return { success: false, error: 'Lote no encontrado' }
    }

    const { widthChanged, target: widthTarget } = resolveWidthTarget(
      currentLot.servidumbre_sources as ServidumbreSource[] | null,
      servidumbre_ancho_m,
      servidumbre_road_segment_id
    )

    if (widthChanged && !widthTarget) {
      return {
        success: false,
        error: 'El ancho se edita desde un tramo de camino canónico',
      }
    }

    // 4. Save official data + servidumbre + verification in one write
    const now = new Date().toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: Record<string, any> = {
      area_official_m2,
      perimeter_official_m,
      boundaries_official,
      verified_status,
      verified_at: now,
      verified_by: userId,
      updated_at: now,
      // Sync commercial area with official area on verification
      m2: area_official_m2,
    }
    if (servidumbre_m2 !== undefined) updatePayload.servidumbre_m2 = servidumbre_m2

    const { error: updateError } = await supabase.from('lots').update(updatePayload).eq('id', lotId)

    if (updateError) {
      logger.error({ lotId, error: updateError }, 'save_and_verify_lot_failed')
      return { success: false, error: 'Error al verificar lote' }
    }

    // 5. Audit log with calculated snapshot
    await supabase.from('audit_logs').insert({
      actor: userId,
      action: 'VERIFY',
      entity: 'lots',
      entity_id: lotId,
      payload: {
        type: 'lot_saved_and_verified',
        verified_status,
        official: {
          area_official_m2,
          perimeter_official_m,
          servidumbre_m2,
          servidumbre_ancho_m,
          servidumbre_road_segment_id,
          boundaries_official,
        },
        calculated_snapshot: calculated_snapshot ?? {
          area_m2: currentLot.m2,
          perimeter_m: null,
        },
        prev_status: currentLot.verified_status,
        verified_at: now,
      },
    })

    if (widthChanged && widthTarget) {
      const recalculateError = await recalculateServidumbresAfterCanonicalWidthChange(
        supabase,
        projectId,
        widthTarget.segmentId,
        servidumbre_ancho_m
      )
      if (recalculateError) return recalculateError
    }

    revalidatePath(`/proyectos/${projectId}`)
    return {
      success: true,
      message:
        verified_status === 'verified_exact'
          ? 'Lote guardado y verificado (coincide con calculado)'
          : 'Lote guardado y verificado con valores oficiales de plano',
    }
  } catch (err) {
    logger.error({ lotId, error: err }, 'save_and_verify_lot_error')
    return { success: false, error: 'Error del servidor' }
  }
}

// ─── Make Project Operational ───────────────────────────────────────────────

export async function makeProjectOperational(
  projectId: string
): Promise<ActionResult & { details?: NonReadyLotDetail[] }> {
  const supabase = await createClient()

  // 1. Check permissions
  const { allowed, userId } = await checkUserPermissions(supabase, projectId)
  if (!allowed) {
    return { success: false, error: 'No tienes permisos para realizar esta acción' }
  }

  try {
    // 2. Fetch project details and current status
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('estado, name')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return { success: false, error: 'Proyecto no encontrado' }
    }

    // 3. Fetch all lots belonging to the project
    const { data: lots, error: lotsError } = await supabase
      .from('lots')
      .select(
        'id, numero_lote, verified_status, area_official_m2, boundaries_official, perimeter_official_m'
      )
      .eq('project_id', projectId)

    if (lotsError || !lots) {
      return { success: false, error: 'Error al consultar los lotes del proyecto' }
    }

    if (lots.length === 0) {
      return {
        success: false,
        error: 'El proyecto debe contener al menos un lote para ser operacional',
      }
    }

    // 4. Validate each lot
    const nonReadyLots: { numero_lote: string; errors: string[] }[] = []
    for (const lot of lots) {
      const readiness = validateLotDocumentReadiness({
        id: lot.id,
        verified_status: lot.verified_status as VerifiedStatus,
        area_official_m2: lot.area_official_m2,
        boundaries_official: lot.boundaries_official as MinimalBoundary[] | null,
        perimeter_official_m: lot.perimeter_official_m,
      })
      if (!readiness.isReady) {
        nonReadyLots.push({
          numero_lote: lot.numero_lote,
          errors: readiness.errors,
        })
      }
    }

    if (nonReadyLots.length > 0) {
      return {
        success: false,
        error: 'Algunos lotes no cumplen con los requisitos mínimos de verificación y deslindes',
        details: nonReadyLots,
      }
    }

    // 5. Atomic RPC activation: activate_project_sales
    const { data: rpcResult, error: rpcError } = await supabase.rpc('activate_project_sales', {
      p_project_id: projectId,
    })

    if (rpcError || !rpcResult?.success) {
      const errorMsg =
        rpcResult?.error || rpcError?.message || 'Error al actualizar el estado del proyecto'
      logger.error({ projectId, error: rpcError || rpcResult }, 'make_project_operational_failed')
      return { success: false, error: errorMsg }
    }

    // 6. Audit log
    await supabase.from('audit_logs').insert({
      actor: userId,
      action: 'UPDATE',
      entity: 'projects',
      entity_id: projectId,
      payload: {
        type: 'project_operational',
        prev_status: project.estado,
        next_status: 'operational',
        validated_lots_count: lots.length,
      },
    })

    revalidatePath(`/projects/${projectId}`)
    revalidatePath(`/proyectos/${projectId}`)
    revalidatePath('/projects')

    return {
      success: true,
      message: `El proyecto "${project.name}" ahora está operacional y listo para ventas.`,
    }
  } catch (err) {
    logger.error({ projectId, error: err }, 'make_project_operational_error')
    return { success: false, error: 'Error del servidor' }
  }
}
