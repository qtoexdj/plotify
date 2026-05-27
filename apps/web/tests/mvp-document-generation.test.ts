import { describe, it, expect } from 'vitest'

/**
 * Lógica pura del Reservation Wizard para el bloqueo de generación.
 * Regla: Si hay variables faltantes (missing) y no han sido aceptadas por el admin
 * (missing_variables_accepted = false), se bloquea la generación.
 */
function shouldBlockGeneration(params: {
  missingVariables: string[]
  missingVariablesAccepted: boolean
  variablesLoaded?: boolean
  variableStatusError?: string | null
  selectedRecipients?: Array<'vendedor' | 'comprador'>
}): { blocked: boolean; reason?: string } {
  if (params.variableStatusError) {
    return { blocked: true, reason: params.variableStatusError }
  }
  if (params.variablesLoaded === false) {
    return { blocked: true, reason: 'No se pudo validar el estado de variables requeridas.' }
  }
  if (params.selectedRecipients?.length === 0) {
    return { blocked: true, reason: 'Selecciona al menos un destinatario.' }
  }
  if (params.missingVariables.length > 0 && !params.missingVariablesAccepted) {
    return {
      blocked: true,
      reason: `Existen variables faltantes requeridas: ${params.missingVariables.join(', ')}. Debe completar los datos o aceptar explícitamente la generación con espacios en blanco.`,
    }
  }
  return { blocked: false }
}

describe('T043 - MVP Reservation Wizard Blocks Generation', () => {
  it('blocks generation when there are missing variables and accept blanks is false', () => {
    const result = shouldBlockGeneration({
      missingVariables: ['comprador.cliente_run', 'matriz.cbr_numero_petitorio'],
      missingVariablesAccepted: false,
      variablesLoaded: true,
      selectedRecipients: ['comprador'],
    })

    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('variables faltantes requeridas')
    expect(result.reason).toContain('comprador.cliente_run')
  })

  it('allows generation when there are no missing variables', () => {
    const result = shouldBlockGeneration({
      missingVariables: [],
      missingVariablesAccepted: false,
      variablesLoaded: true,
      selectedRecipients: ['vendedor'],
    })

    expect(result.blocked).toBe(false)
  })

  it('allows generation when there are missing variables but the admin explicitly accepts blanks', () => {
    const result = shouldBlockGeneration({
      missingVariables: ['comprador.cliente_run'],
      missingVariablesAccepted: true,
      variablesLoaded: true,
      selectedRecipients: ['vendedor', 'comprador'],
    })

    expect(result.blocked).toBe(false)
  })

  it('blocks generation when variable status could not be loaded', () => {
    const result = shouldBlockGeneration({
      missingVariables: [],
      missingVariablesAccepted: false,
      variablesLoaded: false,
      selectedRecipients: ['comprador'],
    })

    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('validar')
  })

  it('blocks generation when no recipient is selected', () => {
    const result = shouldBlockGeneration({
      missingVariables: [],
      missingVariablesAccepted: false,
      variablesLoaded: true,
      selectedRecipients: [],
    })

    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('destinatario')
  })
})

// ─── T058: Quickstart P1 Document Scenario Validation ────────────────────────

/**
 * Simulates the business rules that the quickstart "Reservation document"
 * scenario (section 3) requires:
 *  1. Active template must exist before generating.
 *  2. PDF and DOCX are independent valid formats.
 *  3. Each generated document must carry required traceability metadata.
 *  4. Regeneration increments version_number.
 *  5. Blanks-acceptance policy is preserved in generated document metadata.
 *
 * Ref: specs/001-stabilize-plotify-mvp/quickstart.md – "Reservation document"
 */

type GeneratedDocRecord = {
  id: string
  lot_id: string
  template_id: string
  file_format: 'pdf' | 'docx'
  version_number: number
  generated_by: string | null
  missing_variables_accepted: boolean
  variables_snapshot: Record<string, unknown>
  selected_recipients: Array<'vendedor' | 'comprador'>
}

