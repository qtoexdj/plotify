/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { getLotsWithRecords, updateLotAndRecord } from '@/lib/services/lots.service'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

describe('lots.service', () => {
  const createClientMock = vi.mocked(createClient)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes lot_records array into a single record', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'lot-1',
          numero_lote: '1',
          lot_records: [{ lot_id: 'lot-1', cliente_nombre: 'Ana' }],
        },
        {
          id: 'lot-2',
          numero_lote: '2',
          lot_records: null,
        },
      ],
      error: null,
    })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })

    createClientMock.mockResolvedValue({ from } as any)

    const result = await getLotsWithRecords('project-1')

    expect(from).toHaveBeenCalledWith('lots')
    expect(select).toHaveBeenCalledWith('*, lot_records (*)')
    expect(eq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(order).toHaveBeenCalledWith('numero_lote', { ascending: true })
    expect(result[0].lot_records).toEqual({
      lot_id: 'lot-1',
      cliente_nombre: 'Ana',
    })
    expect(result[1].lot_records).toBeNull()
  })

  it('updates lot and record in sequence', async () => {
    const lotSingle = vi.fn().mockResolvedValue({ data: { id: 'lot-1' }, error: null })
    const lotSelect = vi.fn().mockReturnValue({ single: lotSingle })
    const lotEq = vi.fn().mockReturnValue({ select: lotSelect })
    const lotUpdate = vi.fn().mockReturnValue({ eq: lotEq })

    const recordSingle = vi.fn().mockResolvedValue({ data: { lot_id: 'lot-1' }, error: null })
    const recordSelect = vi.fn().mockReturnValue({ single: recordSingle })
    const recordUpsert = vi.fn().mockReturnValue({ select: recordSelect })

    const from = vi.fn((table: string) => {
      if (table === 'lots') return { update: lotUpdate }
      if (table === 'lot_records') return { upsert: recordUpsert }
      throw new Error(`Unexpected table: ${table}`)
    })

    createClientMock.mockResolvedValue({ from } as any)

    const result = await updateLotAndRecord(
      'lot-1',
      { numero_lote: '10' } as any,
      { cliente_nombre: 'Ana' } as any
    )

    expect(lotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        numero_lote: '10',
        updated_at: expect.any(String),
      })
    )
    expect(recordUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lot_id: 'lot-1',
        cliente_nombre: 'Ana',
        updated_at: expect.any(String),
      }),
      { onConflict: 'lot_id' }
    )
    expect(result).toEqual({
      lot: { id: 'lot-1' },
      record: { lot_id: 'lot-1' },
    })
  })
})
