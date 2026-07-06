// @vitest-environment jsdom
/**
 * SDD 010 — render del orquestador de la mesa (research D7): el branching
 * preparación vs mesa se afirma montando la UI real, no solo el helper puro.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { MesaEscritura } from '@/components/documents/mesa/mesa-escritura'
import { PanelDatos } from '@/components/documents/mesa/panel-datos'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type { TokenResolution } from '@/lib/documents/matriz-types'
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

describe('MesaIndice: interruptor de activar/desactivar cláusula', () => {
  it('desactiva una cláusula movible desde el índice y la refleja como tachada', () => {
    const matriz = matrizWith(
      [],
      [
        clausula({ clause_key: 'comparecencia', fixed_position: true }),
        clausula({ clause_key: 'objeto' }),
      ]
    )
    render(<MesaEscritura caseId="c1" initialData={caseResponse(matriz)} />)

    const filaObjeto = screen.getByTestId('mesa-indice-objeto')
    const botonDesactivar = within(filaObjeto).getByLabelText(MESA_TEXT.desactivarClausula)
    fireEvent.click(botonDesactivar)

    expect(within(filaObjeto).getByText(MESA_TEXT.clausulaDesactivada)).toBeTruthy()
    expect(within(filaObjeto).getByLabelText(MESA_TEXT.reactivarClausula)).toBeTruthy()
  })

  it('no permite desactivar una cláusula de posición fija', () => {
    const matriz = matrizWith([], [clausula({ clause_key: 'comparecencia', fixed_position: true })])
    render(<MesaEscritura caseId="c1" initialData={caseResponse(matriz)} />)

    const filaComparecencia = screen.getByTestId('mesa-indice-comparecencia')
    const boton = within(filaComparecencia).getByLabelText(
      MESA_TEXT.desactivarClausula
    ) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
  })
})

describe('PanelDatos', () => {
  it('permite contraer y expandir los grupos de datos', () => {
    const token: TokenResolution = {
      variableKey: 'comprador.nombre',
      label: 'Nombre comprador',
      status: 'missing',
      value_text: null,
      state: null,
      source_type: null,
      producer: 'sale_gap',
      evidence_refs: [],
    }

    render(
      <PanelDatos
        resolucion={{ tokens: [token], blocks: [], missing_count: 1 }}
        projectId="p1"
        scope="project"
      />
    )

    const group = screen.getByTestId('panel-datos-grupo-venta')
    expect(group.getAttribute('data-state')).toBe('open')
    fireEvent.click(screen.getByRole('button', { name: 'Contraer Se completa en la venta' }))
    expect(group.getAttribute('data-state')).toBe('closed')
    expect(screen.getByRole('button', { name: 'Expandir Se completa en la venta' })).toBeTruthy()
  })
})
