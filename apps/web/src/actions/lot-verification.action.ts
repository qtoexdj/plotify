'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  officialOverrideSchema,
  markVerifiedSchema,
  type OfficialOverrideInput,
  type MarkVerifiedInput,
} from '@/lib/validations/lot-verification.schema'
import { logger } from '@/lib/logger'
import { validateLotDocumentReadiness, type MinimalBoundary } from '@/lib/legal/readiness'
import type { VerifiedStatus } from '@/types/database.types'

interface NonReadyLotDetail {
  numero_lote: string
  errors: string[]
}

interface ActionResult {
  success: boolean
  message?: string
  error?: string
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
    boundaries_official,
  } = validation.data

  // 2. Check permissions
  const { allowed, userId } = await checkUserPermissions(supabase, projectId)
  if (!allowed) {
    return { success: false, error: 'No tienes permisos para realizar esta acción' }
  }

  try {
    // 3. Get current lot for audit diff
    const { data: currentLot, error: fetchError } = await supabase
      .from('lots')
      .select(
        'area_official_m2, perimeter_official_m, boundaries_official, verified_status, servidumbre_m2, servidumbre_ancho_m'
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
    if (servidumbre_ancho_m !== undefined) updatePayload.servidumbre_ancho_m = servidumbre_ancho_m

    if (boundaries_official !== undefined) updatePayload.boundaries_official = boundaries_official

    // If status was verified and data changes, revert to draft
    if (currentLot.verified_status !== 'draft') {
      updatePayload.verified_status = 'draft'
      updatePayload.verified_at = null
      updatePayload.verified_by = null
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
        },
        next: {
          area_official_m2: area_official_m2 ?? currentLot.area_official_m2,
          boundaries_official: boundaries_official ?? currentLot.boundaries_official,
        },
      },
    })

    revalidatePath(`/proyectos/${projectId}`)
    return { success: true, message: 'Valores oficiales guardados correctamente' }
  } catch (err) {
    logger.error({ lotId, error: err }, 'save_official_override_error')
    return { success: false, error: 'Error del servidor' }
  }
}

// ─── Mark Lot as Verified ───────────────────────────────────────────────────

export async function markLotVerified(input: MarkVerifiedInput): Promise<ActionResult> {
  const supabase = await createClient()

  // 1. Validate input
  const validation = markVerifiedSchema.safeParse(input)
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message }
  }

  const {
    projectId,
    lotId,
    verified_status,
    area_official_m2,
    perimeter_official_m,
    boundaries_official,
    calculated_snapshot,
  } = validation.data

  // 2. Check permissions
  const { allowed, userId } = await checkUserPermissions(supabase, projectId)
  if (!allowed) {
    return { success: false, error: 'No tienes permisos para verificar este lote' }
  }

  try {
    // 3. Verify lot exists and get current state
    const { data: currentLot, error: fetchError } = await supabase
      .from('lots')
      .select('area_official_m2, perimeter_official_m, boundaries_official, verified_status, m2')
      .eq('id', lotId)
      .single()

    if (fetchError || !currentLot) {
      return { success: false, error: 'Lote no encontrado' }
    }

    // 4. Ensure official data is saved first
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

    const { error: updateError } = await supabase.from('lots').update(updatePayload).eq('id', lotId)

    if (updateError) {
      logger.error({ lotId, error: updateError }, 'mark_lot_verified_failed')
      return { success: false, error: 'Error al verificar lote' }
    }

    // 5. Audit log with calculated snapshot
    await supabase.from('audit_logs').insert({
      actor: userId,
      action: 'VERIFY',
      entity: 'lots',
      entity_id: lotId,
      payload: {
        type: 'lot_verified',
        verified_status,
        official: {
          area_official_m2,
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

    revalidatePath(`/proyectos/${projectId}`)
    return {
      success: true,
      message:
        verified_status === 'verified_exact'
          ? 'Lote verificado (coincide con calculado)'
          : 'Lote verificado con valores oficiales de plano',
    }
  } catch (err) {
    logger.error({ lotId, error: err }, 'mark_lot_verified_error')
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

    // 5. Update project status to operational
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        estado: 'operational',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    if (updateError) {
      logger.error({ projectId, error: updateError }, 'make_project_operational_failed')
      return { success: false, error: 'Error al actualizar el estado del proyecto' }
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
