/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { updateLotAndRecord } from '@/lib/services/lots.service'
import { PATCH } from '../src/app/api/projects/[id]/lots/[lotId]/route'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/services/lots.service', () => ({
  updateLotAndRecord: vi.fn(),
}))

describe('PATCH /api/projects/[id]/lots/[lotId]', () => {
  const createClientMock = vi.mocked(createClient)
  const updateLotAndRecordMock = vi.mocked(updateLotAndRecord)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const buildRequest = (payload: unknown) =>
    new Request('http://localhost/api/projects/project-1/lots/lot-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

  it('returns 401 when user is not authenticated', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any)

    const response = await PATCH(buildRequest({}), {
      params: Promise.resolve({ id: 'project-1', lotId: 'lot-1' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 400 when payload is invalid', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    } as any)

    const response = await PATCH(buildRequest({ record: { cliente_email: 'not-an-email' } }), {
      params: Promise.resolve({ id: 'project-1', lotId: 'lot-1' }),
    })

    expect(response.status).toBe(400)
    expect(updateLotAndRecordMock).not.toHaveBeenCalled()
  })

  it('coerces numeric fields and forwards updates', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    } as any)

    updateLotAndRecordMock.mockResolvedValue({
      lot: { id: 'lot-1' },
      record: { lot_id: 'lot-1' },
    } as any)

    const response = await PATCH(
      buildRequest({
        lot: { numero_lote: '12' },
        record: { valor: '12000', cliente_email: 'test@example.com' },
      }),
      { params: Promise.resolve({ id: 'project-1', lotId: 'lot-1' }) }
    )

    expect(response.status).toBe(200)
    expect(updateLotAndRecordMock).toHaveBeenCalledTimes(1)
    const [lotId, lotUpdates, recordUpdates] = updateLotAndRecordMock.mock.calls[0]

    expect(lotId).toBe('lot-1')
    expect(lotUpdates).toEqual(expect.objectContaining({ numero_lote: '12' }))
    expect(recordUpdates).toEqual(
      expect.objectContaining({ valor: 12000, cliente_email: 'test@example.com' })
    )
  })
})
