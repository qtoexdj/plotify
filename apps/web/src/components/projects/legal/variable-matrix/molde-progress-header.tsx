'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  FilterIcon as ListFilter,
  LockIcon as Lock,
  Cancel01Icon as X,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import type { MoldeProgress } from '@/lib/legal/variable-matrix-model'

interface MoldeProgressHeaderProps {
  progress: MoldeProgress
  projectName?: string
  scope?: 'project' | 'lot'
  onApproveMolde?: () => void
  canApproveMolde?: boolean
  approved?: boolean
  approving?: boolean
  pendingFocus?: boolean
  onPendingFocusChange?: (active: boolean) => void
}

export function MoldeProgressHeader({
  progress,
  projectName,
  scope = 'project',
  onApproveMolde,
  canApproveMolde = progress.moldeAprobable,
  approved = false,
  approving = false,
  pendingFocus = false,
  onPendingFocusChange,
}: MoldeProgressHeaderProps) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.listas / progress.total) * 100)
  const isProjectMoldeApproved = scope === 'project' && approved
  const subtitulo = isProjectMoldeApproved
    ? 'Molde aprobado · esperando ventas'
    : scope === 'lot'
      ? 'Borrador de venta'
      : 'Molde del proyecto'
  const hasPending = progress.porRevisar > 0
  const canUseApproveButton = !isProjectMoldeApproved && canApproveMolde

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Matriz de variables</h2>
          <p className="text-sm text-muted-foreground">
            {subtitulo}
            {projectName && !isProjectMoldeApproved ? ` · ${projectName}` : ''}
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
                <HugeiconsIcon icon={X} className="size-4" aria-hidden />
              ) : (
                <HugeiconsIcon icon={ListFilter} className="size-4" aria-hidden />
              )}
              {pendingFocus ? 'Ver todas' : `Ver ${progress.porRevisar} pendientes`}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="min-h-10 w-full sm:w-auto"
            disabled={!canUseApproveButton || approving}
            onClick={onApproveMolde}
          >
            {canUseApproveButton ? null : (
              <HugeiconsIcon icon={Lock} className="size-4" aria-hidden />
            )}
            {isProjectMoldeApproved ? 'Molde aprobado' : 'Aprobar molde'}
          </Button>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-2 rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-muted-foreground" data-testid="molde-progress-summary">
        {isProjectMoldeApproved ? (
          'Molde listo. Los datos de venta se completarán cuando llegue una venta.'
        ) : (
          <>
            <span className="font-medium text-foreground">{progress.listas}</span> de{' '}
            {progress.total} listas ·{' '}
            <span className={hasPending ? 'font-medium text-warning' : 'text-foreground'}>
              {progress.porRevisar} por revisar
            </span>{' '}
            ·{' '}
            {hasPending
              ? 'completa las variables del molde; los huecos de venta no bloquean'
              : 'los huecos de venta no cuentan'}
          </>
        )}
      </p>
    </div>
  )
}
