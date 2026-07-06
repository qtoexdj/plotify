import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const SRC_DIR = path.resolve(__dirname, '..', '..', 'src')

function readSrc(relativePath: string) {
  return fs.readFileSync(path.join(SRC_DIR, relativePath), 'utf-8')
}

describe('SDD 015 shell and responsive guardrails', () => {
  it('keeps Agente pages inside PageShell and PageHeader', () => {
    const agentePages = [
      'app/(dashboard)/agente/page.tsx',
      'app/(dashboard)/agente/skills/page.tsx',
      'app/(dashboard)/agente/integrations/page.tsx',
    ]

    for (const page of agentePages) {
      const source = readSrc(page)
      expect(source, page).toContain('PageShell')
      expect(source, page).toContain('PageHeader')
    }
  })

  it('mounts the command palette provider in dashboard and super-admin shells', () => {
    expect(readSrc('app/(dashboard)/layout.tsx')).toContain('CommandPaletteProvider')
    expect(readSrc('app/(super-admin)/layout.tsx')).toContain('CommandPaletteProvider')
    expect(readSrc('components/super-admin/SuperAdminSidebar.tsx')).toContain(
      'CommandPaletteTrigger'
    )
  })

  it('keeps inset sidebars visually floating and touch-friendly', () => {
    const sidebar = readSrc('components/ui/sidebar.tsx')
    const appSidebar = readSrc('components/app-sidebar.tsx')

    expect(sidebar).toContain('group-data-[variant=inset]:rounded-xl')
    expect(sidebar).toContain('bg-muted/40')
    expect(sidebar).toContain('bg-background')
    expect(sidebar).toContain("default: 'h-11 text-sm'")
    expect(appSidebar).toContain('Plotify')
    expect(appSidebar).toContain('text-sidebar-foreground/60')
  })

  it('keeps project detail aligned to the operational viewer summary', () => {
    const projectPage = readSrc('app/(dashboard)/projects/[projectId]/page.tsx')
    const overviewTab = readSrc('components/projects/detail/overview-tab.tsx')

    expect(projectPage).toContain('PageShell')
    expect(projectPage).toContain('PageHeader')
    expect(projectPage).toContain('OverviewTab')
    expect(projectPage).toContain('Ir al visor')
    expect(projectPage).toContain('handleStartSale')
    expect(projectPage).toContain('scrollIntoView')
    expect(projectPage).toContain('Administrar proyecto')
    expect(overviewTab).toContain('Ventas registradas')
    expect(overviewTab).toContain('Reservados')
  })

  it('keeps internal tabs at the 44px touch-target minimum', () => {
    expect(readSrc('components/agente/agente-tabs.tsx')).toContain('min-h-11')
    expect(readSrc('components/documents/escritura-tabs.tsx')).toContain('min-h-11')
  })

  it('keeps the mobile escritura desk on bottom sheets', () => {
    const mesa = readSrc('components/documents/mesa/mesa-escritura.tsx')
    const casePage = readSrc('app/(dashboard)/documentos/matriz/[caseId]/page.tsx')
    const projectPage = readSrc('app/(dashboard)/documentos/matriz/proyecto/[projectId]/page.tsx')

    expect(mesa).toContain('useIsMobile')
    expect(mesa).toContain('side="bottom"')
    expect(mesa).toContain('h-[80dvh]')
    expect(mesa).toContain('rounded-2xl bg-background/70')
    expect(casePage).not.toContain('PageHeader')
    expect(projectPage).not.toContain('PageHeader')
  })
})
