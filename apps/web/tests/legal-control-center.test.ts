import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import { LegalControlCenter } from '@/components/projects/detail/legal-control-center'
import { LegalEvidenceViewer } from '@/components/projects/legal/legal-evidence-viewer'
import { LegalVariableEditor } from '@/components/projects/legal/legal-variable-editor'
import { VariableMatrix } from '@/components/projects/legal/variable-matrix/variable-matrix'

const centerPath = path.resolve(
  __dirname,
  '../src/components/projects/detail/legal-control-center.tsx'
)
const legalTabPath = path.resolve(__dirname, '../src/components/projects/detail/legal-tab.tsx')
const evidencePath = path.resolve(
  __dirname,
  '../src/components/projects/legal/legal-evidence-viewer.tsx'
)
const editorPath = path.resolve(
  __dirname,
  '../src/components/projects/legal/legal-variable-editor.tsx'
)

describe('SDD 013 US4 - Centro de Control Legal unificado', () => {
  it('exporta el centro de control y los componentes de la matriz', () => {
    expect(LegalControlCenter).toBeTypeOf('function')
    expect(LegalVariableEditor).toBeTypeOf('function')
    expect(LegalEvidenceViewer).toBeTypeOf('function')
    expect(VariableMatrix).toBeTypeOf('function')
  })

  it('monta solo la matriz de variables y el acceso a la escritura en el centro legal', () => {
    const centerSource = fs.readFileSync(centerPath, 'utf8')
    expect(centerSource).toContain('<VariableMatrix')
    expect(centerSource).toContain('/documentos/matriz/proyecto/')
    expect(centerSource).not.toContain('SagArticleTwoPanel')
    expect(centerSource).not.toContain('PlanoArchivePanel')
    expect(centerSource).not.toContain('Roles SII por lote')
    expect(centerSource).not.toContain('LegalDocumentStatusPanel')
    expect(centerSource).not.toContain('EscrituraReadinessPanel')
    expect(centerSource).not.toContain('TitleCasePanel')
    expect(centerSource).not.toContain('/legal-documents')
    expect(centerSource).not.toContain('/legal-roles')
  })

  it('deja el generador de textos bajo la matriz y elimina los paneles legacy de la pestaña legal', () => {
    const tabSource = fs.readFileSync(legalTabPath, 'utf8')
    expect(tabSource.indexOf('<LegalControlCenter')).toBeLessThan(
      tabSource.indexOf('legal-text-generator')
    )
    expect(tabSource).toContain('Generador de Textos Legales')
    expect(tabSource).toContain('Creador de Deslindes')
    expect(tabSource).toContain('Creador de Servidumbre')
    expect(tabSource).not.toContain('Revisión de Variables de Escritura')
    expect(tabSource).not.toContain('Variables Requeridas')
    expect(tabSource).not.toContain('Guardar Revisión Legal')
    expect(tabSource).not.toContain('project_legal_data')
    expect(tabSource).not.toContain('saveProjectLegalDataAction')
    expect(tabSource).not.toContain('filterPendingLegalVariables')
  })

  it('mantiene el visor de evidencia detras de URLs firmadas o publicas', () => {
    const evidenceSource = fs.readFileSync(evidencePath, 'utf8')
    const centerSource = fs.readFileSync(centerPath, 'utf8')
    expect(evidenceSource).toContain('safeEvidenceUrl')
    expect(evidenceSource).toContain('href={sourceUrl}')
    expect(evidenceSource).toContain('rel="noreferrer"')
    expect(evidenceSource).toContain("parsed.protocol !== 'https:'")
    expect(evidenceSource).toContain("parsed.protocol !== 'http:'")
    expect(evidenceSource).not.toContain('getPublicUrl')
    expect(evidenceSource).not.toContain('createSignedUrl')
    expect(evidenceSource).not.toContain('storage_path')
    expect(centerSource).not.toContain('project-files')
    expect(centerSource).not.toContain('getPublicUrl')
  })

  it('mantiene el editor de variables con aprobar, marcar no aplica y evidencia', () => {
    const editorSource = fs.readFileSync(editorPath, 'utf8')
    expect(editorSource).toContain('onApprove')
    expect(editorSource).toContain('onMarkNotApplicable')
    expect(editorSource).toContain('LegalEvidenceViewer')
  })
})
