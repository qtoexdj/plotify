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
      code:
        | 'LOT_NOT_FOUND'
        | 'LOT_NOT_AVAILABLE'
        | 'PENDING_EXISTS'
        | 'VENDOR_NOT_FOUND'
        | 'INSERT_FAILED'
        | 'UNAUTHORIZED'
    }

/**
 * Crea una solicitud de reserva con aprobación cruzada.
 * Delega la lógica de validación e inserción al microservicio (plotify_chat)
 * para que procese y encole las notificaciones vía Redis (ARQ).
 */
export async function createApprovalRequest(
  params: CreateApprovalRequestParams
): Promise<ApprovalServiceResult> {
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
 * Resuelve una solicitud de aprobación (aprobación/rechazo) desde el Frontend.
 * Envía la decisión al microservicio de approvals.
 */
export async function resolveApprovalRequest(
  approvalId: string,
  action: 'approve' | 'reject',
  adminId: string,
  organizationId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { data, error } = await microserviceFetch<{ success: boolean; error?: string }>(
    `/api/v1/approvals/${approvalId}/decide`,
    {
      method: 'POST',
      body: {
        action,
        admin_id: adminId,
        organization_id: organizationId,
      },
    }
  )

  if (error || !data || !data.success) {
    return {
      success: false,
      error: error ?? data?.error ?? 'Error al procesar la decisión',
    }
  }

  return {
    success: true,
  }
}

type SaleRequestBody = OperationRequestBody<'requestSaleApproval'>
type SaleResponseBody = OperationResponse<'requestSaleApproval'>

export interface CreateSaleApprovalRequestParams {
  lotId: string
  organizationId: string
  vendorId: string
  vendorName: string
  vendorPhone: string
  vendorPlatform: 'telegram' | 'whatsapp'
  payload: {
    cliente_nombre: string
    cliente_run: string
    valor_final: number
    notaria?: string | null
    fecha_firma?: string | null
  }
}

/**
 * Crea una solicitud de aprobación de venta.
 * Delega la lógica de validación e inserción al microservicio (plotify_chat)
 */
export async function createSaleApprovalRequest(
  params: CreateSaleApprovalRequestParams
): Promise<ApprovalServiceResult> {
  const body: SaleRequestBody = {
    lot_id: params.lotId,
    organization_id: params.organizationId,
    vendor_id: params.vendorId,
    vendor_name: params.vendorName,
    vendor_phone: params.vendorPhone,
    vendor_platform: params.vendorPlatform,
    payload: params.payload,
  }

  const { data, error, status } = await microserviceFetch<SaleResponseBody>(
    '/api/v1/approvals/request-sale',
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
    message: 'Solicitud de venta enviada al administrador para aprobación.',
  }
}
