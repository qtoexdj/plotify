import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Test de guardia SDD 015 (FR-009): Spinner y BrandLoader son los únicos
 * indicadores de actividad. Falla si reaparece un loader prohibido en src/.
 */

const SRC_DIR = path.resolve(__dirname, '..', '..', 'src')
const FORBIDDEN_PATTERN = /Loader2|LoaderCircle|Loading0[123]Icon/
const MANUAL_SPINNER_PATTERN = /animate-spin/

function listTsxFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return listTsxFiles(fullPath)
    if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) return [fullPath]
    return []
  })
}

// Componentes de marca: aquí SÍ viven `animate-spin`/las referencias legítimas de loaders
const ALLOWED_FILES = new Set([
  path.join(SRC_DIR, 'components', 'ui', 'spinner.tsx'),
  path.join(SRC_DIR, 'components', 'ui', 'brand-loader.tsx'),
])

describe('Test de guardia: loaders prohibidos (SDD 015 FR-009)', () => {
  const files = listTsxFiles(SRC_DIR).filter((file) => !ALLOWED_FILES.has(file))

  it('no usa Loader2, LoaderCircle ni Loading01/02/03Icon en código de producto', () => {
    const offenders = files.filter((file) => FORBIDDEN_PATTERN.test(fs.readFileSync(file, 'utf-8')))
    expect(offenders.map((f) => path.relative(SRC_DIR, f))).toEqual([])
  })

  it('no usa animate-spin fuera de Spinner/BrandLoader (spinners ad-hoc)', () => {
    const offenders = files.filter((file) =>
      MANUAL_SPINNER_PATTERN.test(fs.readFileSync(file, 'utf-8'))
    )
    expect(offenders.map((f) => path.relative(SRC_DIR, f))).toEqual([])
  })
})
