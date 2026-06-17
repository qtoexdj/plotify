'use client'

import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { datoStatusLabel } from '@/lib/documents/matriz-microcopy'
import type { TokenResolutionStatus } from '@/lib/documents/matriz-types'

/**
 * Chip inline de dato (SDD 010 T011, FR-002, ui-contracts §4): estado en
 * español con contraste AA, operable por teclado (es un botón nativo) y
 * pensado como trigger del popover de evidencia. El estado viaja también en
 * texto para lectores de pantalla, nunca solo en color.
 */

export const DATO_CHIP_TESTID = {
  resolved: 'dato-chip-verificado',
  blocked: 'dato-chip-por-revisar',
  missing: 'dato-chip-falta',
} as const satisfies Record<TokenResolutionStatus, string>

const CLASES_CHIP = {
  resolved: 'bg-emerald-50 text-emerald-900 ring-emerald-300 hover:bg-emerald-100',
  blocked: 'bg-sky-50 text-sky-900 ring-sky-300 hover:bg-sky-100',
  missing: 'bg-amber-50 text-amber-900 ring-amber-300 hover:bg-amber-100',
} as const satisfies Record<TokenResolutionStatus, string>

/**
 * Qué muestra el chip: el valor real cuando existe; el nombre humano del
 * dato cuando el hueco está vacío (ui-contracts §4, estado Falta).
 */
export function textoDelChip(segmento: {
  estado: TokenResolutionStatus
  valor: string | null
  label: string
}): string {
  if (segmento.estado === 'missing') return segmento.label
  return segmento.valor || segmento.label
}

type DatoChipProps = {
  label: string
  estado: TokenResolutionStatus
  valor: string | null
} & Omit<ComponentProps<'button'>, 'children'>

export function DatoChip({ label, estado, valor, className, ...props }: DatoChipProps) {
  return (
    <button
      type="button"
      data-testid={DATO_CHIP_TESTID[estado]}
      className={cn(
        'cursor-pointer rounded px-1 py-0.5 font-sans text-[0.85em] ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current',
        CLASES_CHIP[estado],
        className
      )}
      {...props}
    >
      {textoDelChip({ estado, valor, label })}
      <span className="sr-only"> ({datoStatusLabel(estado)})</span>
    </button>
  )
}
