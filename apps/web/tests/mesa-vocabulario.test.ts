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

const FORBIDDEN_RE = new RegExp(`\\b(${TERMINOS_PROHIBIDOS.join('|')})\\b`, 'i')
/** Claves crudas tipo `comprador.estado_civil` visibles en pantalla. */
const RAW_KEY_RE = /\b[a-z]+\.[a-z]+(_[a-z]+)+\b/

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
    if (text) strings.push(text)
  }
  for (const match of source.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)+)\1/g)) {
    const text = match[2].trim()
    if (text.includes(' ')) strings.push(text)
  }
  return strings
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
})
