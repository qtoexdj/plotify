/**
 * FASE 3 — F-v2-3.2
 * Tests para src/lib/services/agent-skills.service.ts
 *
 * Verifica que getSkillsForOrg():
 *   - consulta agent_skills con select('*').order('category')
 *   - consulta org_skill_configs con select('*').eq('organization_id', orgId)
 *   - fusiona org_config en cada skill por skill_id
 *   - devuelve [] cuando agent_skills retorna null
 *   - asigna org_config=null cuando no hay config para un skill_id dado
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getSkillsForOrg } from '@/lib/services/agent-skills.service'
import type { AgentSkill, OrgSkillConfig } from '@/types/v2'

const ORG_ID = 'org-uuid-1'

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const mockSkill1: AgentSkill = {
  id: 'skill-1',
  slug: 'search_projects',
  name: 'Buscar Proyectos',
  description: 'Busca proyectos disponibles',
  category: 'builtin',
  tool_definition: { name: 'search_projects', description: 'Busca proyectos', parameters: {} },
  approved_tool_slugs: [],
  created_by: null,
  current_version: 1,
  definition_markdown: null,
  is_system: true,
  requires_mcp: false,
  mcp_provider: null,
  organization_id: null,
  requires_role: ['admin', 'user'],
  enabled_by_default: true,
  created_at: null,
  updated_at: null,
  updated_by: null,
  validation_errors: [],
  validation_status: 'valid',
}

const mockSkill2: AgentSkill = {
  id: 'skill-2',
  slug: 'upload_drive',
  name: 'Subir a Drive',
  description: 'Sube documentos a Google Drive',
  category: 'mcp',
  tool_definition: {},
  approved_tool_slugs: [],
  created_by: null,
  current_version: 1,
  definition_markdown: null,
  is_system: false,
  requires_mcp: true,
  mcp_provider: 'google_drive',
  organization_id: null,
  requires_role: ['admin'],
  enabled_by_default: false,
  created_at: null,
  updated_at: null,
  updated_by: null,
  validation_errors: [],
  validation_status: 'valid',
}

const mockConfig: OrgSkillConfig = {
  id: 'config-1',
  organization_id: ORG_ID,
  skill_id: 'skill-2',
  enabled: true,
  config_overrides: null,
  enabled_by: 'user-abc',
  created_at: '2026-03-31',
  updated_at: '2026-03-31',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildSupabaseMock(skills: AgentSkill[] | null, configs: OrgSkillConfig[]) {
  const orderFn = vi.fn().mockResolvedValue({ data: skills, error: null })
  const selectSkills = vi.fn().mockReturnValue({ order: orderFn })

  const eqFn = vi.fn().mockResolvedValue({ data: configs, error: null })
  const selectConfigs = vi.fn().mockReturnValue({ eq: eqFn })

  const from = vi.fn((table: string) => {
    if (table === 'agent_skills') return { select: selectSkills }
    if (table === 'org_skill_configs') return { select: selectConfigs }
    throw new Error(`Tabla no esperada: ${table}`)
  })

  return { from, orderFn, selectSkills, eqFn, selectConfigs }
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('getSkillsForOrg', () => {
  beforeEach(() => vi.clearAllMocks())

  it('consulta agent_skills con select(*) ordenado por category', async () => {
    const { from, selectSkills, orderFn } = buildSupabaseMock([mockSkill1], [])
    vi.mocked(createClient).mockResolvedValue({ from } as never)

    await getSkillsForOrg(ORG_ID)

    expect(from).toHaveBeenCalledWith('agent_skills')
    expect(selectSkills).toHaveBeenCalledWith('*')
    expect(orderFn).toHaveBeenCalledWith('category', { ascending: true })
  })

  it('consulta org_skill_configs filtrando por organization_id', async () => {
    const { from, selectConfigs, eqFn } = buildSupabaseMock([mockSkill1], [])
    vi.mocked(createClient).mockResolvedValue({ from } as never)

    await getSkillsForOrg(ORG_ID)

    expect(from).toHaveBeenCalledWith('org_skill_configs')
    expect(selectConfigs).toHaveBeenCalledWith('*')
    expect(eqFn).toHaveBeenCalledWith('organization_id', ORG_ID)
  })

  it('retorna [] cuando agent_skills devuelve null', async () => {
    const { from } = buildSupabaseMock(null, [])
    vi.mocked(createClient).mockResolvedValue({ from } as never)

    const result = await getSkillsForOrg(ORG_ID)
    expect(result).toEqual([])
  })

  it('fusiona org_config cuando skill_id coincide con una config existente', async () => {
    const { from } = buildSupabaseMock([mockSkill1, mockSkill2], [mockConfig])
    vi.mocked(createClient).mockResolvedValue({ from } as never)

    const result = await getSkillsForOrg(ORG_ID)

    const skill2 = result.find((s) => s.id === 'skill-2')
    expect(skill2?.org_config).toEqual(mockConfig)
    expect(skill2?.org_config?.enabled).toBe(true)
  })

  it('asigna org_config=null cuando no hay config para el skill_id', async () => {
    const { from } = buildSupabaseMock([mockSkill1, mockSkill2], [mockConfig])
    vi.mocked(createClient).mockResolvedValue({ from } as never)

    const result = await getSkillsForOrg(ORG_ID)

    const skill1 = result.find((s) => s.id === 'skill-1')
    expect(skill1?.org_config).toBeNull()
  })

  it('devuelve la misma cantidad de skills que hay en la tabla', async () => {
    const { from } = buildSupabaseMock([mockSkill1, mockSkill2], [mockConfig])
    vi.mocked(createClient).mockResolvedValue({ from } as never)

    const result = await getSkillsForOrg(ORG_ID)
    expect(result).toHaveLength(2)
  })

  it('preserva todos los campos de la skill original', async () => {
    const { from } = buildSupabaseMock([mockSkill1], [])
    vi.mocked(createClient).mockResolvedValue({ from } as never)

    const result = await getSkillsForOrg(ORG_ID)
    const skill = result[0]

    expect(skill.slug).toBe('search_projects')
    expect(skill.is_system).toBe(true)
    expect(skill.enabled_by_default).toBe(true)
    expect(skill.requires_mcp).toBe(false)
  })
})
