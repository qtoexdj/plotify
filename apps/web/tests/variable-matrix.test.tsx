// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MoldeProgressHeader } from '@/components/projects/legal/variable-matrix/molde-progress-header'
import { ProducerGroup } from '@/components/projects/legal/variable-matrix/producer-group'
import { SaleGapPanel } from '@/components/projects/legal/variable-matrix/sale-gap-panel'
import { groupByProducer } from '@/lib/legal/variable-matrix-model'
import type {
  LegalVariableGroup,
  LegalVariableProducer,
  LegalVariableState,
  VariableInventoryItem,
} from '@/lib/legal/variable-resolution-types'

let seq = 0
function mk(
  overrides: Partial<VariableInventoryItem> & {
    variable_key: string
    producer: LegalVariableProducer
    state: LegalVariableState
  }
): VariableInventoryItem {
  seq += 1
  return {
    id: `v${seq}`,
    lot_id: null,
    escritura_case_id: null,
    variable_group: 'matriz' as LegalVariableGroup,
    value_text: null,
    value_json: null,
    source_type: 'document',
    confidence: null,
    approval_required: false,
    correction_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    evidence: [],
    ...overrides,
  }
}

afterEach(cleanup)

describe('MoldeProgressHeader', () => {
  it('muestra el conteo por revisar y deshabilita "Aprobar molde" si no es aprobable', () => {
    render(
      <MoldeProgressHeader
        progress={{ porRevisar: 13, listas: 21, total: 34, moldeAprobable: false }}
        projectName="Teno"
      />
    )
    const summary = screen.getByTestId('molde-progress-summary')
    expect(summary.textContent).toMatch(/21 de 34 listas/)
    expect(summary.textContent).toMatch(/13 por revisar/)
    const button = screen.getByRole('button', { name: /Aprobar molde/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('habilita "Aprobar molde" cuando no quedan pendientes', () => {
    render(
      <MoldeProgressHeader
        progress={{ porRevisar: 0, listas: 5, total: 5, moldeAprobable: true }}
      />
    )
    const button = screen.getByRole('button', { name: /Aprobar molde/ }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('en scope lote rotula el subtitulo como "Borrador de venta"', () => {
    render(
      <MoldeProgressHeader
        progress={{ porRevisar: 0, listas: 3, total: 3, moldeAprobable: true }}
        scope="lot"
      />
    )
    expect(screen.getByText(/Borrador de venta/)).toBeTruthy()
  })
})

describe('ProducerGroup', () => {
  function extractedSection() {
    const items: VariableInventoryItem[] = [
      mk({ variable_key: 'vendedor.nombre', variable_group: 'vendedor', producer: 'extracted', state: 'proposed', value_text: 'JUAN DE DIOS GALAZ ABARCA' }),
      mk({ variable_key: 'vendedor.rut', variable_group: 'vendedor', producer: 'extracted', state: 'approved', value_text: '4.606.965-2' }),
    ]
    for (let lot = 1; lot <= 3; lot += 1) {
      items.push(
        mk({ variable_key: 'sii.unidad_nombre', variable_group: 'sii', producer: 'extracted', state: 'proposed', lot_id: `lot${lot}` })
      )
    }
    return groupByProducer(items)[0]
  }

  it('renderiza la seccion con su conteo, valores y la entrada SII colapsada', () => {
    render(
      <ProducerGroup
        section={extractedSection()}
        selectedId={null}
        savingId={null}
        bulkSaving={false}
        onSelect={() => {}}
        onApprove={() => {}}
        onBulkApprove={() => {}}
        onOpenSiiDetail={() => {}}
      />
    )
    expect(screen.getByText('Extraída')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aprobar 2' })).toBeTruthy()
    expect(screen.getByText('JUAN DE DIOS GALAZ ABARCA')).toBeTruthy()
    expect(screen.getByText('Roles SII por lote')).toBeTruthy()
    expect(screen.getByText('3 lotes')).toBeTruthy()
  })

  it('"Aprobar" solo aparece en las filas por revisar y dispara onApprove', () => {
    const onApprove = vi.fn()
    render(
      <ProducerGroup
        section={extractedSection()}
        selectedId={null}
        savingId={null}
        bulkSaving={false}
        onSelect={() => {}}
        onApprove={onApprove}
        onBulkApprove={() => {}}
        onOpenSiiDetail={() => {}}
      />
    )
    const approveButtons = screen.getAllByRole('button', { name: 'Aprobar' })
    expect(approveButtons).toHaveLength(1) // solo vendedor.nombre (proposed); rut esta aprobado
    fireEvent.click(approveButtons[0])
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('el boton "Aprobar N" de la seccion dispara onBulkApprove con las claves por revisar', () => {
    const onBulkApprove = vi.fn()
    render(
      <ProducerGroup
        section={extractedSection()}
        selectedId={null}
        savingId={null}
        bulkSaving={false}
        onSelect={() => {}}
        onApprove={() => {}}
        onBulkApprove={onBulkApprove}
        onOpenSiiDetail={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar 2' }))
    expect(onBulkApprove).toHaveBeenCalledWith(['vendedor.nombre', 'sii.unidad_nombre'])
  })

  it('"Ver lotes" en la entrada colapsada dispara onOpenSiiDetail', () => {
    const onOpenSiiDetail = vi.fn()
    render(
      <ProducerGroup
        section={extractedSection()}
        selectedId={null}
        savingId={null}
        bulkSaving={false}
        onSelect={() => {}}
        onApprove={() => {}}
        onBulkApprove={() => {}}
        onOpenSiiDetail={onOpenSiiDetail}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ver lotes' }))
    expect(onOpenSiiDetail).toHaveBeenCalledTimes(1)
  })
})

describe('SaleGapPanel', () => {
  it('muestra, de forma estatica, los grupos que se completan en la venta', () => {
    render(<SaleGapPanel />)
    expect(screen.getByText('Se completa en la venta')).toBeTruthy()
    expect(screen.getByText('Comprador')).toBeTruthy()
    expect(screen.getByText('Precio y pago')).toBeTruthy()
    expect(screen.getByText('Lote')).toBeTruthy()
    expect(screen.getByText('Servidumbre')).toBeTruthy()
  })
})
