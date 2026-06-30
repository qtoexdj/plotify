import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

import { createClient } from '@/lib/supabase/server'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { revalidatePath } from 'next/cache'
import {
  createCustomSkill,
  publishCustomSkill,
  toggleOrgSkill,
  validateCustomSkill,
} from '@/actions/agent-skills.action'

const ORG_ID = 'org-uuid-1'
const SKILL_ID = 'skill-uuid-1'
const USER_ID = 'user-uuid-1'

function buildSupabaseClient({
  user = { id: USER_ID },
  member = { role: 'admin' },
  skill = { is_system: false, slug: 'seller_helper' },
  upsertError = null as string | null,
}: {
  user?: { id: string } | null
  member?: { role: string } | null
  skill?: { is_system: boolean; slug: string } | null
  upsertError?: string | null
} = {}) {
  const getUser = vi.fn().mockResolvedValue({ data: { user } })

  const memberSingle = vi.fn().mockResolvedValue({ data: member, error: null })
  const memberEq2 = vi.fn().mockReturnValue({ single: memberSingle })
  const memberEq1 = vi.fn().mockReturnValue({ eq: memberEq2 })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq1 })

  const skillSingle = vi.fn().mockResolvedValue({ data: skill, error: null })
  const skillEq = vi.fn().mockReturnValue({ single: skillSingle })
  const skillSelect = vi.fn().mockReturnValue({ eq: skillEq })

  const upsert = vi.fn().mockResolvedValue({
    error: upsertError ? { message: upsertError } : null,
  })

  const from = vi.fn((table: string) => {
    if (table === 'organization_members') return { select: memberSelect }
    if (table === 'agent_skills') return { select: skillSelect }
    if (table === 'org_skill_configs') return { upsert }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    supabase: { auth: { getUser }, from } as never,
    upsert,
  }
}

describe('SDD 012 US2 toggleOrgSkill invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: { status: 'invalidated', organization_id: ORG_ID },
      error: null,
      status: 200,
    })
  })

  it('calls the internal skill cache invalidation endpoint after a successful toggle', async () => {
    const { supabase } = buildSupabaseClient()
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, true)

    expect(result).toEqual({ success: true })
    expect(microserviceFetch).toHaveBeenCalledWith('/api/v1/skills/invalidate-cache', {
      method: 'POST',
      body: { organization_id: ORG_ID },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/agente/skills')
  })

  it('returns an operational error when cache invalidation fails', async () => {
    const { supabase, upsert } = buildSupabaseClient()
    vi.mocked(createClient).mockResolvedValue(supabase)
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: null,
      error: 'Microservice unavailable',
      status: 503,
    })

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, false)

    expect(upsert).toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.error).toBe('No se pudo actualizar el runtime del agente')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('does not invalidate cache when the Supabase upsert fails', async () => {
    const { supabase } = buildSupabaseClient({ upsertError: 'DB constraint violation' })
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, true)

    expect(result.success).toBe(false)
    expect(microserviceFetch).not.toHaveBeenCalled()
  })
})

