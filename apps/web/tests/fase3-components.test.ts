/**
 * FASE 3 — F-v2-3.3, F-v2-3.4
 * Tests de lógica pura para los componentes del Skills Dashboard:
 *   - getCategoryLabel      (skills-grid.tsx)
 *   - getCategoryVariant    (skills-grid.tsx)
 *   - getRoleBadgeVariant   (skills-grid.tsx)
 *   - getRoleLabel          (skills-grid.tsx)
 *   - getParameters         (skill-detail-modal.tsx)
 *   - navItems              (app-sidebar.tsx) — verifica que "Skills" está bajo "Agente"
 *
 * Todos son tests de lógica pura: no requieren DOM ni React renderer.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

// ─── Mocks de dependencias con efectos browser ────────────────────────────────
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agente/skills',
}))
vi.mock('next/link', () => ({ default: vi.fn() }))
vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: vi.fn() }))
vi.mock('@hugeicons/core-free-icons', () => ({
  LockIcon: { __name: 'LockIcon' },
  PuzzleIcon: { __name: 'PuzzleIcon' },
  ZapIcon: { __name: 'ZapIcon' },
  DatabaseIcon: { __name: 'DatabaseIcon' },
  DashboardCircleIcon: { __name: 'DashboardCircleIcon' },
  Folder02Icon: { __name: 'Folder02Icon' },
  UserGroupIcon: { __name: 'UserGroupIcon' },
  Settings01Icon: { __name: 'Settings01Icon' },
  UserStar01Icon: { __name: 'UserStar01Icon' },
  AiChat01Icon: { __name: 'AiChat01Icon' },
  File02Icon: { __name: 'File02Icon' },
}))
vi.mock('@/components/ui/card', () => ({
  Card: vi.fn(),
  CardContent: vi.fn(),
  CardHeader: vi.fn(),
  CardTitle: vi.fn(),
  CardDescription: vi.fn(),
}))
vi.mock('@/components/ui/badge', () => ({ Badge: vi.fn() }))
vi.mock('@/components/ui/switch', () => ({ Switch: vi.fn() }))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: vi.fn(),
  TooltipContent: vi.fn(),
  TooltipProvider: vi.fn(),
  TooltipTrigger: vi.fn(),
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: vi.fn(),
  DialogContent: vi.fn(),
  DialogHeader: vi.fn(),
  DialogTitle: vi.fn(),
  DialogDescription: vi.fn(),
}))
vi.mock('@/components/ui/label', () => ({ Label: vi.fn() }))
vi.mock('@/actions/agent-skills.action', () => ({
  toggleOrgSkill: vi.fn(),
}))
vi.mock('@/components/dashboard/skills/skill-detail-modal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/dashboard/skills/skill-detail-modal')>()
  return {
    ...actual,
    SkillDetailModal: vi.fn(),
  }
})
vi.mock('@/components/nav-main', () => ({ NavMain: vi.fn() }))
vi.mock('@/components/nav-user', () => ({ NavUser: vi.fn() }))
vi.mock('@/components/ui/sidebar', () => ({
  Sidebar: vi.fn(),
  SidebarFooter: vi.fn(),
  SidebarHeader: vi.fn(),
  SidebarMenu: vi.fn(),
  SidebarMenuButton: vi.fn(),
  SidebarMenuItem: vi.fn(),
  SidebarRail: vi.fn(),
}))

// ─── getCategoryLabel ──────────────────────────────────────────────────────────
describe('getCategoryLabel', () => {
  let getCategoryLabel: (category: string) => string

  beforeAll(async () => {
    const mod = await import('@/components/dashboard/skills/skills-grid')
    getCategoryLabel = mod.getCategoryLabel
  })

  it('devuelve "Integrado" para categoría "builtin"', () => {
    expect(getCategoryLabel('builtin')).toBe('Integrado')
  })

  it('devuelve "MCP" para categoría "mcp"', () => {
    expect(getCategoryLabel('mcp')).toBe('MCP')
  })

  it('devuelve "Custom" para categoría "custom"', () => {
    expect(getCategoryLabel('custom')).toBe('Custom')
  })

  it('devuelve la categoría raw para valores desconocidos', () => {
    expect(getCategoryLabel('experimental')).toBe('experimental')
  })
})

// ─── getCategoryVariant ───────────────────────────────────────────────────────
describe('getCategoryVariant', () => {
  let getCategoryVariant: (category: string) => 'default' | 'secondary' | 'outline'

  beforeAll(async () => {
    const mod = await import('@/components/dashboard/skills/skills-grid')
    getCategoryVariant = mod.getCategoryVariant
  })

  it('devuelve "default" para "builtin"', () => {
    expect(getCategoryVariant('builtin')).toBe('default')
  })

  it('devuelve "secondary" para "mcp"', () => {
    expect(getCategoryVariant('mcp')).toBe('secondary')
  })

  it('devuelve "outline" para "custom"', () => {
    expect(getCategoryVariant('custom')).toBe('outline')
  })

  it('devuelve "outline" para valores desconocidos', () => {
    expect(getCategoryVariant('unknown')).toBe('outline')
  })
})

// ─── getRoleBadgeVariant ──────────────────────────────────────────────────────
describe('getRoleBadgeVariant', () => {
  let getRoleBadgeVariant: (roles: string[] | null) => 'default' | 'secondary' | 'outline'

  beforeAll(async () => {
    const mod = await import('@/components/dashboard/skills/skills-grid')
    getRoleBadgeVariant = mod.getRoleBadgeVariant
  })

  it('devuelve "outline" cuando roles es null', () => {
    expect(getRoleBadgeVariant(null)).toBe('outline')
  })

  it('devuelve "outline" cuando roles es un array vacío', () => {
    expect(getRoleBadgeVariant([])).toBe('outline')
  })

  it('devuelve "default" cuando incluye super_admin', () => {
    expect(getRoleBadgeVariant(['super_admin'])).toBe('default')
  })

  it('devuelve "secondary" cuando incluye admin (sin super_admin)', () => {
    expect(getRoleBadgeVariant(['admin', 'user'])).toBe('secondary')
  })

  it('devuelve "outline" para roles sin admin ni super_admin', () => {
    expect(getRoleBadgeVariant(['user'])).toBe('outline')
  })
})

// ─── getRoleLabel ─────────────────────────────────────────────────────────────
describe('getRoleLabel', () => {
  let getRoleLabel: (roles: string[] | null) => string

  beforeAll(async () => {
    const mod = await import('@/components/dashboard/skills/skills-grid')
    getRoleLabel = mod.getRoleLabel
  })

  it('devuelve "Todos" cuando roles es null', () => {
    expect(getRoleLabel(null)).toBe('Todos')
  })

  it('devuelve "Todos" cuando roles es array vacío', () => {
    expect(getRoleLabel([])).toBe('Todos')
  })

  it('devuelve "Super Admin" cuando incluye super_admin', () => {
    expect(getRoleLabel(['super_admin'])).toBe('Super Admin')
  })

  it('devuelve "Admin" cuando incluye admin (sin super_admin)', () => {
    expect(getRoleLabel(['admin'])).toBe('Admin')
  })

  it('devuelve "Admin" para ["admin", "user"]', () => {
    expect(getRoleLabel(['admin', 'user'])).toBe('Admin')
  })

  it('devuelve los roles unidos por coma para valores sin admin', () => {
    expect(getRoleLabel(['user', 'vendor'])).toBe('user, vendor')
  })
})

// ─── getParameters ────────────────────────────────────────────────────────────
describe('getParameters', () => {
  let getParameters: (
    toolDef: unknown
  ) => Array<{ name: string; type: string; description: string; required: boolean }>

  beforeAll(async () => {
    const mod = await import('@/components/dashboard/skills/skill-detail-modal')
    getParameters = mod.getParameters
  })

  it('retorna [] cuando toolDefinition es null', () => {
    expect(getParameters(null)).toEqual([])
  })

  it('retorna [] cuando toolDefinition es una primitiva', () => {
    expect(getParameters('string')).toEqual([])
  })

  it('retorna [] cuando toolDefinition no tiene campo "parameters"', () => {
    expect(getParameters({ name: 'test' })).toEqual([])
  })

  it('retorna [] cuando parameters no tiene "properties"', () => {
    expect(getParameters({ parameters: { required: ['a'] } })).toEqual([])
  })

  it('extrae parámetros correctamente de un tool_definition válido', () => {
    const toolDef = {
      name: 'search_projects',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Texto a buscar' },
          limit: { type: 'number', description: 'Máximo de resultados' },
        },
      },
    }

    const params = getParameters(toolDef)

    expect(params).toHaveLength(2)
    const queryParam = params.find(p => p.name === 'query')
    expect(queryParam).toMatchObject({
      name: 'query',
      type: 'string',
      description: 'Texto a buscar',
      required: true,
    })
    const limitParam = params.find(p => p.name === 'limit')
    expect(limitParam).toMatchObject({
      name: 'limit',
      type: 'number',
      description: 'Máximo de resultados',
      required: false,
    })
  })

  it('marca required=false para parámetros no listados en required[]', () => {
    const toolDef = {
      parameters: {
        required: ['a'],
        properties: {
          a: { type: 'string', description: '' },
          b: { type: 'boolean', description: '' },
        },
      },
    }
    const params = getParameters(toolDef)
    expect(params.find(p => p.name === 'a')?.required).toBe(true)
    expect(params.find(p => p.name === 'b')?.required).toBe(false)
  })

  it('usa "any" como type cuando el schema no define type', () => {
    const toolDef = {
      parameters: {
        properties: {
          datos: { description: 'Sin tipo' },
        },
      },
    }
    const params = getParameters(toolDef)
    expect(params[0].type).toBe('any')
  })
})

// ─── navItems — Skills bajo Agente ────────────────────────────────────────────
describe('navItems (app-sidebar)', () => {
  let navItems: Array<{
    title: string
    url?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: any
    items?: Array<{ title: string; url: string }>
  }>

  beforeAll(async () => {
    const mod = await import('@/components/app-sidebar')
    navItems = mod.navItems
  })

  it('existe un grupo "Agente" en navItems', () => {
    const agente = navItems.find(item => item.title === 'Agente')
    expect(agente).toBeDefined()
  })

  it('el grupo "Agente" tiene sub-items', () => {
    const agente = navItems.find(item => item.title === 'Agente')
    expect(agente?.items).toBeDefined()
    expect(agente!.items!.length).toBeGreaterThan(0)
  })

  it('el grupo "Agente" contiene el sub-item "Skills" con url "/agente/skills"', () => {
    const agente = navItems.find(item => item.title === 'Agente')
    const skills = agente?.items?.find(sub => sub.title === 'Skills')
    expect(skills).toBeDefined()
    expect(skills?.url).toBe('/agente/skills')
  })

  it('el grupo "Agente" también conserva "Chat" e "Integraciones"', () => {
    const agente = navItems.find(item => item.title === 'Agente')
    const titles = agente?.items?.map(s => s.title) ?? []
    expect(titles).toContain('Chat')
    expect(titles).toContain('Integraciones')
  })
})
