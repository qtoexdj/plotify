'use client'

import { FileText, LayoutTemplate, Pencil, PenLine, ShoppingCart, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LegalVariableProducer, VariableInventoryItem } from '@/lib/legal/variable-resolution-types'
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
  onBulkApprove: (variableKeys: string[]) => void
  onOpenSiiDetail: () => void
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
}: ProducerGroupProps) {
  const Icon = PRODUCER_META[section.producer].icon
  const canBulk = ACTIONABLE_PRODUCERS.includes(section.producer) && section.porRevisar > 0

  return (
    <section
      data-testid={`producer-group-${section.producer}`}
      className="rounded-lg border border-border bg-card text-card-foreground"
    >
      <header className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{section.label}</h3>
          <p className="text-xs text-muted-foreground">{PRODUCER_META[section.producer].hint}</p>
        </div>
        {canBulk ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="ml-auto"
            disabled={bulkSaving}
            onClick={() => onBulkApprove(porRevisarKeys(section))}
          >
            Aprobar {section.porRevisar}
          </Button>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            {section.porRevisar > 0 ? `${section.porRevisar} por revisar` : 'sin pendientes'}
          </span>
        )}
      </header>
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
    </section>
  )
}
