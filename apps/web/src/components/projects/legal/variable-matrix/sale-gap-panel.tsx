'use client'

import { ShoppingCart } from 'lucide-react'
import { LEGAL_VARIABLE_GROUP_LABELS } from '@/lib/legal/variable-resolution-types'

/**
 * SDD 013 US3 — bloque informativo de los huecos de venta en el molde del
 * proyecto. A nivel proyecto estas variables NO existen como filas (las
 * aporta la venta de cada lote vía el puente operacional), por eso el panel
 * es estatico: lista los grupos que se rellenan en la venta, sin acciones.
 */

const SALE_GAP_GROUPS = ['comprador', 'transaccion', 'lote', 'servidumbre'] as const

export function SaleGapPanel() {
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
          <h3 className="text-sm font-semibold">Se completa en la venta</h3>
          <p className="text-xs text-muted-foreground">no se edita aquí · no bloquea el molde</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Estos datos se rellenan automáticamente cuando se aprueba la venta de cada lote, desde el
        registro comercial.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SALE_GAP_GROUPS.map((group) => (
          <span
            key={group}
            className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
          >
            {LEGAL_VARIABLE_GROUP_LABELS[group]}
          </span>
        ))}
      </div>
    </section>
  )
}
