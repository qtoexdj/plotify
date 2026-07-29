import { describe, expect, it } from 'vitest'

import {
  buildComparecienteResolution,
  parseComparecientes,
} from '@/components/projects/legal/legal-variable-editor'

const request = {
  operationKey: 'seller:person-1:nacionalidad:v2',
  personId: 'person-1',
  field: 'nacionalidad' as const,
  value: ' chilena ',
  reason: ' verificación registral ',
  attestationRef: ' acta-123 ',
  expectedVersion: 1,
  legalApprovalGrantId: 'grant-1',
}

describe('typed vendedor comparecientes editor', () => {
  it('keeps person identity and creates a typed, versioned operation', () => {
    expect(buildComparecienteResolution(request, true)).toEqual({
      ...request,
      value: 'chilena',
      reason: 'verificación registral',
      attestationRef: 'acta-123',
    })
    expect(parseComparecientes([{ personId: 'person-1' }, { name: 'invalid' }])).toEqual([
      { personId: 'person-1' },
    ])
  })

  it('rejects ungranted or unstructured updates and requires reason/attestation', () => {
    expect(() => buildComparecienteResolution(request, false)).toThrow('LEGAL_APPROVAL_REQUIRED')
    expect(() => buildComparecienteResolution({ ...request, reason: '' }, true)).toThrow(
      'SELLER_FACT_REASON_REQUIRED'
    )
    expect(() => buildComparecienteResolution({ ...request, attestationRef: '' }, true)).toThrow(
      'SELLER_FACT_ATTESTATION_REQUIRED'
    )
    expect(parseComparecientes(JSON.stringify([{ personId: 'person-1' }]))).toEqual([])
  })
})
