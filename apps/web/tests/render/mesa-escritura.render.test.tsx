// @vitest-environment jsdom
/**
 * SDD 010 — render del orquestador de la mesa (research D7): el branching
 * preparación vs mesa se afirma montando la UI real, no solo el helper puro.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { MesaEscritura } from '@/components/documents/mesa/mesa-escritura'
import { caseResponse, clausula, matrizWith, GATE_BLOCKER, DATO_BLOCKER } from './fixtures'

afterEach(cleanup)

describe('MesaEscritura (render)', () => {
  it('con verificación bloqueada muestra la llegada guiada, nunca una mesa parcial', () => {
    const data = caseResponse(matrizWith([GATE_BLOCKER]))
    render(<MesaEscritura caseId="c1" initialData={data} />)

    // Estado de preparación visible; el documento no se monta.
    expect(screen.getByTestId('mesa-escritura')).toBeTruthy()
    expect(screen.queryByTestId('mesa-documento')).toBeNull()
    // El pendiente se muestra con su título humano, no con el código del gate.
    expect(screen.getByText(GATE_BLOCKER.title!)).toBeTruthy()
    expect(screen.queryByText(/title_verified/)).toBeNull()
  })

  it('sin verificaciones bloqueadas monta la mesa completa con el documento', () => {
    const matriz = matrizWith([DATO_BLOCKER], [clausula({ clause_key: 'objeto' })])
    render(<MesaEscritura caseId="c1" initialData={caseResponse(matriz)} />)

    expect(screen.getByTestId('mesa-documento')).toBeTruthy()
    // El título de la cláusula se renderiza en el documento.
    expect(screen.getAllByText(/OBJETO/i).length).toBeGreaterThan(0)
  })
})
