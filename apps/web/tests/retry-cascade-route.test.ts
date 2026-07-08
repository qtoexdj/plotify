/* eslint-disable @typescript-eslint/no-explicit-any */
// SDD 017 — POST /api/escritura-matrices/case/[caseId]/retry-cascade
// (contracts §1: solo un admin de la organización del caso puede reintentar).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createRouteHandlerClientMock, microserviceFetchMock, featureEnabledMock } = vi.hoisted(
  () => ({
    createRouteHandlerClientMock: vi.fn(),
    microserviceFetchMock: vi.fn(),
    featureEnabledMock: vi.fn(),
  })
)

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
}))

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: microserviceFetchMock,
}))

vi.mock('@/lib/features/legal-documents', () => ({
  isLegalDocumentsFeatureEnabled: featureEnabledMock,
}))

import { POST } from '../src/app/api/escritura-matrices/case/[caseId]/retry-cascade/route'

function supabaseStub({
  userId = 'user-1',
  role,
}: {
  userId?: string | null
  role: string | null
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: vi.fn((table: string) => {
      const result =
        table === 'escritura_cases'
          ? {
              data: { id: 'case-1', organization_id: 'org-1', project_id: 'project-1' },
              error: null,
            }
          : { data: role ? { role } : null, error: null }
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve(result),
      }
      return chain
    }),
  }
}

function buildRequest() {
  return new Request('http://localhost/api/escritura-matrices/case/case-1/retry-cascade', {
    method: 'POST',
  }) as any
}

function routeParams() {
  return { params: Promise.resolve({ caseId: 'case-1' }) }
}

describe('POST /api/escritura-matrices/case/[caseId]/retry-cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    featureEnabledMock.mockReturnValue(true)
    microserviceFetchMock.mockResolvedValue({
      data: {
        run_id: 'run-1',
        outcome: 'completed',
        causes: [],
        steps: [],
        generation_id: 'gen-1',
        created_at: '2026-07-08T00:00:00Z',
      },
      error: null,
      status: 200,
    })
  })

  it('returns 401 when user is not authenticated', async () => {
    createRouteHandlerClientMock.mockReturnValue(supabaseStub({ userId: null, role: null }))

    const response = await POST(buildRequest(), routeParams())

    expect(response.status).toBe(401)
    expect(microserviceFetchMock).not.toHaveBeenCalled()
  })

  it('returns 403 when the member is not an admin', async () => {
    createRouteHandlerClientMock.mockReturnValue(supabaseStub({ role: 'user' }))

    const response = await POST(buildRequest(), routeParams())

    expect(response.status).toBe(403)
    expect(microserviceFetchMock).not.toHaveBeenCalled()
  })

  it('proxies the retry to the microservice when the user is an admin', async () => {
    createRouteHandlerClientMock.mockReturnValue(supabaseStub({ role: 'admin' }))

    const response = await POST(buildRequest(), routeParams())

    expect(response.status).toBe(200)
    expect(microserviceFetchMock).toHaveBeenCalledWith(
      '/api/v1/escritura-cases/case-1/retry-cascade?organization_id=org-1',
      { method: 'POST' }
    )
    const body = await response.json()
    expect(body.outcome).toBe('completed')
  })
})
