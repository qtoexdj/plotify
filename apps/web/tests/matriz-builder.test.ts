/**
 * SDD 008 T022 — Matriz builder structural tests.
 *
 * Vitest runs in node for this repo, so these tests cover exported pure
 * helpers and source wiring rather than browser rendering.
 */

import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  MATRIZ_STATUS_LABELS,
  formatApprovalBlocker,
  getInitialClauseKey,
  reorderMatrizClauses,
  summarizeMatrizBuilder,
} from '@/components/documents/matriz/matriz-builder'
import {
  LEGAL_WARNING_TEXT,
  canGenerateMinuta,
} from '@/components/documents/matriz/matriz-approval-bar'
import {
  TOKEN_STATUS_LABELS,
  collectClauseNodeSummaries,
  tokenStatusLabel,
} from '@/components/documents/matriz/matriz-clause-editor'
import {
  MATRIZ_VIEW_MODE_LABELS,
  clauseTokenResolutions,
  correctionUrl,
  evidenceRefToDocumentEvidence,
  resolvedParagraphs,
} from '@/components/documents/matriz/matriz-view-switch'
import { shortHash } from '@/components/documents/matriz/generation-history'
import type { ClauseContentJson, MatrizView } from '@/lib/documents/matriz-types'

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')
}

const content: ClauseContentJson = {
  schema_version: 1,
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Comprador ' },
        {
          type: 'variable_token',
          attrs: { variableKey: 'comprador.nombre', label: 'Comprador' },
        },
      ],
    },
    {
      type: 'block_token',
      attrs: {
        blockKey: 'titulo.clausula_primero_texto',
        label: 'Cláusula primero',
      },
    },
  ],
}

function makeMatriz(overrides: Partial<MatrizView> = {}): MatrizView {
  return {
    id: 'matriz-1',
    escritura_case_id: 'case-1',
    project_id: 'project-1',
    status: 'draft',
    version: 2,
    template: { id: 'tpl-1', name: 'Compraventa predio rustico', version: 1 },
    snapshot_stale: false,
    clause_order: ['comparecencia', 'primero'],
    clauses: [
      {
        clause_key: 'comparecencia',
        title: 'COMPARECENCIA',
        position: 0,
        fixed_position: true,
        content_json: content,
        resolved_content: {
          schema_version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Comprador María Pérez' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'PRIMERO: texto aprobado' }],
            },
          ],
        },
        overridden: false,
        disabled: false,
        condition: null,
        alert_tipo: null,
      },
      {
        clause_key: 'primero',
        title: 'PRIMERO',
        position: 1,
        fixed_position: false,
        content_json: content,
        resolved_content: content,
        overridden: true,
        disabled: true,
        condition: null,
        alert_tipo: null,
      },
    ],
    resolution: {
      missing_count: 1,
      tokens: [
        {
          variableKey: 'comprador.nombre',
          status: 'missing',
          value_text: null,
          state: null,
          source_type: null,
          evidence_refs: [
            {
              legal_document_id: 'doc-1',
              legal_document_page_id: 'page-1',
              page_number: 3,
              snippet: 'Comprador María Pérez',
            },
          ],
        },
      ],
      blocks: [
        {
          blockKey: 'titulo.clausula_primero_texto',
          status: 'resolved',
          text: 'PRIMERO: texto aprobado',
        },
      ],
    },
    approval_blockers: [{ kind: 'token_missing', key: 'comprador.nombre', fix_url: '/x' }],
    dismissed_alerts: [],
    ...overrides,
  }
}

describe('T022 — matriz builder helpers', () => {
  it('labels every matriz status in Spanish', () => {
    expect(MATRIZ_STATUS_LABELS.draft).toBe('Borrador')
    expect(MATRIZ_STATUS_LABELS.legal_review_pending).toBe('En revisión legal')
    expect(MATRIZ_STATUS_LABELS.approved).toBe('Aprobada')
    expect(MATRIZ_STATUS_LABELS.superseded).toBe('Reemplazada')
  })

  it('chooses the first enabled clause as initial selection', () => {
    expect(getInitialClauseKey(makeMatriz().clauses)).toBe('comparecencia')
    expect(getInitialClauseKey(makeMatriz({ clauses: [] }).clauses)).toBeNull()
  })

  it('summarizes blocker, fixed and editable counts', () => {
    const summary = summarizeMatrizBuilder(makeMatriz())
    expect(summary.clauseCount).toBe(2)
    expect(summary.fixedCount).toBe(1)
    expect(summary.disabledCount).toBe(1)
    expect(summary.blockerCount).toBe(1)
    expect(summary.canEdit).toBe(true)
    expect(summarizeMatrizBuilder(makeMatriz({ status: 'approved' })).canEdit).toBe(false)
    expect(summarizeMatrizBuilder(makeMatriz({ snapshot_stale: true })).canEdit).toBe(false)
  })

  it('gates DOCX generation by approved status and fresh snapshot', () => {
    expect(canGenerateMinuta(makeMatriz())).toBe(false)
    expect(canGenerateMinuta(makeMatriz({ status: 'approved' }))).toBe(true)
    expect(canGenerateMinuta(makeMatriz({ status: 'approved', snapshot_stale: true }))).toBe(false)
    expect(LEGAL_WARNING_TEXT).toContain('snapshot vigente')
  })

  it('formats approval blockers for the sidebar', () => {
    expect(
      formatApprovalBlocker({ kind: 'token_missing', key: 'comprador.nombre', fix_url: '/x' })
    ).toBe('Token pendiente: comprador.nombre')
    expect(
      formatApprovalBlocker({
        kind: 'readiness_gate',
        gate: 'title_verified',
        cause: 'analysis_needs_review',
        fix_url: '/x',
      })
    ).toBe('Gate title_verified: analysis_needs_review')
    expect(
      formatApprovalBlocker({
        kind: 'alert_clause_missing',
        alert_tipo: 'derechos_aguas',
        required_clause: 'Water-rights clause',
      })
    ).toBe('Cláusula obligatoria faltante: Water-rights clause')
  })
})

