// @vitest-environment jsdom
/**
 * SDD 010 — render del picker "Insertar dato" (T015, FR-009): abierto,
 * muestra los datos del catálogo con nombre humano agrupados por categoría.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { InsertarDatoPicker } from '@/components/documents/mesa/insertar-dato-picker'
import { INSERTABLES } from './fixtures'

afterEach(cleanup)

describe('InsertarDatoPicker (render)', () => {
  it('abierto lista los datos con su nombre humano y su categoría', () => {
    render(
      <InsertarDatoPicker
        variables={INSERTABLES}
        abierto
        onAbiertoChange={() => {}}
        onInsertar={() => {}}
      />
    )
    expect(screen.getByText('Nombre de la compradora')).toBeTruthy()
    expect(screen.getByText('Nombre del lote')).toBeTruthy()
    // Encabezados de categoría humanos.
    expect(screen.getByText('Compradora')).toBeTruthy()
    expect(screen.getByText('Lote')).toBeTruthy()
    // Ninguna clave cruda visible.
    expect(screen.queryByText(/comprador\.nombre/)).toBeNull()
  })

  it('sin variables no renderiza nada (no muestra un picker vacío)', () => {
    const { container } = render(
      <InsertarDatoPicker variables={[]} abierto onAbiertoChange={vi.fn()} onInsertar={vi.fn()} />
    )
    expect(container.textContent).toBe('')
  })
})
