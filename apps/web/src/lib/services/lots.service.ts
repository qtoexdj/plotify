import { createClient } from '@/lib/supabase/server'
import type { EstadoLote, Lot, LotRecord } from '@/types/database.types'
import { logAudit } from '@/lib/services/audit.service'
import {
  LotEstadoTransitionError,
  isReleaseTransition,
  isValidLotEstadoTransition,
} from '@/lib/models/lot-transitions'

export type LotWithRecord = Lot & {
  lot_records: LotRecord | null
  vendors?: { id: string; nombre: string } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLotRecord(lot: any): LotWithRecord {
  const record = Array.isArray(lot.lot_records)
    ? (lot.lot_records[0] ?? null)
    : (lot.lot_records ?? null)

  return {
    ...lot,
    lot_records: record,
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function getLotsWithRecords(
  projectId: string,
  filterVendorId?: string,
  supabaseClient?: SupabaseClient
): Promise<LotWithRecord[]> {
  const supabase = supabaseClient || (await createClient())

  let query = supabase
    .from('lots')
    .select('*, lot_records (*), vendors (id, nombre)')
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

  return (data || []).map(normalizeLotRecord).sort((a: LotWithRecord, b: LotWithRecord) => {
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
  recordUpdates: Partial<LotRecord> | null,
  actorId?: string | null
): Promise<{ lot: Lot | null; record: LotRecord | null }> {
  const supabase = await createClient()

  let updatedLot: Lot | null = null
  let updatedRecord: LotRecord | null = null

  if (lotUpdates && Object.keys(lotUpdates).length > 0) {
    let finalLotUpdates: Partial<Lot> = lotUpdates

    // FR-018 (data-model §2, research R9): validar la transición de estado
    // server-side antes de escribir. Nunca confiar en el frontend.
    if (lotUpdates.estado) {
      const { data: currentLot, error: currentLotError } = await supabase
        .from('lots')
        .select('estado')
        .eq('id', lotId)
        .single()

      if (currentLotError || !currentLot) {
        throw new Error('Lote no encontrado')
      }

      const fromEstado = currentLot.estado as EstadoLote
      const toEstado = lotUpdates.estado

      if (!isValidLotEstadoTransition(fromEstado, toEstado)) {
        throw new LotEstadoTransitionError(fromEstado, toEstado)
      }

      if (isReleaseTransition(fromEstado, toEstado)) {
        // Liberación (reservado/vendido -> disponible): limpia los campos
        // que quedarían obsoletos, salvo que el caller ya los haya fijado
        // explícitamente. Evita la inconsistencia observada (sold_at
        // seteado con estado='disponible').
        finalLotUpdates = {
          reserved_at: null,
          sold_at: null,
          vendedor_id: null,
          ...lotUpdates,
        }

        try {
          await logAudit({
            actor: actorId || 'system',
            action: fromEstado === 'vendido' ? 'sale.released' : 'reservation.released',
            entity: 'lots',
            entity_id: lotId,
            payload: { from: fromEstado, to: toEstado },
          })
        } catch (auditErr) {
          console.error('Error recording lot release audit log:', auditErr)
        }
      }
    }

    const { data, error } = await supabase
      .from('lots')
      .update({ ...finalLotUpdates, updated_at: new Date().toISOString() })
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
