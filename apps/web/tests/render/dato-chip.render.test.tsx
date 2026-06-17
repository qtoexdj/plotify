// @vitest-environment jsdom
/**
 * SDD 010 — capa de tests de render (corrige la validación hueca: los demás
 * tests corren en node sobre helpers puros y nunca montan la UI). Aquí se
 * monta el componente real y se afirma comportamiento + accesibilidad.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { DatoChip } from '@/components/documents/mesa/dato-chip'

afterEach(cleanup)

describe('DatoChip (render)', () => {
  it('es un botón operable por teclado con el estado en texto, no solo color', () => {
    render(<DatoChip label="Nombre de la compradora" estado="missing" valor={null} />)
    const chip = screen.getByRole('button')
    // El hueco vacío muestra el nombre humano del dato (estado Falta).
    expect(chip.textContent).toContain('Nombre de la compradora')
    // El estado viaja en texto para lectores de pantalla (no solo color).
    expect(chip.textContent).toContain('Falta')
    expect(chip.getAttribute('data-testid')).toBe('dato-chip-falta')
  })

  it('muestra el valor real cuando el dato está verificado', () => {
    render(<DatoChip label="Precio" estado="resolved" valor="$120.000.000" />)
    const chip = screen.getByRole('button')
    expect(chip.textContent).toContain('$120.000.000')
    expect(chip.textContent).toContain('Verificado')
    expect(chip.getAttribute('data-testid')).toBe('dato-chip-verificado')
  })

  it('marca el estado por revisar con su etiqueta humana', () => {
    render(<DatoChip label="RUT" estado="blocked" valor="11.111.111-1" />)
    const chip = screen.getByRole('button')
    expect(chip.textContent).toContain('Por revisar')
    expect(chip.getAttribute('data-testid')).toBe('dato-chip-por-revisar')
  })
})
