import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLotsByProject } from '@/lib/services/onboarding.service'
import type { NextRequest } from 'next/server'
import { GET } from '../src/app/api/onboarding/[projectId]/lots/route'

vi.mock('@/lib/services/onboarding.service', () => ({
  getLotsByProject: vi.fn(),
}))

describe('GET /api/onboarding/[projectId]/lots', () => {
  const getLotsByProjectMock = vi.mocked(getLotsByProject)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns lots for geometry assignment', async () => {
    getLotsByProjectMock.mockResolvedValue([
      { id: 'lot-1', numero_lote: '1' },
      { id: 'lot-2', numero_lote: '2' },
    ] as Awaited<ReturnType<typeof getLotsByProject>>)

    const response = await GET(
      new Request('http://localhost/api/onboarding/project-1/lots') as NextRequest,
      {
        params: Promise.resolve({ projectId: 'project-1' }),
      }
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      lots: [
        { id: 'lot-1', numero_lote: '1' },
        { id: 'lot-2', numero_lote: '2' },
      ],
      count: 2,
    })
    expect(getLotsByProjectMock).toHaveBeenCalledWith('project-1')
  })

  it('returns a JSON error when loading lots fails', async () => {
    getLotsByProjectMock.mockRejectedValue(new Error('db unavailable'))

    const response = await GET(
      new Request('http://localhost/api/onboarding/project-1/lots') as NextRequest,
      {
        params: Promise.resolve({ projectId: 'project-1' }),
      }
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Error al obtener lotes' })
  })
})
