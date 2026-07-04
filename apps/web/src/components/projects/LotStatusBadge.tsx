import { StatusBadge } from '@/components/ui/status-badge'

interface LotStatusBadgeProps {
  status: 'disponible' | 'reservado' | 'vendido' | 'available' | 'reserved' | 'sold' | string
  className?: string
}

const statusAliases: Record<string, 'disponible' | 'reservado' | 'vendido'> = {
  disponible: 'disponible',
  available: 'disponible',
  reservado: 'reservado',
  reserved: 'reservado',
  vendido: 'vendido',
  sold: 'vendido',
}

const statusConfig: Record<
  'disponible' | 'reservado' | 'vendido',
  { label: string; variant: 'available' | 'reserved' | 'sold' }
> = {
  disponible: { label: 'Disponible', variant: 'available' },
  reservado: { label: 'Reservado', variant: 'reserved' },
  vendido: { label: 'Vendido', variant: 'sold' },
}

/** Badge de estado de lote — envoltorio de StatusBadge con las etiquetas/alias del dominio */
export function LotStatusBadge({ status, className }: LotStatusBadgeProps) {
  const normalizedStatus = statusAliases[(status || 'disponible').toLowerCase()] ?? 'disponible'
  const { label, variant } = statusConfig[normalizedStatus]

  return (
    <StatusBadge variant={variant} className={className}>
      {label}
    </StatusBadge>
  )
}
