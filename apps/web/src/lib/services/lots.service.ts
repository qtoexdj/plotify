import { createClient } from '@/lib/supabase/server'
import type { Lot, LotRecord } from '@/types/database.types'

export type LotWithRecord = Lot & { lot_records: LotRecord | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLotRecord(lot: any): LotWithRecord {
  const record = Array.isArray(lot.lot_records)
    ? lot.lot_records[0] ?? null
    : lot.lot_records ?? null

  return {
    ...lot,
    lot_records: record,
  }
}

export async function getLotsWithRecords(projectId: string, filterVendorId?: string): Promise<LotWithRecord[]> {
  const supabase = await createClient()

  let query = supabase
    .from('lots')
    .select('*, lot_records (*)')
    .eq('project_id', projectId)

  if (filterVendorId) {
    query = query.eq('vendedor_id', filterVendorId)
  }

  const { data, error } = await query.order('numero_lote', { ascending: true })

  if (error) {
    console.error('Error fetching lots with records:', error)
    throw new Error('Error al obtener lotes')
  }

  const collator = new Intl.Collator('es-CL', { numeric: true, sensitivity: 'base' })

  return (data || [])
    .map(normalizeLotRecord)
    .sort((a, b) => {
      const aKey = a.numero_lote ?? ''
      const bKey = b.numero_lote ?? ''
      if (!aKey && !bKey) return 0
      if (!aKey) return 1
      if (!bKey) return -1
      return collator.compare(aKey, bKey)
    })
}

export async function updateLotAndRecord(
  lotId: string,
  lotUpdates: Partial<Lot> | null,
  recordUpdates: Partial<LotRecord> | null
): Promise<{ lot: Lot | null; record: LotRecord | null }> {
  const supabase = await createClient()

  let updatedLot: Lot | null = null
  let updatedRecord: LotRecord | null = null

  if (lotUpdates && Object.keys(lotUpdates).length > 0) {
    const { data, error } = await supabase
      .from('lots')
      .update({ ...lotUpdates, updated_at: new Date().toISOString() })
      .eq('id', lotId)
      .select()
      .single()

    if (error) {
      console.error('Error updating lot:', error)
      throw new Error('Error al actualizar lote')
    }

    updatedLot = data
  }

  if (recordUpdates && Object.keys(recordUpdates).length > 0) {
    const { data, error } = await supabase
      .from('lot_records')
      .upsert(
        {
          lot_id: lotId,
          ...recordUpdates,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'lot_id' }
      )
      .select()
      .single()

    if (error) {
      console.error('Error updating lot record:', error)
      throw new Error('Error al actualizar ficha de lote')
    }

    updatedRecord = data
  }

  return { lot: updatedLot, record: updatedRecord }
}
