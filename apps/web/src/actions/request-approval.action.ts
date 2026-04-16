'use server'

import { createClient } from '@/lib/supabase/server'
import { reservationFormSchema, type ReservationFormInput } from '@/lib/validations/approval-request.schema'
import { createApprovalRequest, resolveVendorFromUser } from '@/lib/services/approvals.service'
import type { ApprovalRequestPayload } from '@/types/database.types'

export type RequestApprovalResult =
    | { success: true; approval_id: string; message: string }
    | { success: false; error: string }

/**
 * Server Action invocada desde LotReservationForm cuando mode === 'reservation'.
 * Crea una solicitud de aprobación en lugar de reservar el lote directamente.
 */
export async function requestReservationApproval(
    projectId: string,
    lotId: string,
    data: ReservationFormInput
): Promise<RequestApprovalResult> {
    const supabase = await createClient()

    // 1. Validar input
    const validation = reservationFormSchema.safeParse(data)
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0].message }
    }
    const validData = validation.data

    // 2. Obtener usuario autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        return { success: false, error: 'No autenticado' }
    }

    // 3. Resolver info del vendedor desde el usuario
    const vendorInfo = await resolveVendorFromUser(user.id)
    if (!vendorInfo) {
        return { success: false, error: 'No se encontró registro de vendedor asociado a tu cuenta' }
    }

    // 4. Obtener organization_id del proyecto
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('organization_id')
        .eq('id', projectId)
        .single()

    if (projectError || !project?.organization_id) {
        return { success: false, error: 'Proyecto no encontrado' }
    }

    // 5. Armar payload con todos los datos del cliente
    const payload: ApprovalRequestPayload = {
        cliente_nombre: validData.cliente_nombre,
        cliente_run: validData.cliente_run,
        valor_reserva: validData.valor_reserva,
        notaria: validData.notaria,
        fecha_firma: validData.fecha,
        cliente_direccion: validData.cliente_direccion,
        cliente_estado_civil: validData.cliente_estado_civil,
        cliente_ocupacion: validData.cliente_ocupacion,
        cliente_email: validData.cliente_email,
        cliente_telefono: validData.cliente_telefono,
    }

    // 6. Crear solicitud de aprobación
    const result = await createApprovalRequest({
        lotId,
        organizationId: project.organization_id,
        vendorId: vendorInfo.vendor_id,
        vendorName: vendorInfo.vendor_name,
        vendorPhone: vendorInfo.vendor_phone,
        vendorPlatform: 'telegram', // Default, configurable en el futuro
        payload,
    })

    if (!result.success) {
        return { success: false, error: result.error }
    }

    return {
        success: true,
        approval_id: result.approval_id,
        message: result.message,
    }
}
