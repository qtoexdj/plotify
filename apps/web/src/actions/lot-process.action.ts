'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { updateStageSchema } from '@/lib/validations/process.schema'
import { lotUpdateSchema, type LotUpdateInput } from '@/lib/validations/lot-update.schema'
import type { ProcessStage } from '@/types/database.types'
import { logger } from '@/lib/logger'

interface UpdateStageResult {
  success: boolean
  message?: string
  error?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkUserPermissions(supabase: any, projectId: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return false

  // We rely on RLS policies to determine access.
  // If the user can SELECT the project, they have some relation to it
  // (Owner, Org Admin, or Assigned Vendor).
  const { data, error } = await supabase.from('projects').select('id').eq('id', projectId).single()

  if (error || !data) {
    logger.error({ projectId, userId: user.id, error }, 'permission_check_failed')
    return false
  }

  return true
}

export async function updateLotStage(
  projectId: string,
  lotId: string,
  newStage: ProcessStage
): Promise<UpdateStageResult> {
  const supabase = await createClient()

  // 0. Validate Input
  const validation = updateStageSchema.safeParse({ projectId, lotId, newStage })
  if (!validation.success) {
    return { success: false, error: 'Datos inválidos: ' + validation.error.issues[0].message }
  }

  // 1. Check permissions
  const hasPermission = await checkUserPermissions(supabase, projectId)
  if (!hasPermission) {
    return { success: false, error: 'No tienes permisos para realizar esta acción' }
  }

  try {
    // 2. Validate current state
    const { data: lotRecord, error: fetchError } = await supabase
      .from('lot_records')
      .select('id, lot_id')
      .eq('lot_id', lotId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError || !lotRecord) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      logger.error(
        { lotId, userId: user?.id, error: fetchError, found: !!lotRecord },
        'update_stage_not_found'
      )
      return {
        success: false,
        error: `Error: Registro no encontrado. Lote: ${lotId.slice(0, 5)}...`,
      }
    }

    // 3. Update stage
    const { error: updateError } = await supabase
      .from('lot_records')
      .update({ etapa_proceso: newStage })
      .eq('id', lotRecord.id)

    if (updateError) {
      logger.error({ lotId, error: updateError }, 'update_stage_failed')
      return { success: false, error: 'Error al actualizar la etapa (RLS)' }
    }

    // 4. Update Lot Status based on Stage is handled exclusively by admin approvals.

    revalidatePath(`/proyectos/${projectId}`)
    revalidatePath('/operations')
    return { success: true, message: 'Etapa actualizada correctamente' }
  } catch (err) {
    logger.error({ lotId, error: err }, 'update_stage_server_error')
    return { success: false, error: 'Error del servidor' }
  }
}

export async function updateLotDetails(
  projectId: string,
  lotId: string,
  updates: LotUpdateInput
): Promise<UpdateStageResult> {
  const supabase = await createClient()

  const hasPermission = await checkUserPermissions(supabase, projectId)
  if (!hasPermission) {
    return { success: false, error: 'No tienes permisos' }
  }

  // Validar y sanear los campos (protección contra mass assignment)
  const validation = lotUpdateSchema.safeParse(updates)
  if (!validation.success) {
    return { success: false, error: 'Datos inválidos: ' + validation.error.issues[0].message }
  }

  const safeUpdates = validation.data

  try {
    // Bidirectional sync: If updating 'm2', also update 'area_official_m2'
    const payload: Record<string, unknown> = { ...safeUpdates }
    if (safeUpdates.m2 !== undefined) {
      payload.area_official_m2 = safeUpdates.m2
    }

    const { error } = await supabase.from('lots').update(payload).eq('id', lotId)

    if (error) {
      logger.error({ lotId, error }, 'update_lot_details_failed')
      return { success: false, error: 'Error al actualizar lote' }
    }

    revalidatePath(`/proyectos/${projectId}`)
    revalidatePath('/operations')
    return { success: true, message: 'Lote actualizado' }
  } catch (err) {
    logger.error({ lotId, error: err }, 'update_lot_details_server_error')
    return { success: false, error: 'Error del servidor' }
  }
}
