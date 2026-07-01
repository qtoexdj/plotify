'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LegalEvidenceViewer } from '@/components/projects/legal/legal-evidence-viewer'
import { isPorRevisar, type MatrixEntry } from '@/lib/legal/variable-matrix-model'
import {
  LEGAL_VARIABLE_STATE_LABELS,
  type VariableInventoryItem,
} from '@/lib/legal/variable-resolution-types'
import { formatVariableValue } from './variable-row'

interface VariableInspectorProps {
  entry: MatrixEntry | null
  saving: boolean
  onApprove: (item: VariableInventoryItem) => void
  onEdit: (item: VariableInventoryItem) => void
  onBulkApprove: (variableKeys: string[]) => Promise<boolean> | boolean | void
  onOpenSiiDetail: () => void
}

type ApprovalDialogState = 'idle' | 'running' | 'done' | 'error'

export function VariableInspector({
  entry,
  saving,
  onApprove,
  onEdit,
  onBulkApprove,
  onOpenSiiDetail,
}: VariableInspectorProps) {
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [approvalState, setApprovalState] = useState<ApprovalDialogState>('idle')
  const [approvalProgress, setApprovalProgress] = useState(0)
  const [approvalError, setApprovalError] = useState<string | null>(null)

  useEffect(() => {
    if (approvalState !== 'running') return undefined
    const id = window.setInterval(() => {
      setApprovalProgress((current) => Math.min(current + 9, 92))
    }, 350)
    return () => window.clearInterval(id)
  }, [approvalState])

  function handleApprovalOpenChange(open: boolean) {
    if (!open && approvalState === 'running') return
    setApprovalOpen(open)
    if (!open) {
      setApprovalState('idle')
      setApprovalProgress(0)
      setApprovalError(null)
    }
  }

  if (!entry) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Selecciona una variable para ver su evidencia.
      </div>
    )
  }

  if (entry.kind === 'collapsed') {
    const startBulkApproval = async () => {
      setApprovalState('running')
      setApprovalProgress(14)
      setApprovalError(null)
      try {
        const result = await onBulkApprove(entry.variableKeys)
        if (result === false) throw new Error('No se pudieron aprobar los lotes.')
        setApprovalProgress(100)
        setApprovalState('done')
      } catch (err) {
        setApprovalState('error')
        setApprovalError(err instanceof Error ? err.message : 'No se pudieron aprobar los lotes.')
      }
    }
    const isRunning = approvalState === 'running'
    const isDone = approvalState === 'done'

    return (
      <>
        <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
          <div>
            <h3 className="text-sm font-semibold">Roles SII por lote</h3>
            <p className="text-sm text-muted-foreground">
              {entry.lotCount} lotes con unidad y pre-rol del certificado SII.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {entry.bucket === 'por_revisar' ? (
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => setApprovalOpen(true)}
              >
                Aprobar {entry.lotCount} lotes
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={onOpenSiiDetail}>
              Ver detalle por lote
            </Button>
          </div>
        </div>

        <AlertDialog open={approvalOpen} onOpenChange={handleApprovalOpenChange}>
          <AlertDialogContent className="sm:max-w-md" data-testid="bulk-approval-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle2 className="size-5 text-emerald-500" aria-hidden />
                ) : isRunning ? (
                  <Loader2 className="size-5 animate-spin text-blue-600" aria-hidden />
                ) : null}
                {isDone
                  ? 'Aprobación lista'
                  : isRunning
                    ? `Aprobando ${entry.lotCount} lotes…`
                    : `Aprobar ${entry.lotCount} lotes`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isDone
                  ? 'Los roles SII quedaron aprobados en la matriz. Ya puedes continuar con el molde.'
                  : isRunning
                    ? 'Estamos marcando los datos como revisados y actualizando la matriz.'
                    : 'Esta acción aprobará en bloque la unidad y el pre-rol SII de todos los lotes visibles.'}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Progreso de aprobación de roles SII"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={approvalProgress}
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${approvalProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {isDone
                    ? `${entry.lotCount} lotes aprobados`
                    : isRunning
                      ? 'Actualizando matriz'
                      : `${entry.variableKeys.length} variables · ${entry.lotCount} lotes`}
                </span>
                <span>{approvalProgress}%</span>
              </div>
              {approvalState === 'error' ? (
                <p className="text-xs font-medium text-destructive">
                  {approvalError ?? 'No se pudieron aprobar los lotes.'}
                </p>
              ) : null}
            </div>

            <AlertDialogFooter>
              {approvalState === 'idle' || approvalState === 'error' ? (
                <>
                  <AlertDialogCancel disabled={isRunning}>Cancelar</AlertDialogCancel>
                  <Button type="button" disabled={isRunning} onClick={startBulkApproval}>
                    Aprobar lotes
                  </Button>
                </>
              ) : isDone ? (
                <Button type="button" onClick={() => handleApprovalOpenChange(false)}>
                  Listo
                </Button>
              ) : null}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  const item = entry.item

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{item.variable_key}</span>
          <Badge variant="outline">{LEGAL_VARIABLE_STATE_LABELS[item.state]}</Badge>
        </div>
        <div className="text-base font-medium text-foreground">{formatVariableValue(item)}</div>
      </div>

      {isPorRevisar(entry) ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={saving} onClick={() => onApprove(item)}>
            Aprobar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => onEdit(item)}
          >
            Corregir
          </Button>
        </div>
      ) : null}

      <LegalEvidenceViewer evidence={item.evidence} compact />
    </div>
  )
}
