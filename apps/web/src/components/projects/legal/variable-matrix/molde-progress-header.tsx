'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle02Icon as CheckCircle,
  FilterIcon as ListFilter,
  LockIcon as Lock,
  Cancel01Icon as X,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
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
      : 'Matriz de variables del proyecto'
  const hasPending = progress.porRevisar > 0
  const canUseApproveButton = !isProjectMoldeApproved && canApproveMolde

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Matriz de variables
            </h2>
            {isProjectMoldeApproved ? (
              <Badge
                variant="outline"
                className="border-success/30 bg-success/10 text-success gap-1 font-medium"
              >
                <HugeiconsIcon icon={CheckCircle} className="size-3.5" aria-hidden />
                Aprobado
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {subtitulo}
            {projectName && !isProjectMoldeApproved ? ` · ${projectName}` : ''}
          </p>
        </div>

        {/* Quick KPI stats */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5">
            <span className="text-muted-foreground">Avance:</span>
            <span className="font-semibold text-foreground">{pct}%</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-1.5 text-success">
            <span className="size-1.5 rounded-full bg-success" />
            <span className="font-medium">{progress.listas} listas</span>
          </div>
          {hasPending ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 text-warning">
              <span className="size-1.5 rounded-full bg-warning animate-pulse" />
              <span className="font-medium">{progress.porRevisar} por revisar</span>
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {hasPending && onPendingFocusChange ? (
            <Button
              type="button"
              size="sm"
              variant={pendingFocus ? 'secondary' : 'outline'}
              className="min-h-9 w-full sm:w-auto"
              aria-pressed={pendingFocus}
              onClick={() => onPendingFocusChange(!pendingFocus)}
            >
              {pendingFocus ? (
                <HugeiconsIcon icon={X} className="size-3.5" aria-hidden />
              ) : (
                <HugeiconsIcon icon={ListFilter} className="size-3.5" aria-hidden />
              )}
              {pendingFocus ? 'Ver todas' : `Ver ${progress.porRevisar} pendientes`}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="min-h-9 w-full sm:w-auto"
            disabled={!canUseApproveButton || approving}
            onClick={onApproveMolde}
          >
            {canUseApproveButton ? null : (
              <HugeiconsIcon icon={Lock} className="size-3.5" aria-hidden />
            )}
            {isProjectMoldeApproved ? 'Molde aprobado' : 'Aprobar molde'}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60" aria-hidden>
          <div
            className="h-2 rounded-full bg-success transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <p
          className="text-xs text-muted-foreground sm:text-sm"
          data-testid="molde-progress-summary"
        >
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
    </div>
  )
}
