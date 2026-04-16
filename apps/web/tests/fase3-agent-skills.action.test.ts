/**
 * FASE 3 — F-v2-3.1
 * Tests para src/actions/agent-skills.action.ts
 *
 * Verifica que toggleOrgSkill():
 *   - devuelve error 'No autenticado' cuando no hay sesión
 *   - devuelve error 'No autorizado' cuando el usuario no es admin de la org
 *   - devuelve error 'Skill no encontrada' cuando la skill no existe en DB
 *   - devuelve error al intentar deshabilitar una skill is_system=true
 *   - hace upsert correcto en org_skill_configs cuando todo es válido
 *   - devuelve { success: true } en el camino feliz
 *   - devuelve error genérico cuando el upsert falla en la DB
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}))

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { toggleOrgSkill } from '@/actions/agent-skills.action'

const ORG_ID = 'org-uuid-1'
const SKILL_ID = 'skill-uuid-1'
const USER_ID = 'user-uuid-1'

// ─── Helpers para construir mock de Supabase ──────────────────────────────────
function buildClientMock({
  user = { id: USER_ID },
  member = { role: 'admin' },
  skill = { is_system: false, slug: 'upload_drive' },
  upsertError = null as string | null,
}: {
  user?: { id: string } | null
  member?: { role: string } | null
  skill?: { is_system: boolean; slug: string } | null
  upsertError?: string | null
} = {}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user },
  })

  // organization_members chain: .select().eq().eq().single()
  const memberSingle = vi.fn().mockResolvedValue({ data: member, error: null })
  const memberEq2 = vi.fn().mockReturnValue({ single: memberSingle })
  const memberEq1 = vi.fn().mockReturnValue({ eq: memberEq2 })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq1 })

  // agent_skills chain: .select().eq().single()
  const skillSingle = vi.fn().mockResolvedValue({ data: skill, error: null })
  const skillEq = vi.fn().mockReturnValue({ single: skillSingle })
  const skillSelect = vi.fn().mockReturnValue({ eq: skillEq })

  // org_skill_configs chain: .upsert()
  const upsert = vi.fn().mockResolvedValue({
    error: upsertError ? { message: upsertError } : null,
  })

  const from = vi.fn((table: string) => {
    if (table === 'organization_members') return { select: memberSelect }
    if (table === 'agent_skills') return { select: skillSelect }
    if (table === 'org_skill_configs') return { upsert }
    throw new Error(`Tabla no esperada en mock: ${table}`)
  })

  return {
    supabase: { auth: { getUser }, from } as never,
    mocks: { getUser, memberSingle, skillSingle, upsert, from },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('toggleOrgSkill', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve { success: false, error: "No autenticado" } cuando no hay usuario', async () => {
    const { supabase } = buildClientMock({ user: null })
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, false)

    expect(result.success).toBe(false)
    expect(result.error).toBe('No autenticado')
  })

  it('devuelve { success: false, error: "No autorizado" } cuando member es null', async () => {
    const { supabase } = buildClientMock({ member: null })
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, false)

    expect(result.success).toBe(false)
    expect(result.error).toBe('No autorizado')
  })

  it('devuelve { success: false, error: "No autorizado" } cuando role !== admin', async () => {
    const { supabase } = buildClientMock({ member: { role: 'user' } })
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, false)

    expect(result.success).toBe(false)
    expect(result.error).toBe('No autorizado')
  })

  it('devuelve { success: false, error: "Skill no encontrada" } cuando skill es null', async () => {
    const { supabase } = buildClientMock({ skill: null })
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, true)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Skill no encontrada')
  })

  it('devuelve error cuando se intenta deshabilitar una skill is_system=true', async () => {
    const { supabase } = buildClientMock({
      skill: { is_system: true, slug: 'search_projects' },
    })
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, false)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Las skills del sistema no se pueden deshabilitar')
  })

  it('permite habilitar una skill is_system=true (enabled=true)', async () => {
    const { supabase } = buildClientMock({
      skill: { is_system: true, slug: 'search_projects' },
    })
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, true)

    expect(result.success).toBe(true)
  })

  it('hace upsert en org_skill_configs con los campos correctos', async () => {
    const { supabase, mocks } = buildClientMock()
    vi.mocked(createClient).mockResolvedValue(supabase)

    await toggleOrgSkill(ORG_ID, SKILL_ID, false)

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        skill_id: SKILL_ID,
        enabled: false,
        enabled_by: USER_ID,
        updated_at: expect.any(String),
      }),
      { onConflict: 'organization_id,skill_id' }
    )
  })

  it('devuelve { success: true } cuando el upsert es exitoso', async () => {
    const { supabase } = buildClientMock()
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, true)

    expect(result.success).toBe(true)
  })

  it('llama a revalidatePath("/agente/skills") cuando el upsert es exitoso', async () => {
    const { supabase } = buildClientMock()
    vi.mocked(createClient).mockResolvedValue(supabase)

    await toggleOrgSkill(ORG_ID, SKILL_ID, true)

    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/agente/skills')
  })

  it('devuelve error genérico cuando el upsert falla en DB', async () => {
    const { supabase } = buildClientMock({ upsertError: 'DB constraint violation' })
    vi.mocked(createClient).mockResolvedValue(supabase)

    const result = await toggleOrgSkill(ORG_ID, SKILL_ID, true)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Error al actualizar skill')
  })

  it('NO llama a revalidatePath cuando el upsert falla', async () => {
    const { supabase } = buildClientMock({ upsertError: 'error' })
    vi.mocked(createClient).mockResolvedValue(supabase)

    await toggleOrgSkill(ORG_ID, SKILL_ID, true)

    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })
})
