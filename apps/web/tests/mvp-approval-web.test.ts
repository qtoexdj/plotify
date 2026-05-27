import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: vi.fn(),
}))

import { microserviceFetch } from '@/lib/services/microservice.client'
import { resolveApprovalRequest } from '@/lib/services/approvals.service'

describe('resolveApprovalRequest — web admin reservation decision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves pending reservation successfully with approve action', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { success: true },
      error: null,
      status: 200,
    })

    const result = await resolveApprovalRequest(
      'approval-uuid-123',
      'approve',
      'admin-uuid-99',
      'org-uuid-a'
    )

    expect(result.success).toBe(true)
    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledWith(
      '/api/v1/approvals/approval-uuid-123/decide',
      expect.objectContaining({
        method: 'POST',
        body: {
          action: 'approve',
          admin_id: 'admin-uuid-99',
          organization_id: 'org-uuid-a',
        },
      })
    )
  })

  it('resolves pending reservation successfully with reject action', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { success: true },
      error: null,
      status: 200,
    })

    const result = await resolveApprovalRequest(
      'approval-uuid-123',
      'reject',
      'admin-uuid-99',
      'org-uuid-a'
    )

    expect(result.success).toBe(true)
    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledWith(
      '/api/v1/approvals/approval-uuid-123/decide',
      expect.objectContaining({
        method: 'POST',
        body: {
          action: 'reject',
          admin_id: 'admin-uuid-99',
          organization_id: 'org-uuid-a',
        },
      })
    )
  })

  it('reports already processed error when Telegram wins the race first', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { success: false, error: 'already_processed' },
      error: 'already_processed',
      status: 409,
    })

    const result = await resolveApprovalRequest(
      'approval-uuid-123',
      'approve',
      'admin-uuid-99',
      'org-uuid-a'
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('already_processed')
    }
  })
})
