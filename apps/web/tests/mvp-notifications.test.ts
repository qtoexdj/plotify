import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mvpWebAuthFixtures } from './mvp-fixtures.test'
import {
  listNotifications,
  decideNotificationApproval,
  dismissNotification,
  markAllNotificationsRead,
} from '../src/lib/services/notifications.service'
import type { NotificationItem } from '../src/lib/services/notifications.service'
import { microserviceFetch } from '../src/lib/services/microservice.client'

// Mockear el cliente del microservicio
vi.mock('../src/lib/services/microservice.client', () => ({
  microserviceFetch: vi.fn(),
}))

const mockNotificationsData: (NotificationItem & {
  recipient_id: string
  organization_id: string
})[] = [
  {
    id: 'notif-1',
    approval_id: 'app-1',
    request_type: 'reservation',
    status: 'pending',
    project_name: 'Proyecto Los Castaños',
    lot_label: 'Lote 12',
    client_name: 'María Pérez',
    vendor_name: 'Juan Vendedor',
    created_at: '2026-05-29T15:00:00Z',
    can_decide: true,
    recipient_id: 'admin-a',
    organization_id: 'org-a',
    read_at: undefined,
  },
  {
    id: 'notif-2',
    approval_id: 'app-2',
    request_type: 'sale',
    status: 'approved',
    project_name: 'Proyecto Los Castaños',
    lot_label: 'Lote 9',
    client_name: 'Carlos Díaz',
    vendor_name: 'Juan Vendedor',
    created_at: '2026-05-29T14:00:00Z',
    can_decide: false,
    recipient_id: 'vendor-a',
    organization_id: 'org-a',
    read_at: undefined,
  },
  {
    id: 'notif-3',
    approval_id: 'app-3',
    request_type: 'reservation',
    status: 'pending',
    project_name: 'Proyecto Los Olivos',
    lot_label: 'Lote 5',
    client_name: 'Ana Gómez',
    vendor_name: 'Pedro Vendedor',
    created_at: '2026-05-29T16:00:00Z',
    can_decide: false,
    recipient_id: 'vendor-b',
    organization_id: 'org-b',
    read_at: undefined,
  },
]

describe('US1: Header Notification Center list tests with real service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('admin sees organization-wide pending and outcome notifications', async () => {
    const adminUser = mvpWebAuthFixtures.admin // admin-a en org-a

    // Simular respuesta exitosa del microservicio para listNotifications de admin
    const filtered = mockNotificationsData.filter(
      (n) => n.organization_id === adminUser.organizationId
    )
    const pending = filtered.filter((n) => n.status === 'pending').length
    const approved = filtered.filter((n) => n.status === 'approved').length
    const rejected = filtered.filter((n) => n.status === 'rejected').length
    const unread = filtered.filter((n) => !n.read_at).length

    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        items: filtered,
        counts: { pending, approved, rejected, unread },
      },
      error: null,
      status: 200,
    })

    const result = await listNotifications(adminUser.userId, adminUser.organizationId)

    expect(result.success).toBe(true)
    expect(result.items).toHaveLength(2)
    expect(result.items.some((n) => n.id === 'notif-1')).toBe(true)
    expect(result.items.some((n) => n.id === 'notif-2')).toBe(true)

    // Solo la pendiente permite decisiones al administrador
    const pendingItem = result.items.find((n) => n.id === 'notif-1')
    expect(pendingItem?.can_decide).toBe(true)

    expect(result.counts.pending).toBe(1)
    expect(result.counts.approved).toBe(1)

    // Verificar que se llamara a microserviceFetch con las cabeceras correctas de tenant
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/notifications/',
      expect.objectContaining({
        headers: {
          'X-User-Id': adminUser.userId,
          'X-Organization-Id': adminUser.organizationId,
        },
      })
    )
  })

  it('vendor sees only their own request status updates', async () => {
    const vendorUser = mvpWebAuthFixtures.assignedVendor // vendor-a en org-a

    // Simular respuesta del microservicio para el vendedor: el microservicio filtra por recipient_id
    const filtered = mockNotificationsData.filter(
      (n) => n.organization_id === vendorUser.organizationId && n.recipient_id === vendorUser.userId
    )
    const pending = filtered.filter((n) => n.status === 'pending').length
    const approved = filtered.filter((n) => n.status === 'approved').length
    const rejected = filtered.filter((n) => n.status === 'rejected').length
    const unread = filtered.filter((n) => !n.read_at).length

    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        items: filtered,
        counts: { pending, approved, rejected, unread },
      },
      error: null,
      status: 200,
    })

    const result = await listNotifications(vendorUser.userId, vendorUser.organizationId)

    // Vendedor ve solo su propia notificación (notif-2)
    expect(result.success).toBe(true)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('notif-2')

    // Un vendedor nunca tiene permisos para decidir aprobaciones
    expect(result.items[0].can_decide).toBe(false)
    expect(result.counts.pending).toBe(0)
    expect(result.counts.approved).toBe(1)

    // Verificar que se llamara con cabeceras de vendedor
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/notifications/',
      expect.objectContaining({
        headers: {
          'X-User-Id': vendorUser.userId,
          'X-Organization-Id': vendorUser.organizationId,
        },
      })
    )
  })

  it('renders clear empty state when no notifications are returned', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        items: [],
        counts: { pending: 0, approved: 0, rejected: 0, unread: 0 },
      },
      error: null,
      status: 200,
    })

    const result = await listNotifications('user-empty', 'org-empty')
    expect(result.success).toBe(true)
    expect(result.items).toHaveLength(0)
    expect(result.counts.unread).toBe(0)
  })

  it('sends pagination limit/offset query params when provided', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        items: [mockNotificationsData[0]],
        counts: { pending: 1, approved: 0, rejected: 0, unread: 1 },
      },
      error: null,
      status: 200,
    })

    const result = await listNotifications('admin-a', 'org-a', { limit: 50, offset: 50 })

    expect(result.success).toBe(true)
    expect(result.items).toHaveLength(1)
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/notifications/?limit=50&offset=50',
      expect.objectContaining({
        headers: {
          'X-User-Id': 'admin-a',
          'X-Organization-Id': 'org-a',
        },
      })
    )
  })

  it('does not append query params when no options are given', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: { items: [], counts: { pending: 0, approved: 0, rejected: 0, unread: 0 } },
      error: null,
      status: 200,
    })

    await listNotifications('admin-a', 'org-a')

    expect(microserviceFetch).toHaveBeenCalledWith('/api/v1/notifications/', expect.any(Object))
  })
})

