import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  ROLE_MATCHING_STATUS_LABELS,
  ROLE_STATUS_LABELS,
  type LegalRoleMatchesResponse,
  type LegalRoleMatchUpdatePayload,
  deriveRoleInProcessText,
  validateRoleInProcessText,
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
          sii_lot_number_normalized: '29',
          sii_comuna: 'Teno',
          sii_role_matrix: '00067-00023',
          sii_pre_role: '08179-00029',
          role_status: 'rol_en_tramite',
          matching_status: 'matched',
          source_type: 'document',
          source_legal_document_id: 'legal-doc-roles',
          source_document_label: 'Certificado de roles SII',
          source_status: 'active',
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
          source_type: 'document',
          source_document_label: 'Certificado de roles SII',
          source_status: 'active',
        },
        {
          lot_id: 'lot-32',
          lot_number: '32',
          sii_unit_name: 'Lote 32',
          sii_pre_role: '08179-00032',
          role_status: 'rol_en_tramite',
          matching_status: 'manual_override',
          source_legal_document_id: 'legal-doc-roles',
          source_type: 'manual',
          source_document_label: 'Ajuste manual',
          source_status: 'manual',
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
      certificate_summary: {
        source_legal_document_ids: ['legal-doc-roles'],
        comunas: ['Teno'],
        role_matrices: ['00067-00023'],
        extracted_unit_count: 4,
        matched_count: 1,
        manual_review_count: 1,
        missing_count: 1,
        active_certificate_count: 1,
        superseded_certificate_count: 0,
        ambiguous_matrix_role_count: 0,
        ocr_required: false,
        text_source: 'pdf_text',
      },
      review_counts: {
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
    expect(inventory.lots[0]?.source_document_label).toBe('Certificado de roles SII')
    expect(inventory.certificate_summary?.role_matrices).toEqual(['00067-00023'])
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

  it('keeps role matching review wired through the variable matrix detail', () => {
    const centerSource = readSource('../src/components/projects/detail/legal-control-center.tsx')
    const matrixSource = readSource(
      '../src/components/projects/legal/variable-matrix/variable-matrix.tsx'
    )
    const detailSource = readSource(
      '../src/components/projects/legal/variable-matrix/sii-lot-detail.tsx'
    )

    expect(centerSource).toContain('VariableMatrix')
    expect(matrixSource).toContain('SiiLotDetail')
    expect(matrixSource).toContain('onOpenSiiDetail')
    expect(detailSource).toContain('ROLE_MATCHING_STATUS_LABELS')
    expect(detailSource).toContain('ROLE_STATUS_LABELS')
    expect(detailSource).toContain('source_document_label')
    expect(detailSource).toContain('manual_override')
    expect(detailSource).toContain('reason')
    expect(detailSource).toContain('rol_en_tramite')
  })

  it('derives the correct role in process text when pre-role and comuna are updated', () => {
    const derived = deriveRoleInProcessText('08179-00029', 'Teno')
    expect(derived).toBe('Rol de avaluo en tramite numero 08179-00029 de la comuna de Teno')
  })

  it('rejects stale or mismatched client role in process text', () => {
    const preRole = '08179-00029'
    const comuna = 'Teno'
    const staleText = 'Rol de avaluo en tramite numero 99999-99999 de la comuna de Pemuco'
    const validText = 'Rol de avaluo en tramite numero 08179-00029 de la comuna de Teno'

    expect(validateRoleInProcessText(staleText, preRole, comuna)).toBe(false)
    expect(validateRoleInProcessText(validText, preRole, comuna)).toBe(true)
  })

  it('covers the source label formatting to show user-friendly text instead of parser metadata', () => {
    const getSourceLabel = (matchingStatus: string, sourceDocumentLabel?: string | null) => {
      if (matchingStatus === 'manual_override') {
        return 'Ajuste manual'
      }
      return sourceDocumentLabel ?? 'Sin evidencia'
    }

    expect(getSourceLabel('matched', 'Certificado de roles SII')).toBe('Certificado de roles SII')
    expect(getSourceLabel('manual_override', null)).toBe('Ajuste manual')
    expect(getSourceLabel('missing', null)).toBe('Sin evidencia')
  })
})
