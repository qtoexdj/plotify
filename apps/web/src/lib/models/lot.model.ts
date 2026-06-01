import { EstadoLote } from '@/types/database.types'

export const ESTADO_CONFIG: Record<
  EstadoLote | 'sin_asignar',
  {
    fill: string
    stroke: string
    label: string
    bgClass: string
    textClass: string
    /** Badge classes: border + bg + text with dark variants */
    badgeClasses: string
  }
> = {
  disponible: {
    fill: '#22c55e',
    stroke: '#15803d',
    label: 'Disponible',
    bgClass: 'bg-success/10',
    textClass: 'text-success',
    badgeClasses:
      'border-success/25 bg-success/10 text-success hover:bg-success/15 dark:border-success/30 dark:bg-success/15 dark:hover:bg-success/20',
  },
  reservado: {
    fill: '#f59e0b',
    stroke: '#d97706',
    label: 'Reservado',
    bgClass: 'bg-warning/10',
    textClass: 'text-warning',
    badgeClasses:
      'border-warning/25 bg-warning/10 text-warning hover:bg-warning/15 dark:border-warning/30 dark:bg-warning/15 dark:hover:bg-warning/20',
  },
  vendido: {
    fill: '#ef4444',
    stroke: '#dc2626',
    label: 'Vendido',
    bgClass: 'bg-destructive/10',
    textClass: 'text-destructive',
    badgeClasses:
      'border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15 dark:border-destructive/30 dark:bg-destructive/15 dark:hover:bg-destructive/20',
  },
  sin_asignar: {
    fill: '#94a3b8',
    stroke: '#64748b',
    label: 'Sin asignar',
    bgClass: 'bg-muted',
    textClass: 'text-muted-foreground',
    badgeClasses: 'border-border bg-muted text-muted-foreground hover:bg-muted/80',
  },
}

/** Get the badge classes for a given estado */
export function getEstadoBadgeClasses(estado: string): string {
  return (
    ESTADO_CONFIG[estado as keyof typeof ESTADO_CONFIG]?.badgeClasses ??
    ESTADO_CONFIG.sin_asignar.badgeClasses
  )
}

export type { EstadoLote } from '@/types/database.types'
