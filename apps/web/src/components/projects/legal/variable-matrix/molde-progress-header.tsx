'use client'

import { ListFilter, Lock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MoldeProgress } from '@/lib/legal/variable-matrix-model'

interface MoldeProgressHeaderProps {
  progress: MoldeProgress
  projectName?: string
  scope?: 'project' | 'lot'
  onApproveMolde?: () => void
  approving?: boolean
  pendingFocus?: boolean
  onPendingFocusChange?: (active: boolean) => void
}

export function MoldeProgressHeader({
  progress,
  projectName,
  scope = 'project',
  onApproveMolde,
  approving = false,
  pendingFocus = false,
  onPendingFocusChange,
}: MoldeProgressHeaderProps) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.listas / progress.total) * 100)
  const subtitulo = scope === 'lot' ? 'Borrador de venta' : 'Molde del proyecto'
  const hasPending = progress.porRevisar > 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Matriz de variables</h2>
          <p className="text-sm text-muted-foreground">
            {subtitulo}
            {projectName ? ` · ${projectName}` : ''}
          </p>
        </div>
        <div className="flex w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
          {hasPending && onPendingFocusChange ? (
            <Button
              type="button"
              size="sm"
              variant={pendingFocus ? 'secondary' : 'outline'}
              className="min-h-10 w-full sm:w-auto"
              aria-pressed={pendingFocus}
              onClick={() => onPendingFocusChange(!pendingFocus)}
            >
              {pendingFocus ? (
                <X className="size-4" aria-hidden />
              ) : (
                <ListFilter className="size-4" aria-hidden />
              )}
              {pendingFocus ? 'Ver todas' : `Ver ${progress.porRevisar} pendientes`}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="min-h-10 w-full sm:w-auto"
            disabled={!progress.moldeAprobable || approving}
            onClick={onApproveMolde}
          >
            {progress.moldeAprobable ? null : <Lock className="size-4" aria-hidden />}
            Aprobar molde
          </Button>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-2 rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground" data-testid="molde-progress-summary">
        <span className="font-medium text-foreground">{progress.listas}</span> de {progress.total}{' '}
        listas ·{' '}
        <span className={hasPending ? 'font-medium text-amber-600' : 'text-foreground'}>
          {progress.porRevisar} por revisar
        </span>{' '}
        · los huecos de venta no cuentan
      </p>
    </div>
  )
}
