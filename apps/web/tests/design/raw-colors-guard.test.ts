import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Test de guardia SDD 015 (FR-012): clases de paleta Tailwind cruda fuera de
 * la lista blanca de `lib/map/lot-colors.ts`. Falla si reaparecen.
 */

const SRC_DIR = path.resolve(__dirname, '..', '..', 'src')
const RAW_COLOR_PATTERN =
  /(bg|text|border|ring|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+/

const ALLOWED_FILES = new Set([path.join(SRC_DIR, 'lib', 'map', 'lot-colors.ts')])

// La mini app de Telegram (SDD018) no es superficie CRM: su tema sigue
// `themeParams`/la paleta oscura nativa de Telegram, no la dirección
// monocroma de SDD015 — está fuera del alcance de este guard por diseño.
const ALLOWED_DIR_PREFIXES = [
  path.join(SRC_DIR, 'app', 'mini') + path.sep,
  path.join(SRC_DIR, 'lib', 'miniapp') + path.sep,
]

function listTsxFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return listTsxFiles(fullPath)
    if (entry.name.endsWith('.tsx')) return [fullPath]
    return []
  })
}

describe('Test de guardia: colores crudos de Tailwind (SDD 015 FR-012)', () => {
  it('no usa clases de paleta cruda (bg/text/border/ring/from/to/via-{color}-N) fuera de lib/map/lot-colors', () => {
    const files = listTsxFiles(SRC_DIR).filter(
      (file) => !ALLOWED_FILES.has(file) && !ALLOWED_DIR_PREFIXES.some((p) => file.startsWith(p))
    )
    const offenders = files.filter((file) => RAW_COLOR_PATTERN.test(fs.readFileSync(file, 'utf-8')))
    expect(offenders.map((f) => path.relative(SRC_DIR, f)).sort()).toEqual([])
  })
})