describe('SDD 012 US3 custom skill actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates a custom markdown skill through the internal API', async () => {
    const { supabase } = buildSupabaseClient()
    vi.mocked(createClient).mockResolvedValue(supabase)
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        status: 'valid',
        normalized_slug: 'seller_helper',
        approved_tool_slugs: ['check_lot_availability'],
        errors: [],
        warnings: [],
      },
      error: null,
      status: 200,
    })

    const result = await validateCustomSkill({
      organizationId: ORG_ID,
      slug: 'Seller Helper',
      definitionMarkdown: '# Seller Helper',
      requiresRole: ['vendor'],
      approvedToolSlugs: ['check_lot_availability'],
      requiresMcp: false,
      mcpProvider: null,
    })

    expect(result.success).toBe(true)
    expect(result.validation?.status).toBe('valid')
    expect(microserviceFetch).toHaveBeenCalledWith('/api/v1/skills/validate-definition', {
      method: 'POST',
      body: {
        organization_id: ORG_ID,
        skill_id: null,
        slug: 'Seller Helper',
        definition_markdown: '# Seller Helper',
        requires_role: ['vendor'],
        approved_tool_slugs: ['check_lot_availability'],
        requires_mcp: false,
        mcp_provider: null,
      },
    })
  })

  it('creates a custom skill draft and revalidates the skills page', async () => {
    const { supabase } = buildSupabaseClient()
    vi.mocked(createClient).mockResolvedValue(supabase)
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        id: SKILL_ID,
        organization_id: ORG_ID,
        slug: 'seller_helper',
        name: 'Seller Helper',
        description: 'Ayuda a vendedores',
        definition_markdown: '# Seller Helper',
        approved_tool_slugs: ['check_lot_availability'],
        requires_role: ['vendor'],
        current_version: 1,
        validation_status: 'draft',
        validation_errors: [],
        requires_mcp: false,
        mcp_provider: null,
        updated_at: '2026-06-30T00:00:00Z',
      },
      error: null,
      status: 200,
    })

    const result = await createCustomSkill({
      organizationId: ORG_ID,
      slug: 'seller_helper',
      name: 'Seller Helper',
      description: 'Ayuda a vendedores',
      definitionMarkdown: '# Seller Helper',
      requiresRole: ['vendor'],
      approvedToolSlugs: ['check_lot_availability'],
      requiresMcp: false,
      mcpProvider: null,
      changeSummary: 'Primer borrador',
    })

    expect(result.success).toBe(true)
    expect(result.skill?.id).toBe(SKILL_ID)
    expect(microserviceFetch).toHaveBeenCalledWith('/api/v1/skills/custom', {
      method: 'POST',
      headers: { 'X-User-Id': USER_ID },
      body: {
        organization_id: ORG_ID,
        skill_id: null,
        slug: 'seller_helper',
        name: 'Seller Helper',
        description: 'Ayuda a vendedores',
        definition_markdown: '# Seller Helper',
        requires_role: ['vendor'],
        approved_tool_slugs: ['check_lot_availability'],
        requires_mcp: false,
        mcp_provider: null,
        change_summary: 'Primer borrador',
      },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/agente/skills')
  })

  it('publishes a saved custom skill through the internal API', async () => {
    const { supabase } = buildSupabaseClient()
    vi.mocked(createClient).mockResolvedValue(supabase)
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: {
        id: SKILL_ID,
        organization_id: ORG_ID,
        slug: 'seller_helper',
        name: 'Seller Helper',
        description: 'Ayuda a vendedores',
        definition_markdown: '# Seller Helper',
        approved_tool_slugs: ['check_lot_availability'],
        requires_role: ['vendor'],
        current_version: 2,
        validation_status: 'valid',
        validation_errors: [],
        requires_mcp: false,
        mcp_provider: null,
        updated_at: '2026-06-30T00:00:00Z',
      },
      error: null,
      status: 200,
    })

    const result = await publishCustomSkill({
      organizationId: ORG_ID,
      skillId: SKILL_ID,
      changeSummary: 'Publicar',
    })

    expect(result.success).toBe(true)
    expect(result.skill?.validation_status).toBe('valid')
    expect(microserviceFetch).toHaveBeenCalledWith('/api/v1/skills/custom/publish', {
      method: 'POST',
      headers: { 'X-User-Id': USER_ID },
      body: {
        organization_id: ORG_ID,
        skill_id: SKILL_ID,
        change_summary: 'Publicar',
      },
    })
  })

  it('does not call the internal API when the user is not org admin', async () => {
    const { supabase } = buildSupabaseClient({ member: { role: 'user' } })
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await createCustomSkill({
      organizationId: ORG_ID,
      slug: 'seller_helper',
      name: 'Seller Helper',
      description: 'Ayuda a vendedores',
      definitionMarkdown: '# Seller Helper',
      requiresRole: ['vendor'],
      approvedToolSlugs: ['check_lot_availability'],
      requiresMcp: false,
      mcpProvider: null,
      changeSummary: null,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('No autorizado')
    expect(microserviceFetch).not.toHaveBeenCalled()
  })
})
