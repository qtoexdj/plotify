import { createClient } from '../supabase/server'
import type { LotDetails } from '@/types/viewer.types'

export interface OperationLot extends LotDetails {
  project_name: string
  cliente_nombre?: string
  cliente_run?: string
  updated_at: string
  organization_id?: string
}

type OperationRecord = {
  cliente_nombre?: string | null
  cliente_run?: string | null
  etapa_proceso?: OperationLot['etapa_proceso']
  created_at?: string | null
}

type OperationProject = {
  name?: string | null
  organization_id?: string | null
}

type OperationLotRow = LotDetails & {
  updated_at: string
  projects?: OperationProject | null
  lot_records?: OperationRecord[] | null
}

export async function getAllActiveLots(organizationId?: string): Promise<OperationLot[]> {
  const supabase = await createClient()

  // 1. Fetch lots joined with projects and lot_records
  // We only want lots that are NOT 'disponible' OR have a record, basically anything "active"
  // But user asked for "manage all active lots", usually implies reserved/sold, but potentially available too?
  // "gestionar todos los lotes activos" -> usually means "inventory".
  // Let's fetch ALL lots for now, user can filter.
  // Optimization: Join with project to get name. Join with lot_records to get client info.

  const { data, error } = await supabase
    .from('lots')
    .select(
      `
            *,
            projects ( name, organization_id ),
            lot_records (
                cliente_nombre,
                cliente_run,
                etapa_proceso,
                created_at
            )
        `
    )
    .order('numero_lote', { ascending: true })

  if (error) {
    console.error('Error fetching operations lots:', error)
    return []
  }

  // Filter by organization if needed (in memory for now if not strictly enforced by RLS on lots)
  // Assuming RLS handles it, but let's be safe if projects are filtered.
  let lots = (data as OperationLotRow[]).map((lot) => {
    // Find active record (latest)
    // Sort records by created_at desc
    const records = [...(lot.lot_records || [])].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )
    const activeRecord = records[0]

    return {
      ...lot,
      project_name: lot.projects?.name || 'Sin Proyecto',
      organization_id: lot.projects?.organization_id,
      cliente_nombre: activeRecord?.cliente_nombre,
      cliente_run: activeRecord?.cliente_run,
      etapa_proceso: activeRecord?.etapa_proceso || lot.etapa_proceso, // Fallback or use record's
    } as OperationLot
  })

  if (organizationId) {
    lots = lots.filter((l) => l.organization_id === organizationId)
  }

  return lots
}
