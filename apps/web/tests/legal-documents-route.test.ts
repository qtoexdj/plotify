/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createRouteHandlerClientMock,
  getProjectByIdMock,
  microserviceFetchMock,
  isLegalDocumentsFeatureEnabledMock,
} = vi.hoisted(() => ({
  createRouteHandlerClientMock: vi.fn(),
  getProjectByIdMock: vi.fn(),
  microserviceFetchMock: vi.fn(),
  isLegalDocumentsFeatureEnabledMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
}))

vi.mock('@/lib/services/projects.service', () => ({
  getProjectById: getProjectByIdMock,
}))

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: microserviceFetchMock,
}))

vi.mock('@/lib/features/legal-documents', () => ({
  isLegalDocumentsFeatureEnabled: isLegalDocumentsFeatureEnabledMock,
}))

import { microserviceFetch } from '@/lib/services/microservice.client'
import { GET, POST } from '../src/app/api/projects/[id]/legal-documents/route'

function routeClient(userId: string | null = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
  }
}

function buildRequest(path = 'http://localhost/api/projects/project-1/legal-documents') {
  return new Request(path) as any
}

function buildRetryRequest(payload: Record<string, unknown>) {
  return new Request('http://localhost/api/projects/project-1/legal-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as any
}

describe('/api/projects/[id]/legal-documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createRouteHandlerClientMock.mockReturnValue(routeClient())
    getProjectByIdMock.mockResolvedValue({
      id: 'project-1',
      organization_id: 'org-1',
    })
    isLegalDocumentsFeatureEnabledMock.mockReturnValue(true)
  })

  it('proxies legal document listing with project-derived organization scope', async () => {
    microserviceFetchMock.mockResolvedValue({
      data: { project_id: 'project-1', documents: [] },
      error: null,
      status: 200,
    })

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ id: 'project-1' }),
    })

    expect(response.status).toBe(200)
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/legal-documents/project/project-1?organization_id=org-1'
    )
  })

  it('proxies retry with project-derived organization and project scope', async () => {
    microserviceFetchMock.mockResolvedValue({
      data: {
        legal_document_id: 'doc-1',
        ingestion_job_id: 'job-2',
        extraction_status: 'queued',
        attempt_number: 2,
      },
      error: null,
      status: 202,
    })

    const response = await POST(buildRetryRequest({ legal_document_id: 'doc-1' }), {
      params: Promise.resolve({ id: 'project-1' }),
    })

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      legal_document_id: 'doc-1',
      ingestion_job_id: 'job-2',
      extraction_status: 'queued',
      attempt_number: 2,
    })
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/legal-documents/doc-1/retry?organization_id=org-1&project_id=project-1',
      { method: 'POST' }
    )
  })

  it('blocks listing before proxying when legal documents are disabled', async () => {
    isLegalDocumentsFeatureEnabledMock.mockReturnValue(false)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ id: 'project-1' }),
    })

    expect(response.status).toBe(403)
    expect(microserviceFetch).not.toHaveBeenCalled()
  })
})
