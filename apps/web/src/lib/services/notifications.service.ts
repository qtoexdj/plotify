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

export interface ListNotificationsOptions {
  limit?: number
  offset?: number
}

/**
 * Obtiene la lista y conteos de notificaciones para un usuario específico.
 * El listado está paginado (máximo 50 por consulta); los conteos son globales
 * del alcance del usuario (excluyen notificaciones descartadas).
 */
export async function listNotifications(
  userId: string,
  organizationId: string,
  options: ListNotificationsOptions = {}
): Promise<ListNotificationsResult> {
  const { limit, offset } = options
  const params = new URLSearchParams()
  if (limit !== undefined) params.set('limit', String(limit))
  if (offset !== undefined) params.set('offset', String(offset))
  const query = params.toString()
  const path = `/api/v1/notifications/${query ? `?${query}` : ''}`

  const { data, error } = await microserviceFetch<OperationResponse<'listNotifications'>>(path, {
    method: 'GET',
    headers: {
      'X-User-Id': userId,
      'X-Organization-Id': organizationId,
    },
  })

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
 * Descarta (soft-dismiss) una notificación para su destinatario.
 * El registro permanece con la marca temporal (auditoría) y la solicitud
 * subyacente no se altera. Es idempotente.
 */
export async function dismissNotification(
  notificationId: string,
  userId: string
): Promise<{ success: boolean; dismissedAt?: string; error?: string }> {
  const { data, error } = await microserviceFetch<OperationResponse<'dismissNotification'>>(
    `/api/v1/notifications/${notificationId}/dismiss`,
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
      error: error ?? 'Error al descartar la notificación',
    }
  }

  return {
    success: true,
    dismissedAt: data.dismissed_at,
  }
}

/**
 * Marca todas las notificaciones sin leer del alcance del usuario como leídas
 * en una única operación. Excluye las descartadas.
 */
export async function markAllNotificationsRead(
  userId: string,
  organizationId: string
): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
  const { data, error } = await microserviceFetch<OperationResponse<'markAllNotificationsRead'>>(
    '/api/v1/notifications/read-all',
    {
      method: 'POST',
      headers: {
        'X-User-Id': userId,
        'X-Organization-Id': organizationId,
      },
    }
  )

  if (error || !data || !data.success) {
    return {
      success: false,
      error: error ?? 'Error al marcar las notificaciones como leídas',
    }
  }

  return {
    success: true,
    updatedCount: data.updated_count,
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
