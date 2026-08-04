'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  ArrowDown01Icon as ChevronDown,
  File02Icon as FileText,
  Layout01Icon as LayoutTemplate,
  PencilEdit02Icon as Pencil,
  PencilEdit02Icon as PenLine,
  ShoppingCart01Icon as ShoppingCart,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type {
  LegalVariableProducer,
  VariableInventoryItem,
} from '@/lib/legal/variable-resolution-types'
import {
  ACTIONABLE_PRODUCERS,
  porRevisarKeys,
  type MatrixEntry,
  type ProducerSection,
} from '@/lib/legal/variable-matrix-model'
import { VariableRow } from './variable-row'

/** Icono y subtitulo por productor (eje de la matriz). */
export const PRODUCER_META: Record<LegalVariableProducer, { icon: IconSvgElement; hint: string }> =
  {
    extracted: { icon: FileText, hint: 'la revisa el operador' },
    manual: { icon: Pencil, hint: 'del plano / Conservador' },
    authored: { icon: LayoutTemplate, hint: 'datos redactados del molde' },
    sale_gap: { icon: ShoppingCart, hint: 'se completa en la venta' },
    signing: { icon: PenLine, hint: 'datos de la notaría' },
  }

function producerDisplay(section: ProducerSection) {
  const keys = section.entries
    .map((entry) => (entry.kind === 'single' ? entry.item.variable_key : entry.variableKey))
    .filter(Boolean)

  if (
    section.producer === 'authored' &&
    keys.some((key) => key.startsWith('mandato.rectificacion_'))
  ) {
    return {
      label: 'Rectificación',
      hint: 'nombre y RUT para el mandato',
    }
  }

  return {
    label: section.label,
    hint: PRODUCER_META[section.producer].hint,
  }
}

interface ProducerGroupProps {
  section: ProducerSection
  selectedId: string | null
  savingId: string | null
  bulkSaving: boolean
  onSelect: (entry: MatrixEntry) => void
  onApprove: (item: VariableInventoryItem) => void
  onEdit: (item: VariableInventoryItem) => void
  onBulkApprove: (variableKeys: string[]) => Promise<boolean> | boolean | void
  onOpenSiiDetail: () => void
  forceOpen?: boolean
  initialOpen?: boolean
}

export function ProducerGroup({
  section,
  selectedId,
  savingId,
  bulkSaving,
  onSelect,
  onApprove,
  onEdit,
  onBulkApprove,
  onOpenSiiDetail,
  forceOpen = false,
  initialOpen = true,
}: ProducerGroupProps) {
  const [open, setOpen] = useState(initialOpen)
  const Icon = PRODUCER_META[section.producer].icon
  const display = producerDisplay(section)
  const canBulk = ACTIONABLE_PRODUCERS.includes(section.producer) && section.porRevisar > 0
  const hasPending = section.porRevisar > 0
  const hasSelected = section.entries.some((entry) => entry.id === selectedId)
  const isCollapsible = true
  const effectiveOpen = isCollapsible ? forceOpen || hasSelected || open : true
  const firstEditableItem = section.entries.find((entry) => entry.kind === 'single')?.item

  const rows = (
    <div>
      {section.entries.map((entry) => (
        <VariableRow
          key={entry.id}
          entry={entry}
          selected={selectedId === entry.id}
          saving={entry.kind === 'single' && savingId === entry.id}
          onSelect={onSelect}
          onApprove={onApprove}
          onEdit={onEdit}
          onOpenSiiDetail={onOpenSiiDetail}
        />
      ))}
    </div>
  )

  const group = (
    <section
      data-testid={`producer-group-${section.producer}`}
      data-has-pending={hasPending ? 'true' : undefined}
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-xs transition-all duration-200 overflow-hidden',
        hasPending ? 'border-warning/40 ring-1 ring-warning/20' : 'border-border/80'
      )}
    >
      <header
        className={cn(
          'grid gap-2 border-b px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
          hasPending ? 'border-warning/20 bg-warning/5' : 'border-border/60 bg-muted/20'
        )}
      >
        {isCollapsible ? (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-10 min-w-0 items-center gap-3 rounded-lg text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`${effectiveOpen ? 'Contraer' : 'Expandir'} ${display.label}`}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                  hasPending
                    ? 'bg-warning/15 text-warning ring-1 ring-warning/30'
                    : 'bg-muted/80 text-muted-foreground'
                )}
              >
                <HugeiconsIcon icon={Icon} className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
                  {display.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{display.hint}</span>
              </span>
              <HugeiconsIcon
                icon={ChevronDown}
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  effectiveOpen && 'rotate-180'
                )}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
        ) : (
          <div className="flex min-h-10 min-w-0 items-center gap-3">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                hasPending
                  ? 'bg-warning/15 text-warning ring-1 ring-warning/30'
                  : 'bg-muted/80 text-muted-foreground'
              )}
            >
              <HugeiconsIcon icon={Icon} className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                {display.label}
              </h3>
              <p className="truncate text-xs text-muted-foreground">{display.hint}</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:justify-self-end">
          {canBulk ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 text-xs font-medium px-3 min-h-8 w-full sm:w-auto"
              disabled={bulkSaving}
              onClick={() => onBulkApprove(porRevisarKeys(section))}
            >
              Aprobar {section.porRevisar} pendientes
            </Button>
          ) : null}
          {firstEditableItem ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs font-medium px-3 min-h-8 w-full sm:w-auto"
              onClick={() => onEdit(firstEditableItem)}
            >
              Editar datos
            </Button>
          ) : null}
          {!canBulk ? (
            <span
              className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                hasPending
                  ? 'border border-warning/30 bg-warning/10 text-warning'
                  : 'text-muted-foreground bg-muted/50'
              )}
            >
              {hasPending ? `${section.porRevisar} por revisar` : 'sin pendientes'}
            </span>
          ) : null}
        </div>
      </header>
      {isCollapsible ? (
        <CollapsibleContent data-testid={`producer-group-${section.producer}-content`}>
          {rows}
        </CollapsibleContent>
      ) : (
        rows
      )}
    </section>
  )

  if (!isCollapsible) return group

  return (
    <Collapsible open={effectiveOpen} onOpenChange={setOpen}>
      {group}
    </Collapsible>
  )
}
