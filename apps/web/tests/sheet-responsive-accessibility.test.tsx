import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MARKER = 'SheetDescription'

function source(path: string): string {
  try {
    return readFileSync(resolve(process.cwd(), path), 'utf8')
  } catch {
    return ''
  }
}

const consumers = [
  ['operations', 'src/components/operations/OperationsTable.tsx'],
  ['sidebar', 'src/components/ui/sidebar.tsx'],
  ['legal-editor', 'src/components/projects/legal/legal-variable-editor.tsx'],
  ['lots', 'src/components/projects/detail/lots-tab.tsx'],
  ['geometry-viewer', 'src/components/projects/geometry-viewer/index.tsx'],
  ['mesa', 'src/components/documents/mesa/mesa-escritura.tsx'],
] as const

describe('shared Sheet responsive and accessibility contract', () => {
  const primitive = source('src/components/ui/sheet.tsx')

  it('provides one bounded scroll body between shrink-safe header and footer', () => {
    expect(primitive, MARKER).not.toContain('data-[side=bottom]:h-auto')
    expect(primitive, MARKER).toMatch(/data-\[side=bottom\]:max-h-/)
    expect(primitive, MARKER).toMatch(
      /function SheetHeader[\s\S]*?shrink-0[\s\S]*?function SheetBody/
    )
    expect(primitive, MARKER).toMatch(
      /function SheetBody[\s\S]*?min-h-0[\s\S]*?overflow-y-auto[\s\S]*?function SheetFooter/
    )
    expect(primitive, MARKER).toMatch(/function SheetFooter[\s\S]*?shrink-0/)
  })

  it('keeps focus visible and preserves the Radix Escape/focus restoration primitive', () => {
    expect(primitive, MARKER).toMatch(/SheetPrimitive\.Content/)
    expect(primitive, MARKER).toMatch(/SheetPrimitive\.Close/)
    expect(primitive, MARKER).toMatch(/scroll-m[ty]-/)
    expect(primitive, MARKER).toMatch(/safe-area-inset-(top|bottom)/)
  })

  it('defines 44px touch targets and a documented spaced compact exception above 24px', () => {
    expect(primitive, MARKER).toMatch(/min-(?:size|h|w)-11/)
    expect(primitive, MARKER).toMatch(/documented-spaced-exception/)
    expect(primitive, MARKER).toMatch(/min-(?:size|h|w)-6/)
  })

  it.each(consumers)('%s exposes the canonical labelled Sheet layout and stable ID', (id, path) => {
    const contents = source(path)
    expect(contents, `${MARKER}: ${id}`).toContain(`data-testid="sheet-${id}"`)
    expect(contents, `${MARKER}: ${id}`).toMatch(/SheetTitle/)
    expect(contents, `${MARKER}: ${id}`).toMatch(/SheetDescription/)
    expect(contents, `${MARKER}: ${id}`).toMatch(/SheetBody/)
  })

  it('legal, geometry and mesa announce errors/status and restore focus to their trigger', () => {
    const surfaces = consumers
      .filter(([id]) => ['legal-editor', 'geometry-viewer', 'mesa'].includes(id))
      .map(([, path]) => source(path))
      .concat(primitive)
      .join('\n')
    expect(surfaces, MARKER).toMatch(/aria-live=(?:\{?["']polite["']\}?|["']assertive["'])/)
    expect(surfaces, MARKER).toMatch(/role=["'](?:status|alert)["']/)
    expect(surfaces, MARKER).toMatch(/triggerRef|returnFocusRef|focus\(\)/)
    expect(surfaces, MARKER).toMatch(/scroll-m[ty]-/)
  })
})
