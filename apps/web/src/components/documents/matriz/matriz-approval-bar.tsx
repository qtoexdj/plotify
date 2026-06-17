'use client'

import { useState } from 'react'
import { AlertTriangle, Download, FileCheck2, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  approveMatriz,
  generateMinuta,
  rejectMatriz,
  submitMatriz,
} from '@/lib/documents/matriz-client'
import type { MatrizCaseResponse, MatrizView, MinutaGeneration } from '@/lib/documents/matriz-types'

export const LEGAL_WARNING_TEXT =
  'Declaro que la matriz fue revisada y aprobada por el flujo legal; la minuta DOCX se genera desde el snapshot vigente y no reemplaza la revisión notarial final.'

export function canGenerateMinuta(matriz: MatrizView): boolean {
  return matriz.status === 'approved' && !matriz.snapshot_stale
}

type MatrizApprovalBarProps = {
  matriz: MatrizView
  onGenerated?: (generation: MinutaGeneration) => void
  onWorkflowUpdate?: (response: MatrizCaseResponse) => void
}

export function MatrizApprovalBar({
  matriz,
  onGenerated,
  onWorkflowUpdate,
}: MatrizApprovalBarProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latestGeneration, setLatestGeneration] = useState<MinutaGeneration | null>(null)

  const disabled = !canGenerateMinuta(matriz) || isGenerating
  const hasBlockers = matriz.approval_blockers.length > 0
  const canSubmit = matriz.status === 'draft' && !matriz.snapshot_stale && !hasBlockers
  const canReview = matriz.status === 'legal_review_pending' && !matriz.snapshot_stale

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)
    try {
      const generation = await generateMinuta(matriz.id, { warning_acknowledged: true })
      setLatestGeneration(generation)
      onGenerated?.(generation)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la minuta')
    } finally {
      setIsGenerating(false)
    }
  }

  async function runWorkflow(action: 'submit' | 'approve' | 'reject') {
    setIsReviewing(true)
    setError(null)
    try {
      if (action === 'submit') {
        onWorkflowUpdate?.(await submitMatriz(matriz.id))
      } else if (action === 'approve') {
        onWorkflowUpdate?.(await approveMatriz(matriz.id))
      } else {
        const reason = window.prompt('Razón de rechazo')
        if (!reason?.trim()) return
        onWorkflowUpdate?.(await rejectMatriz(matriz.id, { reason: reason.trim() }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la revisión')
    } finally {
      setIsReviewing(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="matriz-approval-bar">
      <div className="mb-4 border-b border-border pb-4">
        <p className="text-sm font-semibold">Revisión legal</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Draft → revisión pendiente → aprobada, con auditoría legal.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canSubmit || isReviewing}
            onClick={() => runWorkflow('submit')}
          >
            <Send />
            Enviar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canReview || isReviewing}
            onClick={() => runWorkflow('reject')}
          >
            <ThumbsDown />
            Rechazar
          </Button>
          <Button
            type="button"
            disabled={!canReview || isReviewing}
            onClick={() => runWorkflow('approve')}
          >
            <ThumbsUp />
            Aprobar
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Generación DOCX</p>
          <p className="text-xs text-muted-foreground">
            Disponible solo con matriz aprobada y snapshot vigente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {latestGeneration?.download_url ? (
            <Button type="button" variant="outline" asChild>
              <a href={latestGeneration.download_url}>
                <Download />
                Descargar
              </a>
            </Button>
          ) : null}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={disabled}>
                <FileCheck2 />
                {isGenerating ? 'Generando' : 'Generar minuta'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar warning legal</AlertDialogTitle>
                <AlertDialogDescription>{LEGAL_WARNING_TEXT}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleGenerate}>Confirmo y genero</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {!canGenerateMinuta(matriz) ? (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Aprueba la matriz y recarga si el expediente cambió antes de generar.</span>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
