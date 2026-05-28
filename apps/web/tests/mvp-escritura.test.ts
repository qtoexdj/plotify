import { describe, it, expect } from 'vitest'
import { filterPendingLegalVariables, type LegalVariable } from '@/lib/legal/variables'

describe('T061 - LegalTab UI Variable Review Real Test', () => {
  it('filters only required legal variables that still need review values', () => {
    const variables: LegalVariable[] = [
      {
        key: 'dominio_cbr_fojas',
        label: 'Fojas Dominio',
        value: '',
        source: 'project_legal_data',
        required: true,
      },
      {
        key: 'dominio_cbr_numero',
        label: 'Número Dominio',
        value: '5678',
        source: 'project_legal_data',
        required: true,
      },
      {
        key: 'source_document',
        label: 'Documento Fuente',
        value: null,
        source: 'manual',
        required: false,
      },
    ]

    const pending = filterPendingLegalVariables(variables)

    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      key: 'dominio_cbr_fojas',
      source: 'project_legal_data',
      required: true,
    })
  })
})
