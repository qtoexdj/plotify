'use server'

import { microserviceFetch } from './microservice.client'
import type { OperationRequestBody, OperationResponse, components } from './plotify-chat.generated'

export type NotificationItem = components['schemas']['NotificationItem']
export type NotificationCounts = components['schemas']['NotificationCounts']

export interface ListNotificationsResult {
  success: boolean
  items: NotificationItem[]
  counts: NotificationCounts
  error?: string
}

/**
 * Obtiene la lista y conteos de notificaciones para un usuario específico.
 */
export async function listNotifications(
  userId: string,
  organizationId: string
): Promise<ListNotificationsResult> {
  const { data, error } = await microserviceFetch<OperationResponse<'listNotifications'>>(
    '/api/v1/notifications/',
    {
      method: 'GET',
      headers: {
        'X-User-Id': userId,
        'X-Organization-Id': organizationId,
      },
    }
  )

  if (error || !data) {
    return {
      success: false,
      items: [],
      counts: { pending: 0, approved: 0, rejected: 0, unread: 0 },
      error: error ?? 'Error al cargar notificaciones',
    }
  }

  return {
    success: true,
    items: data.items,
    counts: data.counts,
  }
}

/**
 * Marca una notificación específica como leída por el destinatario.
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<{ success: boolean; readAt?: string; error?: string }> {
  const { data, error } = await microserviceFetch<OperationResponse<'markNotificationRead'>>(
    `/api/v1/notifications/${notificationId}/read`,
    {
      method: 'POST',
      headers: {
        'X-User-Id': userId,
      },
    }
  )

  if (error || !data || !data.success) {
    return {
      success: false,
      error: error ?? 'Error al marcar notificación como leída',
    }
  }

  return {
    success: true,
    readAt: data.read_at,
  }
}

/**
 * Procesa la decisión de aprobación/rechazo directamente desde el menú dropdown web.
 */
export async function decideNotificationApproval(
  approvalId: string,
  action: 'approve' | 'reject',
  adminId: string,
  organizationId: string
): Promise<{ success: boolean; status?: string; error?: string; code?: string }> {
  const body: OperationRequestBody<'decideNotificationApproval'> = {
    approval_id: approvalId,
    action,
  }

  const { data, error } = await microserviceFetch<OperationResponse<'decideNotificationApproval'>>(
    `/api/v1/notifications/${approvalId}/decide`,
    {
      method: 'POST',
      body,
      headers: {
        'X-User-Id': adminId,
        'X-Organization-Id': organizationId,
      },
    }
  )

  if (error || !data) {
    return {
      success: false,
      error: error ?? 'Error al procesar la decisión de aprobación',
    }
  }

  return {
    success: data.success,
    status: data.status ?? undefined,
    error: data.error ?? undefined,
    code: data.code ?? undefined,
  }
}
