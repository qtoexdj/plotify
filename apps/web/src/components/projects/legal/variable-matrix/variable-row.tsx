'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isPorRevisar, type MatrixEntry } from '@/lib/legal/variable-matrix-model'
import type { VariableInventoryItem } from '@/lib/legal/variable-resolution-types'

/** Valor legible de una variable (texto, JSON serializado, o guion). */
export function formatVariableValue(item: VariableInventoryItem): string {
  if (item.value_text) return item.value_text
  if (item.value_json !== null && item.value_json !== undefined) {
    return JSON.stringify(item.value_json)
  }
  return '—'
}

function formatConfidence(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return ''
  return `${Math.round(confidence * 100)}%`
}

function entryLabel(entry: MatrixEntry): string {
  if (entry.kind === 'collapsed') return 'Roles SII por lote'
  return entry.item.label ?? entry.item.variable_key
}

function entryKeyText(entry: MatrixEntry): string {
  return entry.kind === 'collapsed' ? entry.variableKeys.join(' + ') : entry.item.variable_key
}

function entryValue(entry: MatrixEntry): string {
  if (entry.kind === 'collapsed') return `${entry.lotCount} lotes`
  return formatVariableValue(entry.item)
}

const BUCKET_DOT = {
  listo: 'bg-emerald-500',
  por_revisar: 'bg-amber-500',
  no_editable: 'bg-muted-foreground/40',
} as const

interface VariableRowProps {
  entry: MatrixEntry
  selected: boolean
  saving: boolean
  onSelect: (entry: MatrixEntry) => void
  onApprove: (item: VariableInventoryItem) => void
  onOpenSiiDetail: () => void
}

export function VariableRow({
  entry,
  selected,
  saving,
  onSelect,
  onApprove,
  onOpenSiiDetail,
}: VariableRowProps) {
  const canApprove = entry.kind === 'single' && isPorRevisar(entry)
  const pending = isPorRevisar(entry)
  const confidence = entry.kind === 'single' ? formatConfidence(entry.item.confidence) : ''

  return (
    <div
      data-testid="variable-row"
      data-review-bucket={entry.bucket}
      data-state={selected ? 'selected' : undefined}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(entry)
        }
      }}
      className={cn(
        'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border-t px-3 py-3 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center',
        pending
          ? 'border-t-amber-200 bg-amber-50/70 dark:border-t-amber-400/20 dark:bg-amber-950/20'
          : 'border-border',
        selected && 'bg-primary/5'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-1.5 shrink-0 rounded-full sm:mt-0',
          pending ? 'size-2.5 ring-2 ring-amber-300/50' : 'size-1.5',
          BUCKET_DOT[entry.bucket]
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{entryLabel(entry)}</div>
        <div className="truncate text-xs text-muted-foreground">{entryKeyText(entry)}</div>
      </div>
      <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">
        <div className="min-w-0 max-w-full truncate text-foreground sm:max-w-44 sm:text-right">
          {entryValue(entry)}
        </div>
        {confidence ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{confidence}</span>
        ) : null}
        {pending ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-100">
            por aprobar
          </span>
        ) : null}
        {canApprove ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-h-10 w-full sm:w-auto"
            disabled={saving}
            onClick={(event) => {
              event.stopPropagation()
              if (entry.kind === 'single') onApprove(entry.item)
            }}
          >
            Aprobar
          </Button>
        ) : entry.kind === 'collapsed' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-10 w-full sm:w-auto"
            onClick={(event) => {
              event.stopPropagation()
              onOpenSiiDetail()
            }}
          >
            Ver lotes
          </Button>
        ) : null}
      </div>
    </div>
  )
}
