'use client'

import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MoldeProgress } from '@/lib/legal/variable-matrix-model'

interface MoldeProgressHeaderProps {
  progress: MoldeProgress
  projectName?: string
  scope?: 'project' | 'lot'
  onApproveMolde?: () => void
  approving?: boolean
}

export function MoldeProgressHeader({
  progress,
  projectName,
  scope = 'project',
  onApproveMolde,
  approving = false,
}: MoldeProgressHeaderProps) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.listas / progress.total) * 100)
  const subtitulo = scope === 'lot' ? 'Borrador de venta' : 'Molde del proyecto'

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
        <Button
          type="button"
          size="sm"
          disabled={!progress.moldeAprobable || approving}
          onClick={onApproveMolde}
        >
          {progress.moldeAprobable ? null : <Lock className="size-4" aria-hidden />}
          Aprobar molde
        </Button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-muted-foreground" data-testid="molde-progress-summary">
        <span className="font-medium text-foreground">{progress.listas}</span> de {progress.total}{' '}
        listas ·{' '}
        <span className={progress.porRevisar > 0 ? 'font-medium text-amber-700' : 'text-foreground'}>
          {progress.porRevisar} por revisar
        </span>{' '}
        · los huecos de venta no cuentan
      </p>
    </div>
  )
}
