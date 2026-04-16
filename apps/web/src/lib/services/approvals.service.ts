import { createClient } from '@/lib/supabase/server'
import type { ApprovalRequestPayload, ApprovalStatus } from '@/types/database.types'
import { microserviceFetch } from './microservice.client'
import type { OperationRequestBody, OperationResponse } from './plotify-chat.generated'

type ReservationRequestBody = OperationRequestBody<'requestReservationApproval'>
type ReservationResponseBody = OperationResponse<'requestReservationApproval'>

export interface CreateApprovalRequestParams {
    lotId: string
    organizationId: string
    vendorId: string
    vendorName: string
    vendorPhone: string
    vendorPlatform: 'telegram' | 'whatsapp'
    payload: ApprovalRequestPayload
}

export type ApprovalServiceResult =
    | {
        success: true
        approval_id: string
        status: ApprovalStatus
        message: string
    }
    | {
        success: false
        error: string
        code: 'LOT_NOT_FOUND' | 'LOT_NOT_AVAILABLE' | 'PENDING_EXISTS' | 'VENDOR_NOT_FOUND' | 'INSERT_FAILED' | 'UNAUTHORIZED'
    }

/**
 * Crea una solicitud de reserva con aprobación cruzada.
 * Delega la lógica de validación e inserción al microservicio (plotify_chat)
 * para que procese y encole las notificaciones vía Redis (ARQ).
 */
export async function createApprovalRequest(params: CreateApprovalRequestParams): Promise<ApprovalServiceResult> {
    const body: ReservationRequestBody = {
        lot_id: params.lotId,
        organization_id: params.organizationId,
        vendor_id: params.vendorId,
        vendor_name: params.vendorName,
        vendor_phone: params.vendorPhone,
        vendor_platform: params.vendorPlatform,
        payload: params.payload,
    }

    const { data, error, status } = await microserviceFetch<ReservationResponseBody>(
        '/api/v1/approvals/request-reservation',
        {
            method: 'POST',
            body,
        }
    )

    if (error || !data) {
        return {
            success: false,
            error: error ?? 'Error al enviar la solicitud al Agente',
            code: status === 409 ? 'PENDING_EXISTS' : status === 404 ? 'LOT_NOT_FOUND' : 'INSERT_FAILED',
        }
    }

    return {
        success: true,
        approval_id: data.approval_id,
        status: 'pending',
        message: 'Solicitud de reserva enviada al administrador para aprobación.',
    }
}

/**
 * Resuelve la información del vendedor a partir del usuario autenticado.
 * Busca el registro de vendor vinculado al user_id actual.
 */
export async function resolveVendorFromUser(userId: string): Promise<{
    vendor_id: string
    vendor_name: string
    vendor_phone: string
    organization_id: string
} | null> {
    const supabase = await createClient()

    const { data: vendor, error } = await supabase
        .from('vendors')
        .select('id, nombre, phone, organization_id')
        .eq('user_id', userId)
        .single()

    if (error || !vendor) {
        console.error('[approvals.service] Vendor not found for user:', userId, error)
        return null
    }

    return {
        vendor_id: vendor.id,
        vendor_name: vendor.nombre,
        vendor_phone: vendor.phone || '',
        organization_id: vendor.organization_id || '',
    }
}
