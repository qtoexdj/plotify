'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  lotReservationSchema,
  type LotReservationInput,
} from '@/lib/validations/lot-reservation.schema'
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

    // 4. Update Lot Status based on Stage
    if (newStage === 'escritura_firmada') {
      // Only 'escritura_firmada' moves lot to 'vendido'
      const { error: lotUpdateError } = await supabase
        .from('lots')
        .update({
          estado: 'vendido',
          sold_at: new Date().toISOString(),
        })
        .eq('id', lotId)

      if (lotUpdateError) {
        logger.error({ lotId, error: lotUpdateError }, 'close_sale_failed')
        return { success: true, message: 'Etapa actualizada, pero error al marcar vendido' }
      }
    } else {
      // Any other stage keeps/reverts lot to 'reservado'
      const { error: lotUpdateError } = await supabase
        .from('lots')
        .update({
          estado: 'reservado',
          sold_at: null, // Clear sold_at if moving back
        })
        .eq('id', lotId)

      if (lotUpdateError) {
        logger.error({ lotId, error: lotUpdateError }, 'update_lot_status_failed')
      }
    }

    revalidatePath(`/proyectos/${projectId}`)
    revalidatePath('/operations')
    return { success: true, message: 'Etapa actualizada correctamente' }
  } catch (err) {
    logger.error({ lotId, error: err }, 'update_stage_server_error')
    return { success: false, error: 'Error del servidor' }
  }
}

export async function directSale(
  projectId: string,
  lotId: string,
  data: LotReservationInput
): Promise<UpdateStageResult> {
  const supabase = await createClient()

  // 1. Check permissions
  const hasPermission = await checkUserPermissions(supabase, projectId)
  if (!hasPermission) {
    return { success: false, error: 'No tienes permisos para realizar venta directa' }
  }

  // 2. Validate Input
  const validation = lotReservationSchema.safeParse(data)
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message }
  }
  const {
    cliente_nombre,
    cliente_run,
    cliente_direccion,
    cliente_estado_civil,
    cliente_ocupacion,
    cliente_email,
    cliente_telefono,
    fecha,
    notaria,
    valor_reserva,
  } = validation.data

  try {
    // 3 & 4. Llamar a lógica transaccional RPC
    logger.info({ lotId }, 'direct_sale_rpc_executing')
    const { data: rpcData, error: rpcError } = await supabase.rpc('direct_sale_lot', {
      p_lot_id: lotId,
      p_cliente_nombre: cliente_nombre,
      p_cliente_run: cliente_run,
      p_cliente_direccion: cliente_direccion || null,
      p_cliente_estado_civil: cliente_estado_civil || null,
      p_cliente_ocupacion: cliente_ocupacion || null,
      p_cliente_email: cliente_email || null,
      p_cliente_telefono: cliente_telefono || null,
      p_firma_fecha: fecha || null,
      p_firma_lugar: notaria || null,
      p_abono: valor_reserva || null,
    })

    if (rpcError) {
      logger.error({ lotId, error: rpcError }, 'direct_sale_rpc_failed')
      throw new Error(`RPC call failed: ${rpcError.message}`)
    }

    if (!rpcData?.success) {
      return { success: false, error: rpcData?.error || 'Error desconocido al procesar venta' }
    }

    logger.info({ lotId }, 'direct_sale_success')
    revalidatePath(`/proyectos/${projectId}`)
    return { success: true, message: rpcData.message }
  } catch (err) {
    logger.error({ lotId, error: err }, 'direct_sale_server_error')
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
