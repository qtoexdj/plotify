import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { microserviceFetch } from '@/lib/services/microservice.client'
import { createClient } from '@/lib/supabase/server'
import { resolveApprovalRequest } from '@/lib/services/approvals.service'
import { resolveApprovalRequestAction } from '@/actions/request-approval.action'

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

describe('resolveApprovalRequestAction — Server Action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const buildSupabaseMock = (userRole: 'admin' | 'user', hasUser = true) => {
    const mockAuth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: hasUser ? { id: 'admin-user-uuid', email: 'admin@plotify.cl' } : null },
        error: null,
      }),
    }

    const mockFrom = vi.fn((table: string) => {
      const queryMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(async () => {
          if (table === 'approval_requests') {
            return { data: { organization_id: 'org-uuid-1' }, error: null }
          }
          if (table === 'organization_members') {
            return { data: { role: userRole }, error: null }
          }
          return { data: null, error: new Error('Unknown table') }
        }),
      }
      return queryMock
    })

    return {
      auth: mockAuth,
      from: mockFrom,
    }
  }

  it('allows resolution and forwards request when current user has admin role in organization members', async () => {
    // Mock Supabase
    vi.mocked(createClient).mockResolvedValueOnce(buildSupabaseMock('admin') as never)

    // Mock microservice fetch de resolveApprovalRequest
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { success: true },
      error: null,
      status: 200,
    })

    const result = await resolveApprovalRequestAction('approval-123', 'approve')

    expect(result.success).toBe(true)
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/approvals/approval-123/decide',
      expect.objectContaining({
        body: {
          action: 'approve',
          admin_id: 'admin-user-uuid',
          organization_id: 'org-uuid-1',
        },
      })
    )
  })

  it('rejects with error when current user has role user (not admin) in organization members', async () => {
    // Mock Supabase con rol user
    vi.mocked(createClient).mockResolvedValueOnce(buildSupabaseMock('user') as never)

    const result = await resolveApprovalRequestAction('approval-123', 'approve')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Se requieren privilegios de administrador')
    }
    // No debe haber llamado al microservicio
    expect(microserviceFetch).not.toHaveBeenCalled()
  })

  it('rejects with error when current user is not authenticated', async () => {
    // Mock Supabase sin usuario
    vi.mocked(createClient).mockResolvedValueOnce(buildSupabaseMock('admin', false) as never)

    const result = await resolveApprovalRequestAction('approval-123', 'approve')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('No autenticado')
    }
    // No debe haber llamado al microservicio
    expect(microserviceFetch).not.toHaveBeenCalled()
  })
})
