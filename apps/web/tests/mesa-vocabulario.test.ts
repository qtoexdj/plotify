/**
 * SDD 010 T006 — Test permanente de vocabulario prohibido (FR-006/SC-002).
 *
 * Busca jerga técnica en los textos visibles de la mesa de escritura:
 * (a) los valores del diccionario estático `matriz-microcopy.ts`, y
 * (b) los strings de pantalla de `components/documents/mesa/` — nodos de
 * texto JSX y literales con aspecto de oración (contienen espacio).
 * Los identificadores de código (`token.status === 'resolved'`,
 * `snapshot_stale`) no cuentan: solo el texto que un usuario puede leer.
 *
 * La carpeta `mesa/` aún no existe en la fase Foundational: el test queda
 * en verde y se vuelve efectivo desde la fase 3 (remediación I2 del
 * speckit-analyze).
 */

import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  DATO_STATUS_LABELS,
  MESA_STATUS_LABELS,
  MESA_TEXT,
  PLANTILLA_STATUS_LABELS,
  TERMINOS_PROHIBIDOS,
} from '@/lib/documents/matriz-microcopy'

const MESA_DIR = path.resolve(__dirname, '../src/components/documents/mesa')

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const FORBIDDEN_RE = new RegExp(`\\b(${TERMINOS_PROHIBIDOS.map(escapeRegExp).join('|')})\\b`, 'i')
/** Claves crudas tipo `comprador.estado_civil` o `titulo.inscripciones[]`. */
const RAW_KEY_RE = /\b[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*(?:\[\])?)+\b/

const TAILWIND_COLOR_HEX = {
  'emerald-50': '#ecfdf5',
  'emerald-900': '#064e3b',
  'sky-50': '#f0f9ff',
  'sky-900': '#0c4a6e',
  'amber-50': '#fffbeb',
  'amber-900': '#78350f',
} as const

function assertHuman(text: string, origin: string) {
  expect(FORBIDDEN_RE.test(text), `Jerga vetada en ${origin}: ${JSON.stringify(text)}`).toBe(false)
  expect(RAW_KEY_RE.test(text), `Clave cruda en ${origin}: ${JSON.stringify(text)}`).toBe(false)
}

function mesaFiles(): string[] {
  if (!fs.existsSync(MESA_DIR)) return []
  return fs
    .readdirSync(MESA_DIR, { recursive: true, encoding: 'utf-8' })
    .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
    .map((name) => path.join(MESA_DIR, name))
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

  it('los componentes de la mesa no muestran jerga vetada', () => {
    for (const file of mesaFiles()) {
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
    const estados = [
      ['emerald-900', 'emerald-50'],
      ['sky-900', 'sky-50'],
      ['amber-900', 'amber-50'],
    ] as const

    for (const [text, background] of estados) {
      expect(source).toContain(`text-${text}`)
      expect(source).toContain(`bg-${background}`)
      expect(
        contrastRatio(TAILWIND_COLOR_HEX[text], TAILWIND_COLOR_HEX[background])
      ).toBeGreaterThanOrEqual(4.5)
    }

    expect(source).toContain('sr-only')
    expect(source).toContain('focus-visible:outline')
  })
})
