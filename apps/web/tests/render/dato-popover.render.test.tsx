// @vitest-environment jsdom
/**
 * SDD 010 — render del popover de evidencia (T011, FR-003): al abrir el chip
 * muestra valor, estado y la única salida de corrección (al CCL); jamás edita
 * el valor desde la mesa.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { DatoPopover } from '@/components/documents/mesa/dato-popover'
import { DatoChip } from '@/components/documents/mesa/dato-chip'

afterEach(cleanup)

describe('DatoPopover (render)', () => {
  it('al abrir muestra el dato y la corrección apunta al Centro de Control Legal', () => {
    render(
      <DatoPopover
        projectId="p1"
        variableKey="comprador.estado_civil"
        label="Estado civil de la compradora"
        estado="blocked"
        valor="Soltera"
        evidencia={[]}
        origen="Registro de venta del lote"
      >
        <DatoChip label="Estado civil de la compradora" estado="blocked" valor="Soltera" />
      </DatoPopover>
    )

    fireEvent.click(screen.getByRole('button'))

    const popover = screen.getByTestId('dato-popover')
    expect(popover.textContent).toContain('Estado civil de la compradora')
    expect(popover.textContent).toContain('Soltera')

    // La corrección sale al CCL del proyecto con la variable enfocada.
    const cta = screen.getByRole('link')
    expect(cta.getAttribute('href')).toBe('/projects/p1?tab=legal&variable=comprador.estado_civil')
  })
})
