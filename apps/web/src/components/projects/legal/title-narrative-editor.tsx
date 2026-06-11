'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { updateTitleNarrative } from '@/lib/legal/title-client'
import type { BlockCheck, TitleNarrative, TitleNarrativeEditPayload } from '@/lib/legal/title-types'
import { cn } from '@/lib/utils'

export type NarrativeBlockKey = 'comparecencia' | 'primero'

export const NARRATIVE_BLOCK_LABELS: Record<NarrativeBlockKey, string> = {
  comparecencia: 'Comparecencia',
  primero: 'Cláusula PRIMERO',
}

export const BLOCK_CHECK_MOTIVO_LABELS: Record<string, string> = {
  numero_sin_respaldo_verificado: 'Número sin respaldo verificado',
  fecha_sin_respaldo_verificado: 'Fecha sin respaldo verificado',
  nombre_sin_respaldo_verificado: 'Nombre sin respaldo verificado',
  no_redactado_por_el_agente: 'El agente no redactó este bloque',
}

export function formatBlockCheckMotivo(motivo: string): string {
  return BLOCK_CHECK_MOTIVO_LABELS[motivo] ?? motivo
}

/**
 * A narrative edit can be saved only with non-empty edited text, a non-empty
 * reason, and text that differs from the currently effective version.
 */
export function canSaveNarrativeEdit(input: {
  editedText: string
  reason: string
  effectiveText: string | null
}): boolean {
  const edited = input.editedText.trim()
  const reason = input.reason.trim()
  return edited.length > 0 && reason.length > 0 && edited !== (input.effectiveText ?? '').trim()
}

export interface NarrativeDiffLine {
  kind: 'same' | 'removed' | 'added'
  text: string
}

/**
 * Simple line-level diff between the generated and the edited narrative:
 * unchanged lines once, removed (generated-only) and added (edited-only)
 * lines marked. Sufficient for the "diferencias" toggle.
 */
export function narrativeDiffLines(
  generated: string | null,
  edited: string | null
): NarrativeDiffLine[] {
  const generatedLines = (generated ?? '').split('\n')
  const editedLines = (edited ?? '').split('\n')
  const editedSet = new Set(editedLines)
  const generatedSet = new Set(generatedLines)

  const lines: NarrativeDiffLine[] = []
  for (const line of generatedLines) {
    lines.push(editedSet.has(line) ? { kind: 'same', text: line } : { kind: 'removed', text: line })
  }
  for (const line of editedLines) {
    if (!generatedSet.has(line)) {
      lines.push({ kind: 'added', text: line })
    }
  }
  return lines
}

interface BlockEditorProps {
  block: NarrativeBlockKey
  generated: string | null
  edited: string | null
  effective: string | null
  disabled: boolean
  pendingNotice: boolean
  blockCheck?: BlockCheck | null
  onSave: (payload: TitleNarrativeEditPayload) => Promise<string | null>
}

