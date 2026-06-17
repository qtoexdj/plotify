import { Hammer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type { ApprovalBlocker, MatrizView } from '@/lib/documents/matriz-types'
import { PendientesList } from './pendientes-list'

/**
 * Llegada guiada (SDD 010 FR-007, wireframe 1 aprobado): el caso con
 * verificaciones bloqueadas nunca muestra una mesa parcial — muestra qué
 * falta y dónde se corrige, en lenguaje humano.
 */

/** Avance real del expediente: datos resueltos sobre datos totales. */
export function preparacionProgreso(matriz: MatrizView): number | null {
  const total = matriz.resolution.tokens.length
  if (total === 0) return null
  const resueltos = matriz.resolution.tokens.filter((token) => token.status === 'resolved').length
  return Math.round((resueltos / total) * 100)
}

export function preparacionSubtitulo(pendientes: number): string {
  if (pendientes === 1) {
    return 'Falta 1 pendiente. Resuélvelo y la mesa se abrirá lista para leer.'
  }
  return `Faltan ${pendientes} pendientes. Resuélvelos y la mesa se abrirá lista para leer.`
}

type EstadoPreparacionProps = {
  matriz: MatrizView
  blockers: ApprovalBlocker[]
}

export function EstadoPreparacion({ matriz, blockers }: EstadoPreparacionProps) {
  const progreso = preparacionProgreso(matriz)

  return (
    <section
      data-testid="estado-preparacion"
      className="rounded-lg border border-border bg-card text-card-foreground"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="min-w-0 truncate text-sm font-medium">{matriz.template.name}</p>
        <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-amber-900">
          {MESA_TEXT.preparacionEstado}
        </Badge>
      </div>

      <div className="px-6 py-6 text-center">
        <Hammer aria-hidden className="mx-auto size-6 text-muted-foreground" />
        <h2 className="mt-2 text-base font-semibold">{MESA_TEXT.preparacionTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {preparacionSubtitulo(blockers.length)}
        </p>

        {progreso !== null ? (
          <div
            role="progressbar"
            aria-valuenow={progreso}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Avance del expediente"
            className="mx-auto mt-4 h-1.5 w-full max-w-xs rounded-full bg-muted"
          >
            <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${progreso}%` }} />
          </div>
        ) : null}

        <div className="mt-5 text-left">
          <PendientesList blockers={blockers} />
        </div>
      </div>
    </section>
  )
}
