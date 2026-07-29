import { describe, expect, it } from 'vitest'

import {
  generationIsDeliverable,
  legalGrantStatus,
  semanticReadiness,
} from '@/lib/documents/semantic-readiness'
import type { MatrizView, MinutaGeneration } from '@/lib/documents/matriz-types'

function matriz(semanticStatus: MatrizView['semantic_status']): MatrizView {
  return {
    id: 'm1',
    escritura_case_id: 'c1',
    project_id: 'p1',
    status: 'approved',
    version: 2,
    scope: 'lot',
    source_project_matriz_id: null,
    template: { id: 't1', name: 'Compraventa', version: 2 },
    snapshot_stale: false,
    clause_order: [],
    clauses: [],
    resolution: { tokens: [], blocks: [], missing_count: 0 },
    approval_blockers: [],
    dismissed_alerts: [],
    semantic_status: semanticStatus,
  }
}

describe('canonical semantic readiness', () => {
  it('only passed is deliverable and historical unverified remains visible', () => {
    expect(semanticReadiness(matriz('passed')).deliverable).toBe(true)
    expect(semanticReadiness(matriz('failed'))).toMatchObject({
      deliverable: false,
      blockerCount: 1,
    })
    expect(semanticReadiness(matriz('unverified'))).toMatchObject({
      deliverable: false,
      label: 'Documento histórico sin validación',
    })
  })

  it('generation requires both semantic PASS and ready axis', () => {
    const generation = { semantic_status: 'passed', readiness_status: 'ready' } as MinutaGeneration
    expect(generationIsDeliverable(generation)).toBe(true)
    expect(generationIsDeliverable({ ...generation, readiness_status: 'unverified' })).toBe(false)
  })

  it('shows active, expired and missing legal grants without evidence', () => {
    const base = matriz('passed')
    expect(legalGrantStatus(base)).toBe('missing')
    expect(legalGrantStatus({ ...base, legal_approval_grant_active: true })).toBe('active')
    expect(
      legalGrantStatus(
        {
          ...base,
          legal_approval_grant_active: true,
          legal_approval_grant_expires_at: '2020-01-01T00:00:00Z',
        },
        new Date('2026-01-01T00:00:00Z')
      )
    ).toBe('expired')
  })
})