describe('T029 — matriz clause ordering', () => {
  it('reorders only movable clauses while keeping fixed clauses anchored', () => {
    const matriz = makeMatriz({
      clause_order: ['comparecencia', 'pago', 'primero', 'cierre'],
      clauses: [
        makeMatriz().clauses[0],
        {
          ...makeMatriz().clauses[1],
          clause_key: 'pago',
          title: 'PAGO',
          position: 1,
          fixed_position: false,
        },
        {
          ...makeMatriz().clauses[1],
          clause_key: 'primero',
          title: 'PRIMERO',
          position: 2,
          fixed_position: true,
        },
        {
          ...makeMatriz().clauses[1],
          clause_key: 'cierre',
          title: 'CIERRE',
          position: 3,
          fixed_position: false,
        },
      ],
    })

    const reordered = reorderMatrizClauses(matriz.clauses, 'cierre', 'pago')
    expect(reordered.map((clause) => clause.clause_key)).toEqual([
      'comparecencia',
      'cierre',
      'primero',
      'pago',
    ])
    expect(reordered.find((clause) => clause.clause_key === 'comparecencia')?.position).toBe(0)
    expect(reordered.find((clause) => clause.clause_key === 'primero')?.position).toBe(2)
  })

  it('does not move a clause over a fixed structural anchor', () => {
    const matriz = makeMatriz()
    expect(reorderMatrizClauses(matriz.clauses, 'primero', 'comparecencia')).toBe(matriz.clauses)
  })
})

describe('T022 — matriz clause editor helpers', () => {
  it('collects variable and block tokens from ProseMirror JSON', () => {
    expect(collectClauseNodeSummaries(content)).toEqual([
      { kind: 'variable', key: 'comprador.nombre', label: 'Comprador' },
      {
        kind: 'block',
        key: 'titulo.clausula_primero_texto',
        label: 'Cláusula primero',
      },
    ])
  })

  it('labels token states used by chips', () => {
    expect(TOKEN_STATUS_LABELS).toEqual({
      resolved: 'Resuelto',
      missing: 'Falta dato',
      blocked: 'Pendiente',
    })
    expect(tokenStatusLabel('blocked')).toBe('Pendiente')
  })
})

describe('T022 — source wiring', () => {
  it('wires ProseKit, the custom matriz extension and read-only block tokens', () => {
    const editorSource = readSource('../src/components/documents/matriz/matriz-clause-editor.tsx')
    expect(editorSource).toContain('ProseKit')
    expect(editorSource).toContain('defineMatrizClauseExtension')
    expect(editorSource).toContain('data-testid="matriz-block-token-readonly"')
    expect(editorSource).toContain('matriz-variable-token')
  })

  it('wires the builder route and client actions', () => {
    const builderSource = readSource('../src/components/documents/matriz/matriz-builder.tsx')
    const pageSource = readSource('../src/app/(dashboard)/documentos/matriz/[caseId]/page.tsx')
    expect(builderSource).toContain('getMatrizCase')
    expect(builderSource).toContain('saveMatriz')
    expect(builderSource).toContain('data-testid="matriz-blocking-list"')
    expect(pageSource).toContain('<MatrizBuilder caseId={caseId} />')
  })
})

describe('T029/T031 — US4 source wiring', () => {
  it('wires dnd-kit sortable ordering and dismissed-alert sidebar', () => {
    const builderSource = readSource('../src/components/documents/matriz/matriz-builder.tsx')

    expect(builderSource).toContain('DndContext')
    expect(builderSource).toContain('SortableContext')
    expect(builderSource).toContain('useSortable')
    expect(builderSource).toContain('arrayMove')
    expect(builderSource).toContain('data-testid="matriz-clause-sortable-list"')
    expect(builderSource).toContain('data-testid="matriz-dismissed-alerts"')
  })
})

