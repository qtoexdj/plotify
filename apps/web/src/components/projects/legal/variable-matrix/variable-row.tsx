'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isPorRevisar, type MatrixEntry } from '@/lib/legal/variable-matrix-model'
import type { VariableInventoryItem } from '@/lib/legal/variable-resolution-types'
import { legalVariableDisplayLabel } from '@/lib/legal/variable-labels'

/** Valor legible de una variable (texto, resumen de JSON, o guion). */
export function formatVariableValue(item: VariableInventoryItem): string {
  if (item.value_text) return item.value_text
  if (item.value_json !== null && item.value_json !== undefined) {
    if (Array.isArray(item.value_json)) {
      if (item.variable_key === 'titulo.inscripciones[]') {
        return `${item.value_json.length} ${item.value_json.length === 1 ? 'inscripción' : 'inscripciones'}`
      }
      if (item.variable_key === 'titulo.propietarios[]') {
        return `${item.value_json.length} ${item.value_json.length === 1 ? 'propietario' : 'propietarios'}`
      }
      return `${item.value_json.length} elementos`
    }
    if (typeof item.value_json === 'object') {
      return 'Estructura configurada'
    }
    return String(item.value_json)
  }
  return '—'
}

function formatConfidence(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return ''
  return `${Math.round(confidence * 100)}%`
}

function entryLabel(entry: MatrixEntry): string {
  if (entry.kind === 'collapsed') return 'Roles SII por lote'
  return legalVariableDisplayLabel(entry.item)
}

function entryKeyText(entry: MatrixEntry): string {
  return entry.kind === 'collapsed' ? entry.variableKeys.join(' + ') : entry.item.variable_key
}

function entryValue(entry: MatrixEntry): string {
  if (entry.kind === 'collapsed') return `${entry.lotCount} lotes`
  return formatVariableValue(entry.item)
}

const BUCKET_DOT = {
  listo: 'bg-success',
  por_revisar: 'bg-warning',
  no_editable: 'bg-muted-foreground/40',
} as const

interface VariableRowProps {
  entry: MatrixEntry
  selected: boolean
  saving: boolean
  onSelect: (entry: MatrixEntry) => void
  onApprove: (item: VariableInventoryItem) => void
  onEdit?: (item: VariableInventoryItem) => void
  onOpenSiiDetail: () => void
}

export function VariableRow({
  entry,
  selected,
  saving,
  onSelect,
  onApprove,
  onEdit,
  onOpenSiiDetail,
}: VariableRowProps) {
  const canApprove = entry.kind === 'single' && isPorRevisar(entry)
  const canEdit = entry.kind === 'single'
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
        'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border-t px-3.5 py-3 text-sm transition-all duration-150 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center',
        pending ? 'border-t-warning/20 bg-warning/5 hover:bg-warning/10' : 'border-border/60',
        selected && 'bg-primary/10 ring-1 ring-inset ring-primary/30 border-l-2 border-l-primary'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-1.5 shrink-0 rounded-full sm:mt-0',
          pending ? 'size-2.5 ring-2 ring-warning/30' : 'size-1.5',
          BUCKET_DOT[entry.bucket]
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{entryLabel(entry)}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground/70">
          {entryKeyText(entry)}
        </div>
      </div>
      <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">
        <div className="min-w-0 max-w-full truncate text-sm font-medium text-foreground sm:max-w-48 sm:text-right">
          {entryValue(entry)}
        </div>
        {confidence ? (
          <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {confidence}
          </span>
        ) : null}
        {pending ? (
          <span className="shrink-0 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            por aprobar
          </span>
        ) : null}
        {canApprove ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 text-xs font-medium px-3 min-h-8 w-full sm:w-auto"
            disabled={saving}
            onClick={(event) => {
              event.stopPropagation()
              if (entry.kind === 'single') onApprove(entry.item)
            }}
          >
            Aprobar
          </Button>
        ) : null}
        {canEdit && onEdit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs font-medium px-3 min-h-8 w-full sm:w-auto"
            disabled={saving}
            onClick={(event) => {
              event.stopPropagation()
              if (entry.kind === 'single') onEdit(entry.item)
            }}
          >
            Editar
          </Button>
        ) : entry.kind === 'collapsed' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs font-medium px-3 min-h-8 w-full sm:w-auto"
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
