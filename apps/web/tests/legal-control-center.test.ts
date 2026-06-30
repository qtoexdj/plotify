import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import { LegalControlCenter } from '@/components/projects/detail/legal-control-center'
import { LegalDocumentStatusPanel } from '@/components/projects/legal/legal-document-status-panel'
import { LegalEvidenceViewer } from '@/components/projects/legal/legal-evidence-viewer'
import { LegalVariableEditor } from '@/components/projects/legal/legal-variable-editor'
import { VariableMatrix } from '@/components/projects/legal/variable-matrix/variable-matrix'

const centerPath = path.resolve(
  __dirname,
  '../src/components/projects/detail/legal-control-center.tsx'
)
const evidencePath = path.resolve(
  __dirname,
  '../src/components/projects/legal/legal-evidence-viewer.tsx'
)
const editorPath = path.resolve(
  __dirname,
  '../src/components/projects/legal/legal-variable-editor.tsx'
)

describe('SDD 013 US4 - Centro de Control Legal unificado', () => {
  it('exporta el centro de control y los componentes que conserva', () => {
    expect(LegalControlCenter).toBeTypeOf('function')
    expect(LegalDocumentStatusPanel).toBeTypeOf('function')
    expect(LegalVariableEditor).toBeTypeOf('function')
    expect(LegalEvidenceViewer).toBeTypeOf('function')
    expect(VariableMatrix).toBeTypeOf('function')
  })

  it('monta la matriz de variables y el acceso a la escritura, sin los paneles a medida', () => {
    const centerSource = fs.readFileSync(centerPath, 'utf8')
    expect(centerSource).toContain('<VariableMatrix')
    expect(centerSource).toContain('/documentos/matriz/proyecto/')
    expect(centerSource).not.toContain('SagArticleTwoPanel')
    expect(centerSource).not.toContain('PlanoArchivePanel')
    expect(centerSource).not.toContain('Roles SII por lote')
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