describe('US1: Dismiss notification from the bell (soft-dismiss)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the dismiss endpoint with the X-User-Id header', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: { success: true, dismissed_at: '2026-08-14T12:00:00Z' },
      error: null,
      status: 200,
    })

    const result = await dismissNotification('notif-1', 'admin-a')

    expect(result.success).toBe(true)
    expect(result.dismissedAt).toBe('2026-08-14T12:00:00Z')
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/notifications/notif-1/dismiss',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'X-User-Id': 'admin-a',
        },
      })
    )
  })

  it('returns an error when the microservice fails', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: null,
      error: 'Notificación no encontrada',
      status: 404,
    })

    const result = await dismissNotification('notif-1', 'admin-a')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Notificación no encontrada')
  })
})

describe('US4: Mark all notifications as read in a single operation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the read-all endpoint with tenant headers', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: { success: true, updated_count: 10 },
      error: null,
      status: 200,
    })

    const result = await markAllNotificationsRead('admin-a', 'org-a')

    expect(result.success).toBe(true)
    expect(result.updatedCount).toBe(10)
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/notifications/read-all',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'X-User-Id': 'admin-a',
          'X-Organization-Id': 'org-a',
        },
      })
    )
  })

  it('returns an error when the operation fails', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: null,
      error: 'Error del microservicio',
      status: 500,
    })

    const result = await markAllNotificationsRead('admin-a', 'org-a')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Error del microservicio')
  })
})

describe('US2: Admin decisions from notification dropdown with real service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows admin to approve a pending request successfully', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        success: true,
        status: 'approved',
      },
      error: null,
      status: 200,
    })

    const result = await decideNotificationApproval('app-1', 'approve', 'admin-a', 'org-a')
    expect(result.success).toBe(true)
    expect(result.status).toBe('approved')

    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/notifications/app-1/decide',
      expect.objectContaining({
        method: 'POST',
        body: { approval_id: 'app-1', action: 'approve' },
        headers: {
          'X-User-Id': 'admin-a',
          'X-Organization-Id': 'org-a',
        },
      })
    )
  })

  it('allows admin to reject a pending request successfully', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        success: true,
        status: 'rejected',
      },
      error: null,
      status: 200,
    })

    const result = await decideNotificationApproval('app-1', 'reject', 'admin-a', 'org-a')
    expect(result.success).toBe(true)
    expect(result.status).toBe('rejected')

    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/notifications/app-1/decide',
      expect.objectContaining({
        method: 'POST',
        body: { approval_id: 'app-1', action: 'reject' },
        headers: {
          'X-User-Id': 'admin-a',
          'X-Organization-Id': 'org-a',
        },
      })
    )
  })

  it('handles competing decisions gracefully returning already_processed code', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        success: false,
        code: 'already_processed',
        error: 'This request was already processed.',
      },
      error: null,
      status: 200,
    })

    const result = await decideNotificationApproval('app-1', 'approve', 'admin-a', 'org-a')
    expect(result.success).toBe(false)
    expect(result.code).toBe('already_processed')
    expect(result.error).toBe('This request was already processed.')
  })
})

describe('US3: Vendor web status tests with real service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('vendor displays pending, approved, and rejected states without admin controls', async () => {
    const vendorUser = mvpWebAuthFixtures.assignedVendor // vendor-a en org-a

    // El microservicio devuelve una notificación aprobada para el vendedor
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        items: [
          {
            id: 'notif-2',
            approval_id: 'app-2',
            request_type: 'sale' as const,
            status: 'approved' as const,
            project_name: 'Proyecto Los Castaños',
            lot_label: 'Lote 9',
            client_name: 'Carlos Díaz',
            vendor_name: 'Juan Vendedor',
            created_at: '2026-05-29T14:00:00Z',
            can_decide: false,
            recipient_id: 'vendor-a',
            organization_id: 'org-a',
          },
        ],
        counts: { pending: 0, approved: 1, rejected: 0, unread: 0 },
      },
      error: null,
      status: 200,
    })

    const result = await listNotifications(vendorUser.userId, vendorUser.organizationId)

    // El vendedor solo ve notificaciones donde es recipient
    expect(result.success).toBe(true)
    expect(result.items).toHaveLength(1)
    const item = result.items[0]
    expect(item.can_decide).toBe(false) // Un vendedor NUNCA tiene controles de administrador
    expect(item.status).toBe('approved')
  })
})
