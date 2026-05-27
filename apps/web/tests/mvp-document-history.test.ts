import { describe, it, expect } from 'vitest'

interface GeneratedDocumentRow {
  id: string
  file_url: string
  file_format: 'pdf' | 'docx'
  version_number: number
  document_type: string
  template_name: string
  generated_by: string
  missing_variables_accepted: boolean
  selected_recipients: string[]
  created_at: string
}

function renderHistoryRow(row: GeneratedDocumentRow) {
  return {
    formatLabel: row.file_format.toUpperCase(),
    versionLabel: `v${row.version_number}`,
    templateName: row.template_name,
    operator: row.generated_by,
    acceptBlanksStatus: row.missing_variables_accepted ? 'Aceptado con blancos' : 'Completo',
    recipients: row.selected_recipients.join(', '),
    downloadUrl: row.file_url,
  }
}

describe('T044 - Generated Document History Verification', () => {
  const mockHistoryData: GeneratedDocumentRow[] = [
    {
      id: 'doc-mvp-101',
      file_url: 'https://storage.example.com/reserva_v1.pdf',
      file_format: 'pdf',
      version_number: 1,
      document_type: 'reserva',
      template_name: 'Template Reserva Estándar',
      generated_by: 'admin@plotify.cl',
      missing_variables_accepted: false,
      selected_recipients: ['vendedor', 'comprador'],
      created_at: '2026-05-27T12:00:00Z',
    },
    {
      id: 'doc-mvp-102',
      file_url: 'https://storage.example.com/reserva_v2.docx',
      file_format: 'docx',
      version_number: 2,
      document_type: 'reserva',
      template_name: 'Template Reserva Estándar',
      generated_by: 'vendor@plotify.cl',
      missing_variables_accepted: true,
      selected_recipients: ['comprador'],
      created_at: '2026-05-27T12:15:00Z',
    },
  ]

  it('correctly maps PDF rows in history', () => {
    const rendered = renderHistoryRow(mockHistoryData[0])
    expect(rendered.formatLabel).toBe('PDF')
    expect(rendered.versionLabel).toBe('v1')
    expect(rendered.templateName).toBe('Template Reserva Estándar')
    expect(rendered.operator).toBe('admin@plotify.cl')
    expect(rendered.acceptBlanksStatus).toBe('Completo')
    expect(rendered.recipients).toBe('vendedor, comprador')
  })

  it('correctly maps DOCX rows in history with missing accepted status', () => {
    const rendered = renderHistoryRow(mockHistoryData[1])
    expect(rendered.formatLabel).toBe('DOCX')
    expect(rendered.versionLabel).toBe('v2')
    expect(rendered.templateName).toBe('Template Reserva Estándar')
    expect(rendered.operator).toBe('vendor@plotify.cl')
    expect(rendered.acceptBlanksStatus).toBe('Aceptado con blancos')
    expect(rendered.recipients).toBe('comprador')
  })
})
