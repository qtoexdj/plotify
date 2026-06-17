import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  LegalControlCenter,
  flattenVariableGroups,
} from '@/components/projects/detail/legal-control-center'
import { LegalDocumentStatusPanel } from '@/components/projects/legal/legal-document-status-panel'
import { LegalEvidenceViewer } from '@/components/projects/legal/legal-evidence-viewer'
import { PlanoArchivePanel } from '@/components/projects/legal/plano-archive-panel'
import { SagArticleTwoPanel } from '@/components/projects/legal/sag-article-two-panel'
import { LegalVariableEditor } from '@/components/projects/legal/legal-variable-editor'
import { LegalVariableTable } from '@/components/projects/legal/legal-variable-table'
import type { VariableInventoryGroups } from '@/lib/legal/variable-resolution-types'

describe('T034 - Centro de Control Legal frontend structure', () => {
  it('exports the control center and legal review components', () => {
    expect(LegalControlCenter).toBeTypeOf('function')
    expect(LegalDocumentStatusPanel).toBeTypeOf('function')
    expect(LegalVariableTable).toBeTypeOf('function')
    expect(LegalVariableEditor).toBeTypeOf('function')
    expect(LegalEvidenceViewer).toBeTypeOf('function')
    expect(SagArticleTwoPanel).toBeTypeOf('function')
    expect(PlanoArchivePanel).toBeTypeOf('function')
  })

  it('flattens grouped variable inventory for table filtering and selection', () => {
    const groups = {
      matriz: [
        {
          id: 'variable-1',
          lot_id: null,
          escritura_case_id: null,
          variable_key: 'matriz.rol_avaluo',
          variable_group: 'matriz',
          value_text: '4699',
          value_json: null,
          state: 'proposed',
          source_type: 'document',
          confidence: 0.92,
          approval_required: true,
          correction_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          evidence: [],
        },
      ],
      sii: [
        {
          id: 'variable-2',
          lot_id: 'lot-1',
          escritura_case_id: null,
          variable_key: 'sii.pre_rol_lote',
          variable_group: 'sii',
          value_text: '123-45',
          value_json: null,
          state: 'manual_review',
          source_type: 'document',
          confidence: 0.7,
          approval_required: true,
          correction_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          evidence: [],
        },
      ],
    } satisfies VariableInventoryGroups

    expect(flattenVariableGroups(groups).map((variable) => variable.variable_key)).toEqual([
      'matriz.rol_avaluo',
      'sii.pre_rol_lote',
    ])
  })

  it('keeps table filters, edit drawer callbacks, and evidence viewer wired in source', () => {
    const tableSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/projects/legal/legal-variable-table.tsx'),
      'utf8'
    )
    const editorSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/projects/legal/legal-variable-editor.tsx'),
      'utf8'
    )
    const evidenceSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/projects/legal/legal-evidence-viewer.tsx'),
      'utf8'
    )
    const centerSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/projects/detail/legal-control-center.tsx'),
      'utf8'
    )

    expect(tableSource).toContain('aria-label="Filtrar por estado"')
    expect(tableSource).toContain('aria-label="Filtrar por grupo"')
    expect(tableSource).toContain('aria-label="Filtrar por documento"')
    expect(editorSource).toContain('onApprove')
    expect(editorSource).toContain('onMarkNotApplicable')
    expect(evidenceSource).toContain('source_url')
    expect(evidenceSource).toContain('snippet')
    expect(centerSource).toContain("method: 'PATCH'")
    expect(editorSource).toContain('LegalEvidenceViewer')
    expect(centerSource).toContain('SagArticleTwoPanel')
    expect(centerSource).toContain('PlanoArchivePanel')
    expect(centerSource).toContain('approveVariable')
  })

  it('keeps the SAG article two panel scoped to the three reviewed header variables', () => {
    const sagPanelSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/projects/legal/sag-article-two-panel.tsx'),
      'utf8'
    )

    expect(sagPanelSource).toContain('sag.region_oficina')
    expect(sagPanelSource).toContain('sag.certificado_numero')
    expect(sagPanelSource).toContain('sag.certificado_fecha')
    expect(sagPanelSource).toContain('pickCurrentVariable')
    expect(sagPanelSource).toContain('Recalcular SAG')
    expect(sagPanelSource).toContain('onEditVariable')
    expect(sagPanelSource).toContain('onApproveVariable')
    expect(sagPanelSource).toContain('onViewEvidence')
  })

  it('keeps the plano archive panel scoped to manual CBR archive number and year', () => {
    const planoPanelSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/projects/legal/plano-archive-panel.tsx'),
      'utf8'
    )

    expect(planoPanelSource).toContain('sag.plano_cbr_numero')
    expect(planoPanelSource).toContain('sag.plano_cbr_anio')
    expect(planoPanelSource).not.toContain('sag.plano_cbr_registro')
    expect(planoPanelSource).toContain('Ingreso manual recomendado')
    expect(planoPanelSource).toContain('onEditVariable')
    expect(planoPanelSource).toContain('onApproveVariable')
  })

  it('keeps legal evidence access behind signed or public source URLs only', () => {
    const evidenceSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/projects/legal/legal-evidence-viewer.tsx'),
      'utf8'
    )
    const centerSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/projects/detail/legal-control-center.tsx'),
      'utf8'
    )

    expect(evidenceSource).toContain('item.source_url')
    expect(evidenceSource).toContain('safeEvidenceUrl')
    expect(evidenceSource).toContain('href={sourceUrl}')
    expect(evidenceSource).toContain('rel="noreferrer"')
    expect(evidenceSource).toContain("parsed.protocol !== 'https:'")
    expect(evidenceSource).toContain("parsed.protocol !== 'http:'")
    expect(evidenceSource).not.toContain('getPublicUrl')
    expect(evidenceSource).not.toContain('createSignedUrl')
    expect(evidenceSource).not.toContain('storage_path')
    expect(centerSource).toContain('include_evidence=true')
    expect(centerSource).not.toContain('project-files')
    expect(centerSource).not.toContain('getPublicUrl')
  })

  it('expects the source column in legal-control-center.tsx to show friendly labels and not raw row/parser details', () => {
    const centerSource = fs.readFileSync(
      path.resolve(__dirname, '../src/components/projects/detail/legal-control-center.tsx'),
      'utf8'
    )

    // Under the Phase 12 design (T108), we should format the source column as friendly text:
    // "Certificado de roles SII" or "Ajuste manual"
    // and remove the direct exposure of row_evidence.row_index and raw parser names.
    expect(centerSource).toContain('source_document_label')
    expect(centerSource).toContain('Ajuste manual')
    expect(centerSource).toContain('recalculateSagDocuments')
    expect(centerSource).toContain('variables_proposed')
    expect(centerSource).not.toContain('row_evidence?.row_index')
    expect(centerSource).not.toContain('sii_role_record?.parser')
  })
})
