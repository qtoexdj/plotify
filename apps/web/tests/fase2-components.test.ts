/**
 * FASE 2 — F-v2-2.2, F-v2-2.3, F-v2-2.4
 * Tests para la lógica de UI implementada en los componentes de Prompt Ops:
 *   - highlightPlaceholders  (prompt-editor.tsx)
 *   - computeDiff            (prompt-history.tsx)
 *   - CATEGORY_BADGE         (prompt-ops-table.tsx)
 *   - NAV_ITEMS              (SuperAdminSidebar.tsx)
 *
 * Todos son tests de lógica pura: no requieren DOM ni React renderer.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import React from 'react'

// ── Mocks de dependencias con efectos browser ────────────────────────────────
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/super-admin',
}))
vi.mock('next/link', () => ({ default: vi.fn() }))
vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: vi.fn() }))
vi.mock('@hugeicons/core-free-icons', () => ({
  DashboardCircleIcon: { __name: 'DashboardCircleIcon' },
  Building03Icon: { __name: 'Building03Icon' },
  UserGroupIcon: { __name: 'UserGroupIcon' },
  Folder02Icon: { __name: 'Folder02Icon' },
  FileSearchIcon: { __name: 'FileSearchIcon' },
  AiMagicIcon: { __name: 'AiMagicIcon' },
}))
vi.mock('@/components/ui/badge', () => ({ Badge: vi.fn() }))
vi.mock('@/components/ui/button', () => ({ Button: vi.fn() }))
vi.mock('@/components/ui/card', () => ({
  Card: vi.fn(),
  CardContent: vi.fn(),
  CardHeader: vi.fn(),
  CardTitle: vi.fn(),
  CardFooter: vi.fn(),
}))
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: vi.fn() }))
vi.mock('@/components/ui/separator', () => ({ Separator: vi.fn() }))
vi.mock('@/components/ui/textarea', () => ({ Textarea: vi.fn() }))
vi.mock('@/components/ui/input', () => ({ Input: vi.fn() }))
vi.mock('@/components/ui/label', () => ({ Label: vi.fn() }))
vi.mock('@/lib/utils', () => ({ cn: (...args: string[]) => args.filter(Boolean).join(' ') }))

// ─── highlightPlaceholders ─────────────────────────────────────────────────────
describe('highlightPlaceholders', () => {
  let highlightPlaceholders: (content: string) => React.ReactNode[]

  beforeAll(async () => {
    const mod = await import('@/components/super-admin/prompt-ops/prompt-editor')
    highlightPlaceholders = mod.highlightPlaceholders
  })

  it('retorna un solo elemento cuando el contenido no tiene placeholders', () => {
    const parts = highlightPlaceholders('Hola, soy un prompt sin variables.')
    expect(parts).toHaveLength(1)
    expect(React.isValidElement(parts[0])).toBe(true)
  })

  it('detecta un placeholder {organization_id} y lo devuelve como elemento <mark>', () => {
    const parts = highlightPlaceholders('Organización: {organization_id}')
    // split con grupo de captura produce: ['Organización: ', '{organization_id}', '']
    expect(parts).toHaveLength(3)
    const markPart = parts[1] as React.ReactElement
    expect(React.isValidElement(markPart)).toBe(true)
    expect(markPart.type).toBe('mark')
    expect((markPart.props as { children: string }).children).toBe('{organization_id}')
  })

  it('detecta múltiples placeholders en el mismo string', () => {
    const parts = highlightPlaceholders(
      'Hola {nombre}, tu organización es {org} y rol es {role}.'
    ) as React.ReactElement[]
    // Partes: 'Hola ', '{nombre}', ', tu organización es ', '{org}', ' y rol es ', '{role}', '.'
    expect(parts).toHaveLength(7)
    const markParts = parts.filter((p) => p.type === 'mark')
    expect(markParts).toHaveLength(3)
    const labels = markParts.map((m) => (m.props as { children: string }).children)
    expect(labels).toEqual(['{nombre}', '{org}', '{role}'])
  })

  it('no confunde texto que casi parece placeholder (sin cierre de llave)', () => {
    const parts = highlightPlaceholders('Este {abierto sin cerrar') as React.ReactElement[]
    const markParts = parts.filter((p) => p.type === 'mark')
    expect(markParts).toHaveLength(0)
  })

  it('cada elemento tiene una key única (no hay key duplicada)', () => {
    const parts = highlightPlaceholders('A {x} B {y} C') as React.ReactElement[]
    const keys = parts.map((p) => p.key)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })
})

// ─── computeDiff ───────────────────────────────────────────────────────────────
describe('computeDiff', () => {
  let computeDiff: (old: string, next: string) => { type: string; line: string }[]

  beforeAll(async () => {
    const mod = await import('@/components/super-admin/prompt-ops/prompt-history')
    computeDiff = mod.computeDiff
  })

  it('retorna solo líneas "unchanged" cuando los dos textos son idénticos', () => {
    const text = 'Línea 1\nLínea 2\nLínea 3'
    const diff = computeDiff(text, text)
    expect(diff.every((d) => d.type === 'unchanged')).toBe(true)
    expect(diff).toHaveLength(3)
  })

  it('marca como "removed" la línea que existe en oldText pero no en newText', () => {
    const diff = computeDiff('A\nB\nC', 'A\nC')
    const removed = diff.filter((d) => d.type === 'removed')
    expect(removed.some((d) => d.line === 'B')).toBe(true)
  })

  it('marca como "added" la línea que existe en newText pero no en oldText', () => {
    const diff = computeDiff('A\nC', 'A\nB\nC')
    const added = diff.filter((d) => d.type === 'added')
    expect(added.some((d) => d.line === 'B')).toBe(true)
  })

  it('cuando una línea cambia, emite "removed" (old) y "added" (new) en esa posición', () => {
    const diff = computeDiff('Hola mundo', 'Hola Plotify')
    const removed = diff.filter((d) => d.type === 'removed')
    const added = diff.filter((d) => d.type === 'added')
    expect(removed[0].line).toBe('Hola mundo')
    expect(added[0].line).toBe('Hola Plotify')
  })

  it('maneja correctamente el caso en que newText tiene más líneas (sólo adiciones)', () => {
    const diff = computeDiff('A', 'A\nB\nC')
    const added = diff.filter((d) => d.type === 'added')
    expect(added).toHaveLength(2)
    expect(added.map((d) => d.line)).toEqual(['B', 'C'])
  })

  it('maneja correctamente el caso en que oldText tiene más líneas (sólo remociones)', () => {
    const diff = computeDiff('A\nB\nC', 'A')
    const removed = diff.filter((d) => d.type === 'removed')
    expect(removed).toHaveLength(2)
    expect(removed.map((d) => d.line)).toEqual(['B', 'C'])
  })

  it('retorna 1 línea unchanged cuando ambos textos son strings vacíos', () => {
    const diff = computeDiff('', '')
    // split('\n') de '' = [''] → 1 línea vacía
    expect(diff).toHaveLength(1)
    expect(diff[0].type).toBe('unchanged')
    expect(diff[0].line).toBe('')
  })
})

// ─── CATEGORY_BADGE ───────────────────────────────────────────────────────────
describe('CATEGORY_BADGE', () => {
  let CATEGORY_BADGE: Record<string, { label: string; className: string }>

  beforeAll(async () => {
    const mod = await import('@/components/super-admin/prompt-ops/prompt-ops-table')
    CATEGORY_BADGE = mod.CATEGORY_BADGE
  })

  it('cubre las 3 categorías del plan: agent, tool_instruction, document', () => {
    expect(CATEGORY_BADGE).toHaveProperty('agent')
    expect(CATEGORY_BADGE).toHaveProperty('tool_instruction')
    expect(CATEGORY_BADGE).toHaveProperty('document')
  })

  it('la categoría "agent" tiene badge azul', () => {
    expect(CATEGORY_BADGE.agent.className).toContain('blue')
    expect(CATEGORY_BADGE.agent.label).toBeTruthy()
  })

  it('la categoría "tool_instruction" tiene badge verde', () => {
    expect(CATEGORY_BADGE.tool_instruction.className).toContain('green')
    expect(CATEGORY_BADGE.tool_instruction.label).toBeTruthy()
  })

  it('la categoría "document" tiene badge naranja', () => {
    expect(CATEGORY_BADGE.document.className).toContain('orange')
    expect(CATEGORY_BADGE.document.label).toBeTruthy()
  })
})

// ─── NAV_ITEMS (SuperAdminSidebar) ─────────────────────────────────────────────
describe('SuperAdminSidebar — NAV_ITEMS', () => {
  let NAV_ITEMS: { href: string; label: string; icon: unknown }[]

  beforeAll(async () => {
    const mod = await import('@/components/super-admin/SuperAdminSidebar')
    NAV_ITEMS = mod.NAV_ITEMS
  })

  it('incluye el item de Prompt Ops con la ruta correcta', () => {
    const promptOps = NAV_ITEMS.find((item) => item.href === '/super-admin/prompt-ops')
    expect(promptOps).toBeDefined()
  })

  it('el item de Prompt Ops tiene label "Prompt Ops"', () => {
    const promptOps = NAV_ITEMS.find((item) => item.href === '/super-admin/prompt-ops')
    expect(promptOps?.label).toBe('Prompt Ops')
  })

  it('el item de Prompt Ops tiene un icon asignado (AiMagicIcon)', () => {
    const promptOps = NAV_ITEMS.find((item) => item.href === '/super-admin/prompt-ops')
    expect(promptOps?.icon).toBeDefined()
  })

  it('conserva los items del plan original + el nuevo item de Prompt Ops (≥ 6)', () => {
    // Dashboard, Empresas, Usuarios, Loteos, Auditoria, Prompt Ops
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(6)
  })

  it('ningún item tiene href duplicado', () => {
    const hrefs = NAV_ITEMS.map((item) => item.href)
    const unique = new Set(hrefs)
    expect(unique.size).toBe(hrefs.length)
  })
})
