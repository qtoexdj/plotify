import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  ROLE_MATCHING_STATUS_LABELS,
  ROLE_STATUS_LABELS,
  type LegalRoleMatchesResponse,
  type LegalRoleMatchUpdatePayload,
} from '@/lib/legal/variable-resolution-types'

function readSource(relativePath: string) {
  const sourcePath = path.resolve(__dirname, relativePath)

  expect(fs.existsSync(sourcePath), `${relativePath} should exist`).toBe(true)

  return fs.readFileSync(sourcePath, 'utf8')
}

describe('T044 - SII lot role matching frontend contract', () => {
  it('labels every lot role matching status and treats rol_en_tramite as a valid state', () => {
    expect(ROLE_MATCHING_STATUS_LABELS).toEqual({
      matched: 'Asociado',
      ambiguous: 'Ambiguo',
      missing: 'Faltante',
      manual_override: 'Ajuste manual',
    })
    expect(ROLE_STATUS_LABELS.rol_en_tramite).toBe('Rol de avaluo en tramite')
  })

  it('models role matching inventory with all blocking and override outcomes', () => {
    const inventory = {
      project_id: 'project-1',
      lots: [
        {
          lot_id: 'lot-29',
          lot_number: '29',
          sii_unit_name: 'Lote 29',
          sii_pre_role: '08179-00029',
          role_status: 'rol_en_tramite',
          matching_status: 'matched',
          source_legal_document_id: 'legal-doc-roles',
        },
        {
          lot_id: 'lot-30',
          lot_number: '30',
          sii_unit_name: null,
          sii_pre_role: null,
          role_status: 'missing',
          matching_status: 'missing',
          source_legal_document_id: null,
        },
        {
          lot_id: 'lot-31',
          lot_number: '31',
          sii_unit_name: 'Unidad 31 / Lote 13',
          sii_pre_role: '08179-00031',
          role_status: 'rol_en_tramite',
          matching_status: 'ambiguous',
          source_legal_document_id: 'legal-doc-roles',
        },
        {
          lot_id: 'lot-32',
          lot_number: '32',
          sii_unit_name: 'Lote 32',
          sii_pre_role: '08179-00032',
          role_status: 'rol_en_tramite',
          matching_status: 'manual_override',
          source_legal_document_id: 'legal-doc-roles',
          reviewed_by: 'user-1',
          reviewed_at: '2026-06-04T12:00:00Z',
        },
      ],
      summary: {
        total: 4,
        matched: 1,
        ambiguous: 1,
        missing: 1,
        manual_override: 1,
      },
    } satisfies LegalRoleMatchesResponse

    expect(inventory.lots.map((lot) => lot.matching_status)).toEqual([
      'matched',
      'missing',
      'ambiguous',
      'manual_override',
    ])
    expect(inventory.lots[0]?.role_status).toBe('rol_en_tramite')
    expect(inventory.summary.manual_override).toBe(1)
  })

  it('requires manual override updates to carry a legal review reason', () => {
    const override = {
      sii_unit_name: 'Lote 32',
      sii_pre_role: '08179-00032',
      role_status: 'rol_en_tramite',
      matching_status: 'manual_override',
      reason: 'Validado por certificado SII y revision legal',
    } satisfies LegalRoleMatchUpdatePayload

    expect(override.reason).toContain('certificado SII')
    expect(override.matching_status).toBe('manual_override')
  })

  it('keeps web proxy routes aligned with the FastAPI legal role endpoints and reason payload', () => {
    const listRouteSource = readSource('../src/app/api/projects/[id]/legal-roles/route.ts')
    const updateRouteSource = readSource(
      '../src/app/api/projects/[id]/legal-roles/[lotId]/route.ts'
    )

    expect(listRouteSource).toContain('/api/v1/legal-roles/project/')
    expect(listRouteSource).toContain('/matches')
    expect(listRouteSource).toContain('organization_id')
    expect(updateRouteSource).toContain('/api/v1/legal-roles/lots/')
    expect(updateRouteSource).toContain("method: 'PATCH'")
    expect(updateRouteSource).toContain('reason')
    expect(updateRouteSource).toContain('reviewed_by')
  })

  it('keeps the Centro de Control Legal source wired for role status display and manual override reason', () => {
    const centerSource = readSource('../src/components/projects/detail/legal-control-center.tsx')

    expect(centerSource).toContain('ROLE_MATCHING_STATUS_LABELS')
    expect(centerSource).toContain('ROLE_STATUS_LABELS')
    expect(centerSource).toContain('manual_override')
    expect(centerSource).toContain('reason')
    expect(centerSource).toContain('Rol de avaluo en tramite')
  })
})