describe('T026 — generation source wiring', () => {
  it('wires generate/history client helpers and proxies', () => {
    const clientSource = readSource('../src/lib/documents/matriz-client.ts')
    const generateRoute = readSource(
      '../src/app/api/escritura-matrices/[matrizId]/generate/route.ts'
    )
    const historyRoute = readSource(
      '../src/app/api/escritura-matrices/case/[caseId]/generations/route.ts'
    )

    expect(clientSource).toContain('generateMinuta')
    expect(clientSource).toContain('listMinutaGenerations')
    expect(generateRoute).toContain('generated_by: scope.userId')
    expect(historyRoute).toContain('/generations')
  })

  it('wires approval bar and new generation history table', () => {
    const builderSource = readSource('../src/components/documents/matriz/matriz-builder.tsx')
    const historyPage = readSource('../src/app/(dashboard)/documentos/historial/page.tsx')

    expect(builderSource).toContain(
      '<MatrizApprovalBar matriz={matriz} onWorkflowUpdate={setData} />'
    )
    expect(historyPage).toContain('listOrganizationMinutaGenerations')
    expect(historyPage).toContain('<GenerationHistory generations={generations} />')
    expect(shortHash('1234567890abcdef')).toBe('1234567890ab...')
  })
})

describe('T032/T033 — review workflow source wiring', () => {
  it('wires submit, approve, reject proxies and keeps stale reload affordance', () => {
    const clientSource = readSource('../src/lib/documents/matriz-client.ts')
    const approvalBarSource = readSource(
      '../src/components/documents/matriz/matriz-approval-bar.tsx'
    )
    const builderSource = readSource('../src/components/documents/matriz/matriz-builder.tsx')
    const submitRoute = readSource('../src/app/api/escritura-matrices/[matrizId]/submit/route.ts')
    const approveRoute = readSource('../src/app/api/escritura-matrices/[matrizId]/approve/route.ts')
    const rejectRoute = readSource('../src/app/api/escritura-matrices/[matrizId]/reject/route.ts')
    const scopeSource = readSource('../src/app/api/escritura-matrices/_scope.ts')

    expect(clientSource).toContain('submitMatriz')
    expect(clientSource).toContain('approveMatriz')
    expect(clientSource).toContain('rejectMatriz')
    expect(approvalBarSource).toContain('onWorkflowUpdate')
    expect(builderSource).toContain('data-testid="matriz-snapshot-stale-banner"')
    expect(scopeSource).toContain('organization_members')
    expect(submitRoute).toContain('submitted_by: scope.userId')
    expect(approveRoute).toContain("scope.role !== 'admin'")
    expect(approveRoute).toContain('approved_by: scope.userId')
    expect(rejectRoute).toContain("scope.role !== 'admin'")
    expect(rejectRoute).toContain('rejected_by: scope.userId')
  })
})

describe('T027 — matriz view switch helpers', () => {
  it('exposes the three required view modes', () => {
    expect(MATRIZ_VIEW_MODE_LABELS).toEqual({
      template: 'Template',
      resuelto: 'Resuelto',
      evidencia: 'Evidencia',
    })
  })

  it('uses resolved server content for the resolved view', () => {
    expect(resolvedParagraphs(makeMatriz().clauses[0].resolved_content)).toEqual([
      'Comprador María Pérez',
      'PRIMERO: texto aprobado',
    ])
  })

  it('matches clause tokens against the resolution manifest', () => {
    expect(clauseTokenResolutions(makeMatriz().clauses[0], makeMatriz().resolution.tokens)).toEqual(
      makeMatriz().resolution.tokens
    )
  })
})

describe('T028 — matriz evidence view helpers and wiring', () => {
  it('maps matriz evidence refs to the reusable legal evidence viewer contract', () => {
    expect(
      evidenceRefToDocumentEvidence(
        {
          legal_document_id: '00000000-0000-4000-8000-000000000102',
          legal_document_page_id: 'page-1',
          page_number: 3,
          snippet: 'Comprador María Pérez',
        },
        0
      )
    ).toMatchObject({
      legal_document_id: '00000000-0000-4000-8000-000000000102',
      legal_document_page_id: 'page-1',
      document_name: 'Documento 00000000',
      page_number: 3,
      snippet: 'Comprador María Pérez',
    })
  })

  it('builds the Centro de Control Legal correction deep link', () => {
    expect(correctionUrl('project-1', 'comprador.nombre')).toBe(
      '/projects/project-1?tab=legal&variable=comprador.nombre'
    )
  })

  it('wires the switch, evidence viewer and correction CTA in the builder', () => {
    const builderSource = readSource('../src/components/documents/matriz/matriz-builder.tsx')
    const switchSource = readSource('../src/components/documents/matriz/matriz-view-switch.tsx')

    expect(builderSource).toContain('<MatrizViewSwitch')
    expect(switchSource).toContain('LegalEvidenceViewer')
    expect(switchSource).toContain('data-testid="matriz-evidence-token"')
    expect(switchSource).toContain('Corregir en Centro de Control Legal')
  })
})
