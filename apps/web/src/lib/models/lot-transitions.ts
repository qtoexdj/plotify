import type { EstadoLote } from '@/types/database.types'

/**
 * Máquina de estados de lots.estado (FR-018, data-model.md §2, research R9).
 * Única fuente de verdad server-side; nunca confiar en el frontend.
 */
const VALID_LOT_TRANSITIONS: Record<EstadoLote, EstadoLote[]> = {
  disponible: ['reservado', 'vendido'],
  reservado: ['vendido', 'disponible'],
  vendido: ['disponible'],
}

export function isValidLotEstadoTransition(from: EstadoLote, to: EstadoLote): boolean {
  if (from === to) return true
  return VALID_LOT_TRANSITIONS[from]?.includes(to) ?? false
}

/** Transiciones que liberan un lote (reservado/vendido -> disponible):
 * dejan obsoletos reserved_at/sold_at/vendedor_id y quedan auditadas. */
export function isReleaseTransition(from: EstadoLote, to: EstadoLote): boolean {
  return from !== to && to === 'disponible'
}

export class LotEstadoTransitionError extends Error {
  constructor(
    public readonly from: EstadoLote,
    public readonly to: EstadoLote
  ) {
    super(`Transición de estado inválida: ${from} → ${to}`)
    this.name = 'LotEstadoTransitionError'
  }
}