function BlockEditor({
  block,
  generated,
  edited,
  effective,
  disabled,
  pendingNotice,
  blockCheck,
  onSave,
}: BlockEditorProps) {
  const [draft, setDraft] = useState(edited ?? effective ?? '')
  const [showDiff, setShowDiff] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    const failure = await onSave({ block, edited_text: draft.trim(), reason: reason.trim() })
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    setReason('')
    setReasonOpen(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {pendingNotice && (
        <p className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-600 dark:text-amber-400">
          Hay datos subyacentes pendientes de revisión; el texto generado puede estar incompleto.
        </p>
      )}
      {blockCheck && !blockCheck.ok && (
        <div
          className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400"
          data-testid={`block-check-issues-${block}`}
        >
          <p className="font-medium">
            Este bloque requiere revisión manual; hechos sin calce contra la cadena verificada:
          </p>
          <ul className="mt-1 list-disc pl-4">
            {blockCheck.issues.map((issue, index) => (
              <li key={`${issue.motivo}-${index}`}>
                {formatBlockCheckMotivo(issue.motivo)}: “{issue.hecho}”
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Texto generado
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setShowDiff((current) => !current)}
          >
            {showDiff ? 'Ocultar diferencias' : 'Diferencias'}
          </Button>
        </div>
        {showDiff ? (
          <div
            className="mt-1 rounded-md border border-border bg-muted/10 p-2 font-mono text-[11px]"
            data-testid={`narrative-diff-${block}`}
          >
            {narrativeDiffLines(generated, draft).map((line, index) => (
              <p
                key={`${line.kind}-${index}`}
                className={cn(
                  'whitespace-pre-wrap',
                  line.kind === 'removed' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                  line.kind === 'added' &&
                    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                )}
              >
                {line.kind === 'removed' ? '− ' : line.kind === 'added' ? '+ ' : '  '}
                {line.text}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/10 p-2 text-xs text-muted-foreground">
            {generated ?? 'Sin texto generado (datos pendientes de verificación).'}
          </p>
        )}
      </div>
      <div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Texto editado
        </span>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={disabled}
          rows={6}
          className="mt-1 text-xs"
          aria-label={`Editar ${NARRATIVE_BLOCK_LABELS[block]}`}
        />
      </div>
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center justify-between">
        {edited ? (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Editado por abogado
          </Badge>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          disabled={
            disabled ||
            !canSaveNarrativeEdit({ editedText: draft, reason: 'x', effectiveText: effective })
          }
          onClick={() => setReasonOpen(true)}
        >
          Guardar edición
        </Button>
      </div>

      <Dialog open={reasonOpen} onOpenChange={setReasonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo de la edición</DialogTitle>
            <DialogDescription>
              Toda edición del bloque {NARRATIVE_BLOCK_LABELS[block]} queda auditada con su motivo,
              autor y fecha.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej: Ajuste de redacción notarial"
            rows={3}
            aria-label="Motivo de la edición"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setReasonOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                saving ||
                !canSaveNarrativeEdit({ editedText: draft, reason, effectiveText: effective })
              }
              onClick={handleConfirm}
            >
              {saving ? 'Guardando…' : 'Confirmar edición'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface TitleNarrativeEditorProps {
  projectId: string
  analysisId: string
  narrative: TitleNarrative | null
  disabled?: boolean
  pendingPaths?: string[]
  blockChecks?: Record<string, BlockCheck> | null
  onSaved?: (narrative: TitleNarrative) => void
}

export function TitleNarrativeEditor({
  projectId,
  analysisId,
  narrative,
  disabled = false,
  pendingPaths = [],
  blockChecks = null,
  onSaved,
}: TitleNarrativeEditorProps) {
  const handleSave = async (payload: TitleNarrativeEditPayload): Promise<string | null> => {
    const { data, error } = await updateTitleNarrative(projectId, analysisId, payload)
    if (error || !data) {
      return error?.message ?? 'Error al guardar la edición'
    }
    onSaved?.(data)
    return null
  }

  const hasOwnerPending = pendingPaths.some((path) => path.startsWith('propietarios_actuales'))
  const hasChainPending = pendingPaths.some(
    (path) => path.startsWith('inscripciones') || path.startsWith('property_identity')
  )

  return (
    <Tabs defaultValue="comparecencia">
      <TabsList>
        <TabsTrigger value="comparecencia">{NARRATIVE_BLOCK_LABELS.comparecencia}</TabsTrigger>
        <TabsTrigger value="primero">{NARRATIVE_BLOCK_LABELS.primero}</TabsTrigger>
      </TabsList>
      <TabsContent value="comparecencia">
        <BlockEditor
          block="comparecencia"
          generated={narrative?.comparecencia?.generated ?? null}
          edited={narrative?.comparecencia?.edited ?? null}
          effective={narrative?.comparecencia?.effective ?? null}
          disabled={disabled}
          pendingNotice={hasOwnerPending}
          blockCheck={blockChecks?.comparecencia ?? null}
          onSave={handleSave}
        />
      </TabsContent>
      <TabsContent value="primero">
        <BlockEditor
          block="primero"
          generated={narrative?.primero?.generated ?? null}
          edited={narrative?.primero?.edited ?? null}
          effective={narrative?.primero?.effective ?? null}
          disabled={disabled}
          pendingNotice={hasChainPending}
          blockCheck={blockChecks?.primero ?? null}
          onSave={handleSave}
        />
      </TabsContent>
    </Tabs>
  )
}
