'use server'

import { createClient } from '@/lib/supabase/server'
import { lotReservationSchema, type LotReservationInput } from '@/lib/validations/lot-reservation.schema'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'

export type ReserveLotResult =
    | { success: true; message: string }
    | { success: false; error: string }

export async function reserveLot(
    projectId: string,
    lotId: string,
    data: LotReservationInput
): Promise<ReserveLotResult> {
    logger.info({ lotId, projectId }, 'reserve_lot_started')
    const supabase = await createClient()

    // 1. Validate Input
    const validation = lotReservationSchema.safeParse(data)
    if (!validation.success) {
        logger.error({ lotId, error: validation.error.format() }, 'reserve_lot_validation_failed')
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
        valor_reserva
    } = validation.data

    try {
        // 2 & 3. Llamar a transaccional RPC
        logger.info({ lotId }, 'reserve_lot_rpc_executing')
        const { data: rpcData, error: rpcError } = await supabase.rpc('reserve_lot', {
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
            logger.error({ lotId, error: rpcError }, 'reserve_lot_rpc_failed')
            throw new Error(`RPC call failed: ${rpcError.message}`)
        }

        if (!rpcData?.success) {
            return { success: false, error: rpcData?.error || 'Error desconocido al reservar lote' }
        }

        logger.info({ lotId }, 'reserve_lot_success')
        revalidatePath(`/proyectos/${projectId}`)
        return { success: true, message: rpcData.message }

    } catch (err) {
        logger.error({ lotId, error: err }, 'reserve_lot_unexpected_error')
        return { success: false, error: 'Error inesperado del servidor' }
    }
}
