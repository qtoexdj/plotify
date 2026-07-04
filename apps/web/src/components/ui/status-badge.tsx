import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors select-none',
  {
    variants: {
      variant: {
        available: 'bg-status-available/10 text-status-available',
        reserved: 'bg-status-reserved/10 text-status-reserved',
        sold: 'bg-status-sold/10 text-status-sold',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        danger: 'bg-destructive/10 text-destructive',
        info: 'bg-info/10 text-info',
        neutral: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
)

const dotVariants = cva('size-1.5 rounded-full shrink-0', {
  variants: {
    variant: {
      available: 'bg-status-available',
      reserved: 'bg-status-reserved',
      sold: 'bg-status-sold',
      success: 'bg-success',
      warning: 'bg-warning',
      danger: 'bg-destructive',
      info: 'bg-info',
      neutral: 'bg-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
})

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  children: React.ReactNode
  className?: string
}

/** Badge semántico único para estados de lote y estados genéricos — consume tokens, nunca clases crudas */
function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ variant }), className)}>
      <span className={dotVariants({ variant })} />
      {children}
    </span>
  )
}

export { StatusBadge, statusBadgeVariants }