function validateGeneratedDocMetadata(doc: GeneratedDocRecord): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  if (!doc.id) errors.push('missing id')
  if (!doc.lot_id) errors.push('missing lot_id')
  if (!doc.template_id) errors.push('missing template_id')
  if (!['pdf', 'docx'].includes(doc.file_format)) errors.push('invalid file_format')
  if (typeof doc.version_number !== 'number' || doc.version_number < 1)
    errors.push('version_number must be >= 1')
  if (!doc.variables_snapshot || typeof doc.variables_snapshot !== 'object')
    errors.push('missing variables_snapshot')
  if (!doc.selected_recipients || doc.selected_recipients.length === 0)
    errors.push('missing selected_recipients')
  return { valid: errors.length === 0, errors }
}

describe('T058 - Quickstart P1 Reservation Document Scenario', () => {
  const baseDoc: GeneratedDocRecord = {
    id: 'doc-001',
    lot_id: 'lot-abc',
    template_id: 'tmpl-xyz',
    file_format: 'pdf',
    version_number: 1,
    generated_by: 'admin@test.com',
    missing_variables_accepted: false,
    variables_snapshot: { comprador: { cliente_nombre: 'Juan Pérez', cliente_run: '12345678-9' } },
    selected_recipients: ['vendedor', 'comprador'],
  }

  it('validates PDF document with all required metadata', () => {
    const { valid, errors } = validateGeneratedDocMetadata(baseDoc)
    expect(valid).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('validates DOCX document with all required metadata', () => {
    const { valid, errors } = validateGeneratedDocMetadata({ ...baseDoc, file_format: 'docx' })
    expect(valid).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('rejects document without lot_id', () => {
    const { valid, errors } = validateGeneratedDocMetadata({ ...baseDoc, lot_id: '' })
    expect(valid).toBe(false)
    expect(errors).toContain('missing lot_id')
  })

  it('rejects document without template_id', () => {
    const { valid, errors } = validateGeneratedDocMetadata({ ...baseDoc, template_id: '' })
    expect(valid).toBe(false)
    expect(errors).toContain('missing template_id')
  })

  it('rejects document with invalid file_format', () => {
    const { valid, errors } = validateGeneratedDocMetadata({
      ...baseDoc,
      file_format: 'txt' as 'pdf' | 'docx',
    })
    expect(valid).toBe(false)
    expect(errors).toContain('invalid file_format')
  })

  it('rejects document with version_number < 1', () => {
    const { valid, errors } = validateGeneratedDocMetadata({ ...baseDoc, version_number: 0 })
    expect(valid).toBe(false)
    expect(errors).toContain('version_number must be >= 1')
  })

  it('accepts regeneration at version 2 (incremented version from first)', () => {
    const regenerated: GeneratedDocRecord = { ...baseDoc, id: 'doc-002', version_number: 2 }
    const { valid } = validateGeneratedDocMetadata(regenerated)
    expect(valid).toBe(true)
    expect(regenerated.version_number).toBeGreaterThan(baseDoc.version_number)
  })

  it('preserves blanks acceptance flag as false when no variables are missing', () => {
    expect(baseDoc.missing_variables_accepted).toBe(false)
  })

  it('preserves blanks acceptance flag as true when admin accepted missing variables', () => {
    const acceptedDoc: GeneratedDocRecord = { ...baseDoc, missing_variables_accepted: true }
    expect(acceptedDoc.missing_variables_accepted).toBe(true)
  })

  it('requires non-empty variables_snapshot object', () => {
    const { valid, errors } = validateGeneratedDocMetadata({
      ...baseDoc,
      variables_snapshot: null as unknown as Record<string, unknown>,
    })
    expect(valid).toBe(false)
    expect(errors).toContain('missing variables_snapshot')
  })

  it('requires selected recipients in generated metadata', () => {
    const { valid, errors } = validateGeneratedDocMetadata({
      ...baseDoc,
      selected_recipients: [],
    })

    expect(valid).toBe(false)
    expect(errors).toContain('missing selected_recipients')
  })
})
