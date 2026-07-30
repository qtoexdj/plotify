/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, createServiceClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createServiceClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
  createServiceClient: createServiceClientMock,
}))

import { GET } from '@/app/api/files/[fileId]/route'

const FILE_ID = '1e4e2ad7-88f3-498d-a620-e3b0a81faa52'

function chain(result: unknown) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  return query
}

function request(path: string) {
  return new NextRequest(`http://localhost${path}`)
}

describe('GET /api/files/[fileId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: vi.fn(() => chain({ data: { role: 'admin' } })),
    })

    createServiceClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        expect(table).toBe('project_file_objects')
        return chain({
          data: {
            organization_id: 'org-1',
            project_id: 'project-1',
            bucket: 'project-files',
            object_path: `project-1/${FILE_ID}`,
            original_filename: 'Dominio.pdf',
            content_type: 'application/pdf',
            visibility: 'admin_only',
            status: 'ready',
          },
        })
      }),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn().mockResolvedValue({
            data: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
            error: null,
          }),
        })),
      },
    })
  })

  it('serves authorized PDF previews inline', async () => {
    const response = await GET(request(`/api/files/${FILE_ID}?preview=1`), {
      params: Promise.resolve({ fileId: FILE_ID }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toBe('inline; filename="Dominio.pdf"')
  })

  it('keeps the default response as an attachment for downloads', async () => {
    const response = await GET(request(`/api/files/${FILE_ID}`), {
      params: Promise.resolve({ fileId: FILE_ID }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="Dominio.pdf"')
  })
})
