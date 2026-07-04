/**
 * SDD 010 T006 — Test permanente de vocabulario prohibido (FR-006/SC-002).
 *
 * Busca jerga técnica en los textos visibles de los documentos:
 * (a) los valores del diccionario estático `matriz-microcopy.ts`, y
 * (b) los strings de pantalla de TODO `components/documents/` — nodos de
 * texto JSX y literales con aspecto de oración (contienen espacio).
 * Los identificadores de código (`token.status === 'resolved'`,
 * `snapshot_stale`) no cuentan: solo el texto que un usuario puede leer.
 *
 * Escanea el árbol completo (no solo `mesa/`) para que ningún componente
 * hermano con jerga vetada — p. ej. capas viejas huérfanas — escape el gate.
 */

import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  DATO_STATUS_LABELS,
  FLOW_STATE_DESCRIPTIONS,
  FLOW_STATE_LABELS,
  MESA_STATUS_LABELS,
  MESA_TEXT,
  PLANTILLA_STATUS_LABELS,
  TERMINOS_PROHIBIDOS,
} from '@/lib/documents/matriz-microcopy'

const DOCUMENTS_DIR = path.resolve(__dirname, '../src/components/documents')
const SDD_011_SCREEN_FILES = [
  '../src/app/(dashboard)/documentos/page.tsx',
  '../src/app/(dashboard)/documentos/historial/page.tsx',
  '../src/app/(dashboard)/mis-documentos/page.tsx',
  '../src/lib/documents/mis-documentos.ts',
] as const

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const FORBIDDEN_RE = new RegExp(`\\b(${TERMINOS_PROHIBIDOS.map(escapeRegExp).join('|')})\\b`, 'i')
/** Claves crudas tipo `comprador.estado_civil` o `titulo.inscripciones[]`. */
const RAW_KEY_RE = /\b[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*(?:\[\])?)+\b/

const SDD_011_ALLOWED_PRODUCT_TEXT = new Set([
  'Matrices, variables legales e historial documental por proyecto.',
  'Crea un proyecto para preparar su matriz de escritura y revisar sus variables legales.',
  'Matriz de variables del proyecto',
  'Abrir variables',
])

/** Tokens "Tinta nítida" (SDD 015) — valores de `globals.css` :root, sobre tarjeta blanca. */
const TOKEN_HEX = {
  success: '#15803d',
  info: '#1d4ed8',
  warning: '#b45309',
  card: '#ffffff',
} as const

function assertHuman(text: string, origin: string) {
  const isAllowedProductText = SDD_011_ALLOWED_PRODUCT_TEXT.has(text)
  expect(
    isAllowedProductText || !FORBIDDEN_RE.test(text),
    `Jerga vetada en ${origin}: ${JSON.stringify(text)}`
  ).toBe(true)
  expect(RAW_KEY_RE.test(text), `Clave cruda en ${origin}: ${JSON.stringify(text)}`).toBe(false)
}

function documentFiles(): string[] {
  if (!fs.existsSync(DOCUMENTS_DIR)) return []
  return fs
    .readdirSync(DOCUMENTS_DIR, { recursive: true, encoding: 'utf-8' })
    .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
    .map((name) => path.join(DOCUMENTS_DIR, name))
}

function sdd011ScreenFiles(): string[] {
  return SDD_011_SCREEN_FILES.map((relative) => path.resolve(__dirname, relative)).filter((file) =>
    fs.existsSync(file)
  )
}

/** Texto visible: nodos de texto JSX y literales multi-palabra. */
function visibleStrings(source: string): string[] {
  const strings: string[] = []
  for (const match of source.matchAll(/>([^<>{}]+)</g)) {
    const text = match[1].trim()
    if (text.includes('\n')) continue
    if (/[=(){};]/.test(text)) continue
    if (text) strings.push(text)
  }
  for (const match of source.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)+)\1/g)) {
    const text = match[2].trim()
    if (text.includes('${')) continue
    if (text.includes('\n')) continue
    if (text.includes('\\n')) continue
    if (text.includes(' ')) strings.push(text)
  }
  return strings
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('SDD 010 — vocabulario de la mesa de escritura', () => {
  it('el diccionario estático no contiene jerga vetada', () => {
    const values = [
      ...Object.values(DATO_STATUS_LABELS),
      ...Object.values(MESA_STATUS_LABELS),
      ...Object.values(PLANTILLA_STATUS_LABELS),
      ...Object.values(MESA_TEXT),
      ...Object.values(FLOW_STATE_LABELS),
      ...Object.values(FLOW_STATE_DESCRIPTIONS),
    ]
    expect(values.length).toBeGreaterThan(20)
    for (const value of values) {
      assertHuman(value, 'matriz-microcopy.ts')
      expect(value.includes('_'), `Underscore visible: ${value}`).toBe(false)
    }
  })

  it('los estados del dato están en español', () => {
    expect(DATO_STATUS_LABELS).toEqual({
      resolved: 'Verificado',
      blocked: 'Por revisar',
      missing: 'Falta',
    })
  })

  it('los estados del flujo venta → escritura usan el vocabulario único (FR-014)', () => {
    // Frases idénticas, palabra por palabra, a FLOW_STATE_LABELS de
    // legal_microcopy.py: un solo vocabulario en todas las superficies.
    expect(FLOW_STATE_LABELS).toEqual({
      waiting_project_matriz: 'Esperando matriz del proyecto',
      in_preparation: 'En preparación',
      draft_for_review: 'Borrador por revisar',
      accepted: 'Aceptada',
      delivered: 'Entregada',
    })
  })

  it('los componentes de documentos no muestran jerga vetada', () => {
    const files = [...documentFiles(), ...sdd011ScreenFiles()]
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8')
      for (const text of visibleStrings(source)) {
        assertHuman(text, path.basename(file))
      }
    }
  })

  it('la lista vetada final cubre jerga de API, claves y autoria técnica', () => {
    expect(TERMINOS_PROHIBIDOS).toEqual(
      expect.arrayContaining([
        'token',
        'blocker',
        'snapshot',
        'gate',
        'json',
        'variable',
        'template',
        'payload',
        'schema',
        'condition_key',
        'alert_tipo',
        'dl_3516',
        'content_json',
      ])
    )
  })

  it('los chips de dato declaran contraste AA y estado textual', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/components/documents/mesa/dato-chip.tsx'),
      'utf-8'
    )
    const estados = ['success', 'info', 'warning'] as const

    for (const token of estados) {
      expect(source).toContain(`text-${token}`)
      expect(source).toContain(`bg-${token}`)
      expect(contrastRatio(TOKEN_HEX[token], TOKEN_HEX.card)).toBeGreaterThanOrEqual(4.5)
    }

    expect(source).toContain('sr-only')
    expect(source).toContain('focus-visible:outline')
  })
})
