/**
 * SDD 008 T023 — Template library structural tests.
 *
 * The repo test environment is node-only; these assertions cover exported
 * helpers and source wiring for the client UI.
 */

import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

import {
  canEditTemplate,
  formatTemplateVersion,
  mergeTemplateDetailIntoList,
  summarizeTemplateLibrary,
  TEMPLATE_STATUS_LABELS,
} from '@/components/documents/matriz/template-library'
import {
  buildClausePayload,
  extractInvalidTemplateKeys,
  formatInvalidTemplateKey,
  parseClauseContentInput,
} from '@/components/documents/matriz/template-clause-form'
import type {
  EscrituraTemplateDetail,
  EscrituraTemplateSummary,
} from '@/lib/documents/matriz-types'

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')
}

const templateSummary: EscrituraTemplateSummary = {
  id: 'tpl-1',
  name: 'Compraventa predio rustico',
  document_type: 'compraventa',
  version: 1,
  status: 'draft',
  published_at: null,
  clause_count: 1,
  updated_at: '2026-06-11T00:00:00Z',
}

const templateDetail: EscrituraTemplateDetail = {
  ...templateSummary,
  clauses: [
    {
      id: 'clause-1',
      clause_key: 'comparecencia',
      title: 'COMPARECENCIA',
      position: 0,
      fixed_position: true,
      content_json: {
        schema_version: 1,
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto' }] }],
      },
      condition_key: null,
      condition_mode: null,
      alert_tipo: null,
    },
  ],
}

describe('T023 — template library helpers', () => {
  it('labels template statuses and editable state', () => {
    expect(TEMPLATE_STATUS_LABELS).toEqual({
      draft: 'Borrador',
      published: 'Publicado',
      retired: 'Retirado',
    })
    expect(canEditTemplate({ status: 'draft' })).toBe(true)
    expect(canEditTemplate({ status: 'published' })).toBe(false)
    expect(formatTemplateVersion({ version: 3 })).toBe('v3')
  })

  it('summarizes and merges template details into the list', () => {
    const published: EscrituraTemplateSummary = {
      ...templateSummary,
      id: 'tpl-2',
      version: 2,
      status: 'published',
      clause_count: 4,
    }
    expect(summarizeTemplateLibrary([templateSummary, published])).toEqual({
      totalCount: 2,
      draftCount: 1,
      publishedCount: 1,
      totalClauseCount: 5,
    })
    const merged = mergeTemplateDetailIntoList([published], templateDetail)
    expect(merged.find((template) => template.id === 'tpl-1')).toMatchObject({
      id: 'tpl-1',
      clause_count: 1,
    })
  })
})

describe('T023 — template clause form helpers', () => {
  it('validates ProseMirror JSON before sending the upsert request', () => {
    expect(parseClauseContentInput('{ nope')).toEqual({
      ok: false,
      message: 'El contenido debe ser JSON válido.',
    })
    const built = buildClausePayload({
      title: 'COMPARECENCIA',
      position: '0',
      fixedPosition: true,
      contentInput: JSON.stringify(templateDetail.clauses[0].content_json),
      conditionKey: '',
      conditionMode: '',
      alertTipo: '',
    })
    expect(built.ok).toBe(true)
  })

  it('extracts invalid_keys from the proxied API error payload', () => {
    const invalidKeys = extractInvalidTemplateKeys({
      error: {
        code: 'invalid_keys',
        invalid_keys: [
          {
            key: 'matriz.inscripcion_fojas',
            reason: 'removed_key',
            suggested_migration: 'titulo.inscripciones[]',
          },
        ],
      },
    })
    expect(invalidKeys).toHaveLength(1)
    expect(formatInvalidTemplateKey(invalidKeys[0])).toBe(
      'matriz.inscripcion_fojas: Clave removida. Migrar a titulo.inscripciones[]'
    )
  })
})

describe('T023 — source wiring', () => {
  it('wires template APIs, inline invalid key rendering and the plantillas route', () => {
    const librarySource = readSource('../src/components/documents/matriz/template-library.tsx')
    const formSource = readSource('../src/components/documents/matriz/template-clause-form.tsx')
    const pageSource = readSource('../src/app/(dashboard)/documentos/plantillas/page.tsx')

    expect(librarySource).toContain('listEscrituraTemplates')
    expect(librarySource).toContain('createEscrituraTemplate')
    expect(librarySource).toContain('publishEscrituraTemplate')
    expect(formSource).toContain('upsertEscrituraTemplateClause')
    expect(formSource).toContain('data-testid="template-invalid-keys"')
    expect(formSource).toContain('suggested_migration')
    expect(pageSource).toContain('<TemplateLibrary />')
  })
})
