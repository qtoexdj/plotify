/**
 * SDD 008 — schema ProseMirror compartido del creador de matriz (research D2).
 *
 * Cuatro nodos custom sobre la base doc/paragraph/text:
 * - `variable_token` (inline, atómico): variableKey/label/format. El estado y
 *   la evidencia NUNCA se persisten en el JSON — se resuelven contra el
 *   snapshot al renderizar.
 * - `block_token` (bloque, atómico): bloques aprobados de título
 *   (titulo.comparecencia_vendedor_texto / titulo.clausula_primero_texto),
 *   no editables inline (FR-004).
 * - `repeat_section` (bloque contenedor): arrayKey + template interno con
 *   tokens `item.*`.
 * - `conditional_section` (bloque contenedor): conditionKey + mode
 *   (omit | block) para arrays/condiciones vacías.
 *
 * `schema_version: 1` viaja en el `content_json` de cada cláusula; el
 * validador de claves server-side vive en
 * `apps/api/services/matriz_template_validation.py`.
 */

import { defineNodeSpec, defineHistory, union } from '@prosekit/core'
import { defineDoc } from '@prosekit/extensions/doc'
import { defineText } from '@prosekit/extensions/text'
import { defineParagraph } from '@prosekit/extensions/paragraph'

import type { ClauseContentJson, TokenFormat } from './matriz-types'

export const MATRIZ_SCHEMA_VERSION = 1 as const

export const MATRIZ_BLOCK_KEYS = [
  'titulo.comparecencia_vendedor_texto',
  'titulo.clausula_primero_texto',
] as const

export function defineVariableToken() {
  return defineNodeSpec({
    name: 'variable_token',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: {
      variableKey: { default: '' },
      label: { default: '' },
      format: { default: null as TokenFormat | null },
    },
    parseDOM: [
      {
        tag: 'span[data-variable-key]',
        getAttrs: (dom: HTMLElement) => ({
          variableKey: dom.getAttribute('data-variable-key') ?? '',
          label: dom.getAttribute('data-label') ?? '',
          format: (dom.getAttribute('data-format') as TokenFormat) || null,
        }),
      },
    ],
    toDOM: (node) => [
      'span',
      {
        'data-variable-key': String(node.attrs.variableKey),
        'data-label': String(node.attrs.label),
        ...(node.attrs.format ? { 'data-format': String(node.attrs.format) } : {}),
        class: 'matriz-variable-token',
      },
      String(node.attrs.label || node.attrs.variableKey),
    ],
  })
}

export function defineBlockToken() {
  return defineNodeSpec({
    name: 'block_token',
    group: 'block',
    atom: true,
    selectable: true,
    attrs: {
      blockKey: { default: '' },
      label: { default: '' },
    },
    parseDOM: [
      {
        tag: 'div[data-block-key]',
        getAttrs: (dom: HTMLElement) => ({
          blockKey: dom.getAttribute('data-block-key') ?? '',
          label: dom.getAttribute('data-label') ?? '',
        }),
      },
    ],
    toDOM: (node) => [
      'div',
      {
        'data-block-key': String(node.attrs.blockKey),
        'data-label': String(node.attrs.label),
        class: 'matriz-block-token',
      },
      String(node.attrs.label || node.attrs.blockKey),
    ],
  })
}

export function defineRepeatSection() {
  return defineNodeSpec({
    name: 'repeat_section',
    group: 'block',
    content: 'block+',
    attrs: {
      arrayKey: { default: '' },
    },
    parseDOM: [
      {
        tag: 'section[data-array-key]',
        getAttrs: (dom: HTMLElement) => ({
          arrayKey: dom.getAttribute('data-array-key') ?? '',
        }),
      },
    ],
    toDOM: (node) => [
      'section',
      {
        'data-array-key': String(node.attrs.arrayKey),
        class: 'matriz-repeat-section',
      },
      0,
    ],
  })
}

export function defineConditionalSection() {
  return defineNodeSpec({
    name: 'conditional_section',
    group: 'block',
    content: 'block+',
    attrs: {
      conditionKey: { default: '' },
      mode: { default: 'omit' as 'omit' | 'block' },
    },
    parseDOM: [
      {
        tag: 'section[data-condition-key]',
        getAttrs: (dom: HTMLElement) => ({
          conditionKey: dom.getAttribute('data-condition-key') ?? '',
          mode: dom.getAttribute('data-condition-mode') === 'block' ? 'block' : 'omit',
        }),
      },
    ],
    toDOM: (node) => [
      'section',
      {
        'data-condition-key': String(node.attrs.conditionKey),
        'data-condition-mode': String(node.attrs.mode),
        class: 'matriz-conditional-section',
      },
      0,
    ],
  })
}

/** Extensión completa del editor de cláusulas (base + 4 nodos custom). */
export function defineMatrizClauseExtension() {
  return union([
    defineDoc(),
    defineText(),
    defineParagraph(),
    defineVariableToken(),
    defineBlockToken(),
    defineRepeatSection(),
    defineConditionalSection(),
    defineHistory(),
  ])
}

/**
 * Estilos Tailwind de los nodos custom dentro del editor (acoplados a las
 * clases que emite `toDOM`). Viven aquí junto al schema; la superficie de la
 * mesa los aplica sobre su contenedor montado.
 */
export const CLASES_NODOS_EDITOR =
  '[&_.matriz-block-token]:my-2 [&_.matriz-block-token]:rounded-r-md [&_.matriz-block-token]:border-l-4 [&_.matriz-block-token]:border-purple-300 [&_.matriz-block-token]:bg-purple-50/60 [&_.matriz-block-token]:px-3 [&_.matriz-block-token]:py-2 [&_.matriz-block-token]:font-sans [&_.matriz-block-token]:text-sm [&_.matriz-block-token]:text-purple-900 [&_.matriz-variable-token]:rounded [&_.matriz-variable-token]:bg-sky-50 [&_.matriz-variable-token]:px-1 [&_.matriz-variable-token]:py-0.5 [&_.matriz-variable-token]:font-sans [&_.matriz-variable-token]:text-[0.85em] [&_.matriz-variable-token]:text-sky-900 [&_.matriz-variable-token]:ring-1 [&_.matriz-variable-token]:ring-sky-300'

/** Doc ProseMirror puro (sin schema_version) para `Node.fromJSON`. */
export function clauseDocFromContent(content: ClauseContentJson): {
  type: 'doc'
  content: ClauseContentJson['content']
} {
  return { type: 'doc', content: content.content }
}

/** Empaqueta un doc del editor como `content_json` canónico versionado. */
export function clauseContentFromDoc(doc: { type: string; content?: unknown }): ClauseContentJson {
  return {
    schema_version: MATRIZ_SCHEMA_VERSION,
    type: 'doc',
    content: (doc.content ?? []) as ClauseContentJson['content'],
  }
}
