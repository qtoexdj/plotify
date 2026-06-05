import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  ESCRITURA_READINESS_GATE_LABELS,
  LEGAL_REVIEW_WARNING,
  type CreateEscrituraCasePayload,
  type EscrituraReadinessResponse,
} from '@/lib/legal/variable-resolution-types'

function readSource(relativePath: string) {
  const sourcePath = path.resolve(__dirname, relativePath)

  expect(fs.existsSync(sourcePath), `${relativePath} should exist`).toBe(true)

  return fs.readFileSync(sourcePath, 'utf8')
}

describe('T052 - Escritura readiness frontend contract', () => {
  it('labels every required readiness gate and keeps the mandatory legal warning', () => {
    expect(ESCRITURA_READINESS_GATE_LABELS).toEqual({
      title_verified: 'Dominio y titulo',
      sii_verified: 'Roles SII',
      sag_plano_verified: 'SAG y plano',
      geometry_verified: 'Deslindes y superficie',
      party_verified: 'Partes',
      price_verified: 'Precio y pago',
      legal_review_ready: 'Revision legal',
      warning_acknowledged: 'Advertencia legal',
    })
    expect(LEGAL_REVIEW_WARNING).toContain('revisada y aprobada por abogado')
  })

  it('models readiness responses with gates, blocking variables and snapshots', () => {
    const readiness = {
      organization_id: 'org-1',
      project_id: 'project-1',
      lot_id: 'lot-29',
      readiness_status: 'blocked',
      gates: [
        {
          gate: 'party_verified',
          status: 'blocked',
          blocking_variables: ['comprador.rut'],
          warnings: [],
        },
        {
          gate: 'warning_acknowledged',
          status: 'needs_review',
          blocking_variables: [],
          warnings: [LEGAL_REVIEW_WARNING],
        },
      ],
      variable_snapshot: {
        'matriz.inscripcion_fojas': {
          value_text: '4699',
          state: 'approved',
        },
      },
      evidence_snapshot: {
        'matriz.inscripcion_fojas': [
          {
            legal_document_id: 'doc-1',
            page_number: 1,
            snippet: 'inscrita a fojas 4699',
          },
        ],
      },
    } satisfies EscrituraReadinessResponse

    expect(readiness.gates[0]?.blocking_variables).toEqual(['comprador.rut'])
    expect(readiness.variable_snapshot).toHaveProperty('matriz.inscripcion_fojas')
    expect(readiness.evidence_snapshot).toHaveProperty('matriz.inscripcion_fojas')
  })

  it('models case creation with explicit warning acknowledgement', () => {
    const payload = {
      warning_acknowledged: true,
    } satisfies CreateEscrituraCasePayload

    expect(payload.warning_acknowledged).toBe(true)
  })

  it('keeps web proxy routes aligned with FastAPI readiness and case endpoints', () => {
    const readinessRouteSource = readSource(
      '../src/app/api/projects/[id]/escritura-readiness/route.ts'
    )
    const casesRouteSource = readSource('../src/app/api/projects/[id]/escritura-cases/route.ts')

    expect(readinessRouteSource).toContain('/api/v1/escritura-cases/lots/')
    expect(readinessRouteSource).toContain('/readiness')
    expect(readinessRouteSource).toContain('organization_id')
    expect(readinessRouteSource).toContain('project_id')
    expect(casesRouteSource).toContain('/api/v1/escritura-cases/lots/')
    expect(casesRouteSource).toContain("method: 'POST'")
    expect(casesRouteSource).toContain('warning_acknowledged')
    expect(casesRouteSource).toContain('created_by')
    expect(casesRouteSource).not.toContain('JSON.stringify(payload)')
  })

  it('keeps readiness panel and generation entry points wired to block unsafe generation', () => {
    const panelSource = readSource('../src/components/projects/legal/escritura-readiness-panel.tsx')
    const documentsTabSource = readSource('../src/components/projects/detail/documents-tab.tsx')
    const wizardSource = readSource('../src/components/dashboard/documents/generation-wizard.tsx')

    expect(panelSource).toContain('LEGAL_REVIEW_WARNING')
    expect(panelSource).toContain('warningAcknowledged')
    expect(panelSource).toContain('blockingGates.length === 0')
    expect(panelSource).toContain('Crear snapshot')
    expect(documentsTabSource).toContain('EscrituraReadinessPanel')
    expect(documentsTabSource).toContain("estado === 'vendido'")
    expect(wizardSource).toContain('escrituraCaseReady')
    expect(wizardSource).toContain('Crea un snapshot de escritura listo')
    expect(wizardSource).toContain("documentType === 'escritura' && !escrituraCaseReady")
  })
})
