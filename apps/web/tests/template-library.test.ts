/**
 * SDD 010 T018/T019 — Plantillas sin JSON.
 *
 * The repo test environment is node-only; these assertions cover exported
 * helpers and source wiring for the client UI.
 */

import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

import {
  canEditTemplate,
  extractInvalidTemplateKeys as extractMesaInvalidTemplateKeys,
  formatInvalidTemplateIssue,
  formatTemplateVersion,
  mergeTemplateDetailIntoList,
  reordenarTemplateClauses,
  sanitizeClauseContent,
} from '@/components/documents/mesa/plantilla-editor'
import {
  condicionDesdeCampos,
  condicionPorId,
} from '@/components/documents/mesa/condicion-clausula-form'
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

describe('SDD 010 T018/T019 — plantillas sin JSON', () => {
  it('labels template statuses and editable state', () => {
    expect(canEditTemplate({ status: 'draft' })).toBe(true)
    expect(canEditTemplate({ status: 'published' })).toBe(false)
    expect(formatTemplateVersion({ version: 3 })).toBe('v3')
  })

  it('mergea detalles de plantilla en la lista', () => {
    const published: EscrituraTemplateSummary = {
      ...templateSummary,
      id: 'tpl-2',
      version: 2,
      status: 'published',
      clause_count: 4,
    }
    const merged = mergeTemplateDetailIntoList([published], templateDetail)
    expect(merged.find((template) => template.id === 'tpl-1')).toMatchObject({
      id: 'tpl-1',
      clause_count: 1,
    })
  })

  it('reordena cláusulas por arrastre actualizando posiciones', () => {
    const [first] = templateDetail.clauses
    const clauses = [
      first,
      { ...first, id: 'clause-2', clause_key: 'precio', title: 'PRECIO', position: 1 },
      { ...first, id: 'clause-3', clause_key: 'firma', title: 'FIRMA', position: 2 },
    ]
    expect(
      reordenarTemplateClauses(clauses, 'firma', 'comparecencia').map((clause) => clause.clause_key)
    ).toEqual(['firma', 'comparecencia', 'precio'])
    expect(
      reordenarTemplateClauses(clauses, 'firma', 'comparecencia').map((clause) => clause.position)
    ).toEqual([0, 1, 2])
  })

  it('mapea condiciones declarativas a campos persistidos', () => {
    const condition = condicionPorId('servidumbre')
    expect(condition).toMatchObject({
      condition_key: 'servidumbre.aplica',
      condition_mode: 'omit',
    })
    expect(condicionDesdeCampos('servidumbre.aplica', 'omit')).toBe('servidumbre')
    expect(condicionDesdeCampos(null, null)).toBe('sin-seleccion')
  })

  it('sirve el catálogo de datos desde la API, sin lista hardcodeada', () => {
    const editorSource = readSource('../src/components/documents/mesa/plantilla-editor.tsx')
    // El picker se alimenta del catálogo servido (insertable_variables), no de
    // una copia local que derive del catálogo canónico (SDD 010 FR-014).
    expect(editorSource).toContain('response.insertable_variables')
    expect(editorSource).toContain('variables={insertables}')
    expect(editorSource).not.toContain('TEMPLATE_INSERTABLE_VARIABLES')
  })

  it('elimina nodos de texto vacíos antes de montar el editor', () => {
    const sanitized = sanitizeClauseContent({
      schema_version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'Texto válido' },
          ],
        },
      ],
    })
    expect(sanitized.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Texto válido' }],
    })
  })

  it('muestra errores de catálogo con texto visible y sugerencia humana', () => {
    const invalidKeys = extractMesaInvalidTemplateKeys({
      error: {
        code: 'invalid_keys',
        invalid_keys: [
          {
            key: 'matriz.inscripcion_fojas',
            reason: 'removed_key',
            suggested_migration: 'titulo.inscripciones[]',
            display_text: 'Inscripción antigua',
            suggested_label: 'Inscripciones del título',
          },
        ],
      },
    })
    expect(formatInvalidTemplateIssue(invalidKeys[0])).toBe(
      'Inscripción antigua. Usa la sugerencia del catálogo: Inscripciones del título'
    )
    expect(formatInvalidTemplateIssue(invalidKeys[0])).not.toContain('matriz.inscripcion_fojas')
  })

  it('recablea la ruta y conserva componentes nuevos bajo mesa', () => {
    const pageSource = readSource('../src/app/(dashboard)/documentos/plantillas/page.tsx')
    const editorSource = readSource('../src/components/documents/mesa/plantilla-editor.tsx')
    const conditionSource = readSource(
      '../src/components/documents/mesa/condicion-clausula-form.tsx'
    )

    expect(pageSource).toContain('PlantillaEditor')
    expect(pageSource).not.toContain('TemplateLibrary')
    expect(editorSource).toContain('data-testid="plantilla-editor"')
    expect(editorSource).toContain('DndContext')
    expect(editorSource).toContain('InsertarDatoPicker')
    expect(editorSource).toContain('upsertEscrituraTemplateClause')
    expect(editorSource).toContain('data-testid="template-invalid-keys"')
    expect(conditionSource).toContain('data-testid="condicion-clausula-form"')
  })
})
