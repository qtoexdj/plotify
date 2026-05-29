import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: vi.fn(),
}))

import { microserviceFetch } from '@/lib/services/microservice.client'
import { createSaleApprovalRequest } from '@/lib/services/approvals.service'

describe('createSaleApprovalRequest — web vendor sale request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends sale approval request successfully', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { approval_id: 'sale-approval-uuid-123' },
      error: null,
      status: 202,
    })

    const params = {
      lotId: 'lot-uuid-456',
      organizationId: 'org-uuid-a',
      vendorId: 'vendor-uuid-789',
      vendorName: 'Vendedor Demo',
      vendorPhone: '+56987654321',
      vendorPlatform: 'telegram' as const,
      payload: {
        cliente_nombre: 'Comprador Demo',
        cliente_run: '12.345.678-9',
        valor_final: 9500000,
        notaria: 'Notaría Santiago',
        fecha_firma: '2026-06-15',
      },
    }

    const result = await createSaleApprovalRequest(params)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.approval_id).toBe('sale-approval-uuid-123')
      expect(result.message).toContain('Solicitud de venta enviada')
    }

    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledWith(
      '/api/v1/approvals/request-sale',
      expect.objectContaining({
        method: 'POST',
        body: {
          lot_id: 'lot-uuid-456',
          organization_id: 'org-uuid-a',
          vendor_id: 'vendor-uuid-789',
          vendor_name: 'Vendedor Demo',
          vendor_phone: '+56987654321',
          vendor_platform: 'telegram',
          payload: {
            cliente_nombre: 'Comprador Demo',
            cliente_run: '12.345.678-9',
            valor_final: 9500000,
            notaria: 'Notaría Santiago',
            fecha_firma: '2026-06-15',
          },
        },
      })
    )
  })

  it('handles conflict when pending sale request already exists', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: 'Conflict: pending sale request exists',
      status: 409,
    })

    const params = {
      lotId: 'lot-uuid-456',
      organizationId: 'org-uuid-a',
      vendorId: 'vendor-uuid-789',
      vendorName: 'Vendedor Demo',
      vendorPhone: '+56987654321',
      vendorPlatform: 'telegram' as const,
      payload: {
        cliente_nombre: 'Comprador Demo',
        cliente_run: '12.345.678-9',
        valor_final: 9500000,
      },
    }

    const result = await createSaleApprovalRequest(params)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('PENDING_EXISTS')
    }
  })
})
