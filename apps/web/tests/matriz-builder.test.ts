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
  summarizeMatrizBuilder,
} from '@/components/documents/matriz/matriz-builder'
import {
  TOKEN_STATUS_LABELS,
  collectClauseNodeSummaries,
  tokenStatusLabel,
} from '@/components/documents/matriz/matriz-clause-editor'
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
          evidence_refs: [],
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
