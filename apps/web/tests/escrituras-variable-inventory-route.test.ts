/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createRouteHandlerClientMock, getProjectByIdMock, microserviceFetchMock } = vi.hoisted(
  () => ({
    createRouteHandlerClientMock: vi.fn(),
    getProjectByIdMock: vi.fn(),
    microserviceFetchMock: vi.fn(),
  })
)

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
}))

vi.mock('@/lib/services/projects.service', () => ({
  getProjectById: getProjectByIdMock,
}))

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: microserviceFetchMock,
}))

import { microserviceFetch } from '@/lib/services/microservice.client'
import { GET } from '../src/app/api/projects/[id]/legal-variables/route'
import { PATCH } from '../src/app/api/projects/[id]/legal-variables/[variableId]/route'

function routeClient(userId: string | null = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
  }
}

function buildRequest(search = '') {
  return new Request(`http://localhost/api/projects/project-1/legal-variables${search}`) as any
}

function buildPatchRequest(payload: Record<string, unknown>) {
  return new Request('http://localhost/api/projects/project-1/legal-variables/variable-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as any
}

function buildInventoryResponse() {
  return {
    project_id: 'project-1',
    lot_id: null,
    groups: {
      matriz: [
        {
          id: 'variable-1',
          lot_id: null,
          escritura_case_id: null,
          variable_key: 'matriz_fojas',
          variable_group: 'matriz',
          value_text: '123',
          value_json: null,
          state: 'proposed',
          source_type: 'document',
          confidence: 0.96,
          approval_required: true,
          correction_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          evidence: [],
        },
      ],
    },
    summary: {
      total: 1,
      proposed: 1,
    },
  }
}

describe('GET /api/projects/[id]/legal-variables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createRouteHandlerClientMock.mockReturnValue(routeClient())
    getProjectByIdMock.mockResolvedValue({
      id: 'project-1',
      organization_id: 'org-1',
    })
    microserviceFetchMock.mockResolvedValue({
      data: buildInventoryResponse(),
      error: null,
      status: 200,
    })
  })

  it('returns 401 when user is not authenticated', async () => {
    createRouteHandlerClientMock.mockReturnValue(routeClient(null))

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ id: 'project-1' }),
    })

    expect(response.status).toBe(401)
    expect(getProjectByIdMock).not.toHaveBeenCalled()
    expect(microserviceFetch).not.toHaveBeenCalled()
  })

  it('returns 404 when the project is outside the user scope', async () => {
    getProjectByIdMock.mockResolvedValue(null)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ id: 'project-1' }),
    })

    expect(response.status).toBe(404)
    expect(microserviceFetch).not.toHaveBeenCalled()
  })

  it('requires an organization scoped project before proxying', async () => {
    getProjectByIdMock.mockResolvedValue({
      id: 'project-1',
      organization_id: null,
    })

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ id: 'project-1' }),
    })

    expect(response.status).toBe(422)
    expect(microserviceFetch).not.toHaveBeenCalled()
  })

  it('proxies project inventory filters to the legal variable microservice endpoint', async () => {
    const response = await GET(
      buildRequest('?lot_id=lot-1&state=manual_review&group=sii&include_evidence=true'),
      { params: Promise.resolve({ id: 'project-1' }) }
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(buildInventoryResponse())
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/legal-variables/project/project-1?organization_id=org-1&lot_id=lot-1&state=manual_review&group=sii&include_evidence=true'
    )
  })

  it('propagates microservice errors without exposing internal fetch details', async () => {
    microserviceFetchMock.mockResolvedValue({
      data: null,
      error: 'Proyecto fuera del alcance de la organización',
      status: 403,
    })

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ id: 'project-1' }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Proyecto fuera del alcance de la organización',
    })
  })
})

describe('PATCH /api/projects/[id]/legal-variables/[variableId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createRouteHandlerClientMock.mockReturnValue(routeClient())
    getProjectByIdMock.mockResolvedValue({
      id: 'project-1',
      organization_id: 'org-1',
    })
    microserviceFetchMock.mockResolvedValue({
      data: {
        variable_resolution_id: 'variable-1',
        state: 'approved',
        reviewed_by: 'user-1',
        reviewed_at: '2026-06-04T12:00:00Z',
        audit_event_id: 'audit-1',
      },
      error: null,
      status: 200,
    })
  })

  it('returns 401 when user is not authenticated', async () => {
    createRouteHandlerClientMock.mockReturnValue(routeClient(null))

    const response = await PATCH(buildPatchRequest({ action: 'approve' }), {
      params: Promise.resolve({ id: 'project-1', variableId: 'variable-1' }),
    })

    expect(response.status).toBe(401)
    expect(getProjectByIdMock).not.toHaveBeenCalled()
    expect(microserviceFetch).not.toHaveBeenCalled()
  })

  it('proxies variable review with project-derived organization and reviewer', async () => {
    const response = await PATCH(
      buildPatchRequest({
        action: 'approve',
        state: 'approved',
        correction_reason: 'Validado contra dominio vigente',
      }),
      { params: Promise.resolve({ id: 'project-1', variableId: 'variable-1' }) }
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      variable_resolution_id: 'variable-1',
      state: 'approved',
      reviewed_by: 'user-1',
      reviewed_at: '2026-06-04T12:00:00Z',
      audit_event_id: 'audit-1',
    })
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/legal-variables/variable-1?organization_id=org-1&project_id=project-1',
      {
        method: 'PATCH',
        body: {
          action: 'approve',
          state: 'approved',
          correction_reason: 'Validado contra dominio vigente',
          reviewed_by: 'user-1',
        },
      }
    )
  })
})
