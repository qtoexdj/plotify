
import { EstadoLote } from '@/types/database.types';

export const ESTADO_CONFIG: Record<EstadoLote | 'sin_asignar', {
    fill: string
    stroke: string
    label: string
    bgClass: string
    textClass: string
    /** Badge classes: border + bg + text with dark variants */
    badgeClasses: string
}> = {
    disponible: {
        fill: '#22c55e',
        stroke: '#15803d',
        label: 'Disponible',
        bgClass: 'bg-emerald-100',
        textClass: 'text-emerald-700',
        badgeClasses: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/30',
    },
    reservado: {
        fill: '#f59e0b',
        stroke: '#d97706',
        label: 'Reservado',
        bgClass: 'bg-amber-100',
        textClass: 'text-amber-700',
        badgeClasses: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30',
    },
    vendido: {
        fill: '#ef4444',
        stroke: '#dc2626',
        label: 'Vendido',
        bgClass: 'bg-red-100',
        textClass: 'text-red-700',
        badgeClasses: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30',
    },
    sin_asignar: {
        fill: '#94a3b8',
        stroke: '#64748b',
        label: 'Sin asignar',
        bgClass: 'bg-slate-100',
        textClass: 'text-slate-600',
        badgeClasses: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-500/20 dark:text-slate-400',
    },
}

/** Get the badge classes for a given estado */
export function getEstadoBadgeClasses(estado: string): string {
    return ESTADO_CONFIG[estado as keyof typeof ESTADO_CONFIG]?.badgeClasses ?? ESTADO_CONFIG.sin_asignar.badgeClasses
}

export type { EstadoLote } from '@/types/database.types';
