'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const lotStatusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors select-none tracking-wide uppercase',
  {
    variants: {
      status: {
        disponible:
          'bg-success/10 text-success border-success/20 dark:bg-success/5 dark:border-success/15',
        reservado:
          'bg-warning/10 text-warning border-warning/20 dark:bg-warning/5 dark:border-warning/15',
        vendido:
          'bg-muted text-muted-foreground border-border/60 dark:bg-muted/20 dark:border-border/40',
      },
    },
    defaultVariants: {
      status: 'disponible',
    },
  }
)

const dotVariants = cva('w-1.5 h-1.5 rounded-full shrink-0', {
  variants: {
    status: {
      disponible: 'bg-success',
      reservado: 'bg-warning',
      vendido: 'bg-muted-foreground/60',
    },
  },
  defaultVariants: {
    status: 'disponible',
  },
})

interface LotStatusBadgeProps extends Omit<VariantProps<typeof lotStatusBadgeVariants>, 'status'> {
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

export function LotStatusBadge({ status, className }: LotStatusBadgeProps) {
  const normalizedStatus = statusAliases[(status || 'disponible').toLowerCase()] ?? 'disponible'

  const statusLabelMap: Record<'disponible' | 'reservado' | 'vendido', string> = {
    disponible: 'Disponible',
    reservado: 'Reservado',
    vendido: 'Vendido',
  }

  return (
    <span className={cn(lotStatusBadgeVariants({ status: normalizedStatus }), className)}>
      <span className={dotVariants({ status: normalizedStatus })} />
      {statusLabelMap[normalizedStatus]}
    </span>
  )
}
