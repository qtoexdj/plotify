/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { getLotsWithRecords, updateLotAndRecord } from '@/lib/services/lots.service'
import { LotEstadoTransitionError } from '@/lib/models/lot-transitions'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/services/audit.service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
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
    expect(select).toHaveBeenCalledWith('*, lot_records (*), vendors (id, nombre)')
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

  it('rechaza una transición de estado inválida sin escribir en la base (FR-018)', async () => {
    const readSingle = vi.fn().mockResolvedValue({ data: { estado: 'vendido' }, error: null })
    const readEq = vi.fn().mockReturnValue({ single: readSingle })
    const readSelect = vi.fn().mockReturnValue({ eq: readEq })
    const update = vi.fn()

    const from = vi.fn((table: string) => {
      if (table === 'lots') return { select: readSelect, update }
      throw new Error(`Unexpected table: ${table}`)
    })

    createClientMock.mockResolvedValue({ from } as any)

    await expect(updateLotAndRecord('lot-1', { estado: 'reservado' } as any, null)).rejects.toThrow(
      LotEstadoTransitionError
    )

    expect(update).not.toHaveBeenCalled()
  })

  it('libera un lote vendido: limpia reserved_at/sold_at/vendedor_id y audita (FR-018)', async () => {
    const { logAudit } = await import('@/lib/services/audit.service')

    const readSingle = vi.fn().mockResolvedValue({ data: { estado: 'vendido' }, error: null })
    const readEq = vi.fn().mockReturnValue({ single: readSingle })
    const readSelect = vi.fn().mockReturnValue({ eq: readEq })

    const updateSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 'lot-1', estado: 'disponible' }, error: null })
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle })
    const updateEq = vi.fn().mockReturnValue({ select: updateSelect })
    const update = vi.fn().mockReturnValue({ eq: updateEq })

    const from = vi.fn((table: string) => {
      if (table === 'lots') return { select: readSelect, update }
      throw new Error(`Unexpected table: ${table}`)
    })

    createClientMock.mockResolvedValue({ from } as any)

    const result = await updateLotAndRecord(
      'lot-1',
      { estado: 'disponible' } as any,
      null,
      'admin-1'
    )

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: 'disponible',
        reserved_at: null,
        sold_at: null,
        vendedor_id: null,
      })
    )
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'admin-1',
        action: 'sale.released',
        entity: 'lots',
        entity_id: 'lot-1',
      })
    )
    expect(result.lot).toEqual({ id: 'lot-1', estado: 'disponible' })
  })

  it('no-op (mismo estado) no audita ni limpia campos', async () => {
    const { logAudit } = await import('@/lib/services/audit.service')

    const readSingle = vi.fn().mockResolvedValue({ data: { estado: 'disponible' }, error: null })
    const readEq = vi.fn().mockReturnValue({ single: readSingle })
    const readSelect = vi.fn().mockReturnValue({ eq: readEq })

    const updateSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 'lot-1', estado: 'disponible' }, error: null })
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle })
    const updateEq = vi.fn().mockReturnValue({ select: updateSelect })
    const update = vi.fn().mockReturnValue({ eq: updateEq })

    const from = vi.fn((table: string) => {
      if (table === 'lots') return { select: readSelect, update }
      throw new Error(`Unexpected table: ${table}`)
    })

    createClientMock.mockResolvedValue({ from } as any)

    await updateLotAndRecord('lot-1', { estado: 'disponible' } as any, null)

    expect(update).toHaveBeenCalledWith(
      expect.not.objectContaining({ reserved_at: null, sold_at: null, vendedor_id: null })
    )
    expect(logAudit).not.toHaveBeenCalled()
  })
})
