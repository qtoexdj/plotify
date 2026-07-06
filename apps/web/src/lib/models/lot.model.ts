import { EstadoLote } from '@/types/database.types'
import { LOT_COLORS } from '@/lib/map/lot-colors'

export const ESTADO_CONFIG: Record<
  EstadoLote | 'sin_asignar',
  {
    fill: string
    stroke: string
    label: string
  }
> = {
  disponible: { ...LOT_COLORS.disponible, label: 'Disponible' },
  reservado: { ...LOT_COLORS.reservado, label: 'Reservado' },
  vendido: { ...LOT_COLORS.vendido, label: 'Vendido' },
  sin_asignar: { ...LOT_COLORS.sin_asignar, label: 'Sin asignar' },
}

/** Mapea un estado de lote a la variante de StatusBadge correspondiente */
export function estadoToStatusVariant(
  estado: string
): 'available' | 'reserved' | 'sold' | 'neutral' {
  switch (estado) {
    case 'disponible':
      return 'available'
    case 'reservado':
      return 'reserved'
    case 'vendido':
      return 'sold'
    default:
      return 'neutral'
  }
}

export type { EstadoLote } from '@/types/database.types'
