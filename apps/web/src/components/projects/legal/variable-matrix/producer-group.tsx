'use client'

import { useState } from 'react'
import {
  ChevronDown,
  FileText,
  LayoutTemplate,
  Pencil,
  PenLine,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react'
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
export const PRODUCER_META: Record<LegalVariableProducer, { icon: LucideIcon; hint: string }> = {
  extracted: { icon: FileText, hint: 'la revisa el operador' },
  manual: { icon: Pencil, hint: 'del plano / Conservador' },
  authored: { icon: LayoutTemplate, hint: 'usa plantilla de la organización' },
  sale_gap: { icon: ShoppingCart, hint: 'se completa en la venta' },
  signing: { icon: PenLine, hint: 'datos de la notaría' },
}

interface ProducerGroupProps {
  section: ProducerSection
  selectedId: string | null
  savingId: string | null
  bulkSaving: boolean
  onSelect: (entry: MatrixEntry) => void
  onApprove: (item: VariableInventoryItem) => void
  onBulkApprove: (variableKeys: string[]) => Promise<boolean> | boolean | void
  onOpenSiiDetail: () => void
  forceOpen?: boolean
}

export function ProducerGroup({
  section,
  selectedId,
  savingId,
  bulkSaving,
  onSelect,
  onApprove,
  onBulkApprove,
  onOpenSiiDetail,
  forceOpen = false,
}: ProducerGroupProps) {
  const [open, setOpen] = useState(true)
  const Icon = PRODUCER_META[section.producer].icon
  const canBulk = ACTIONABLE_PRODUCERS.includes(section.producer) && section.porRevisar > 0
  const hasPending = section.porRevisar > 0
  const isCollapsible = section.producer === 'extracted' || section.producer === 'manual'
  const effectiveOpen = isCollapsible ? forceOpen || open : true

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
        'rounded-lg border bg-card text-card-foreground transition-colors',
        hasPending
          ? 'border-amber-300 shadow-sm shadow-amber-500/10 dark:border-amber-400/40'
          : 'border-border'
      )}
    >
      <header
        className={cn(
          'grid gap-2 border-b px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
          hasPending
            ? 'border-amber-200 bg-amber-50/80 dark:border-amber-400/20 dark:bg-amber-950/20'
            : 'border-border'
        )}
      >
        {isCollapsible ? (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-md text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`${effectiveOpen ? 'Contraer' : 'Expandir'} ${section.label}`}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-md',
                  hasPending
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{section.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {PRODUCER_META[section.producer].hint}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  effectiveOpen && 'rotate-180'
                )}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
        ) : (
          <div className="flex min-h-11 min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-md',
                hasPending
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{section.label}</h3>
              <p className="truncate text-xs text-muted-foreground">
                {PRODUCER_META[section.producer].hint}
              </p>
            </div>
          </div>
        )}
        {canBulk ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-h-10 w-full sm:w-auto"
            disabled={bulkSaving}
            onClick={() => onBulkApprove(porRevisarKeys(section))}
          >
            Aprobar {section.porRevisar} pendientes
          </Button>
        ) : (
          <span
            className={cn(
              'text-xs sm:justify-self-end',
              hasPending
                ? 'font-medium text-amber-700 dark:text-amber-200'
                : 'text-muted-foreground'
            )}
          >
            {hasPending ? `${section.porRevisar} por revisar` : 'sin pendientes'}
          </span>
        )}
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
