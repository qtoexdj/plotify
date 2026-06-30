'use client'

import { ShoppingCart } from 'lucide-react'
import type { ProducerSection } from '@/lib/legal/variable-matrix-model'

/** Bloque informativo de los huecos de venta: no se editan en el molde. */
export function SaleGapPanel({ section }: { section: ProducerSection }) {
  return (
    <section
      data-testid="sale-gap-panel"
      className="rounded-lg border border-dashed border-border bg-muted/30 p-4"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-background text-muted-foreground">
          <ShoppingCart className="size-4" aria-hidden />
        </span>
        <div>
          <h3 className="text-sm font-semibold">{section.label}</h3>
          <p className="text-xs text-muted-foreground">no se edita aquí</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Comprador, precio, lote y servidumbre se rellenan automáticamente cuando se aprueba la venta
        de cada lote.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {section.entries.slice(0, 10).map((entry) => (
          <span
            key={entry.id}
            className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
          >
            {entry.kind === 'single' ? entry.item.variable_key : entry.variableKey}
          </span>
        ))}
      </div>
    </section>
  )
}
