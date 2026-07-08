/**
 * SDD 017 (T016) — Tests para updateEscrituraReviewPolicyAction
 * (apps/web/src/app/(dashboard)/settings/actions.ts).
 *
 * Verifica que:
 *   - solo un admin de la organización puede cambiar la política
 *   - escribe organizations.escritura_review_policy
 *   - audita el cambio (valor anterior → nuevo) vía logAudit
 *   - no escribe ni audita si el valor no cambió (idempotente)
 *   - propaga errores de lectura/escritura de Supabase sin reventar
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/services/audit.service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/services/audit.service'
import { updateEscrituraReviewPolicyAction } from '@/app/(dashboard)/settings/actions'

const ORG_ID = 'org-uuid-1'
const USER_ID = 'user-uuid-1'

function buildClientMock({
  user = { id: USER_ID } as { id: string } | null,
  member = { role: 'admin' } as { role: string } | null,
  current = { escritura_review_policy: 'every_sale' } as
    | { escritura_review_policy: string }
    | null,
  readError = null as string | null,
  updateError = null as string | null,
}: {
  user?: { id: string } | null
  member?: { role: string } | null
  current?: { escritura_review_policy: string } | null
  readError?: string | null
  updateError?: string | null
} = {}) {
  const getUser = vi.fn().mockResolvedValue({ data: { user } })

  // organization_members: .select().eq().eq().maybeSingle()
  const memberMaybeSingle = vi.fn().mockResolvedValue({ data: member, error: null })
  const memberEq2 = vi.fn().mockReturnValue({ maybeSingle: memberMaybeSingle })
  const memberEq1 = vi.fn().mockReturnValue({ eq: memberEq2 })
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq1 })

  // organizations select: .select().eq().maybeSingle()
  const currentMaybeSingle = vi.fn().mockResolvedValue({
    data: current,
    error: readError ? { message: readError } : null,
  })
  const currentEq = vi.fn().mockReturnValue({ maybeSingle: currentMaybeSingle })
  const currentSelect = vi.fn().mockReturnValue({ eq: currentEq })

  // organizations update: .update().eq()
  const updateEq = vi.fn().mockResolvedValue({
    error: updateError ? { message: updateError } : null,
  })
  const update = vi.fn().mockReturnValue({ eq: updateEq })

  const from = vi.fn((table: string) => {
    if (table === 'organization_members') return { select: memberSelect }
    if (table === 'organizations') return { select: currentSelect, update }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    client: { auth: { getUser }, from },
    spies: { memberSelect, currentSelect, update, updateEq },
  }
}

describe('updateEscrituraReviewPolicyAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns "No autorizado" when there is no session', async () => {
    const { client } = buildClientMock({ user: null })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const result = await updateEscrituraReviewPolicyAction(ORG_ID, 'exceptions_only')

    expect(result).toEqual({ error: 'No autorizado' })
  })

  it('rejects a non-admin member', async () => {
    const { client, spies } = buildClientMock({ member: { role: 'user' } })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const result = await updateEscrituraReviewPolicyAction(ORG_ID, 'exceptions_only')

    expect(result.error).toContain('administrador')
    expect(spies.update).not.toHaveBeenCalled()
  })

  it('rejects when membership lookup returns no row', async () => {
    const { client } = buildClientMock({ member: null })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const result = await updateEscrituraReviewPolicyAction(ORG_ID, 'exceptions_only')

    expect(result.error).toContain('administrador')
  })

  it('updates the policy and audits from → to when it changed', async () => {
    const { client, spies } = buildClientMock({
      current: { escritura_review_policy: 'every_sale' },
    })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const result = await updateEscrituraReviewPolicyAction(ORG_ID, 'exceptions_only')

    expect(result).toEqual({ success: true, data: { policy: 'exceptions_only' } })
    expect(spies.update).toHaveBeenCalledWith({ escritura_review_policy: 'exceptions_only' })
    expect(spies.updateEq).toHaveBeenCalledWith('id', ORG_ID)
    expect(logAudit).toHaveBeenCalledWith({
      actor: USER_ID,
      action: 'organization.escritura_review_policy_updated',
      entity: 'organizations',
      entity_id: ORG_ID,
      organization_id: ORG_ID,
      payload: { from: 'every_sale', to: 'exceptions_only' },
    })
  })

  it('is a no-op when the policy did not actually change', async () => {
    const { client, spies } = buildClientMock({
      current: { escritura_review_policy: 'exceptions_only' },
    })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const result = await updateEscrituraReviewPolicyAction(ORG_ID, 'exceptions_only')

    expect(result).toEqual({ success: true, data: { policy: 'exceptions_only' } })
    expect(spies.update).not.toHaveBeenCalled()
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('defaults the previous policy to every_sale when the org row has none set', async () => {
    const { client } = buildClientMock({ current: null })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const result = await updateEscrituraReviewPolicyAction(ORG_ID, 'exceptions_only')

    expect(result).toEqual({ success: true, data: { policy: 'exceptions_only' } })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { from: 'every_sale', to: 'exceptions_only' } })
    )
  })

  it('returns an error when the update fails', async () => {
    const { client } = buildClientMock({ updateError: 'db down' })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const result = await updateEscrituraReviewPolicyAction(ORG_ID, 'exceptions_only')

    expect(result.error).toBe('Error al actualizar la política de revisión jurídica.')
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('returns an error when reading the current policy fails', async () => {
    const { client } = buildClientMock({ readError: 'db down' })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const result = await updateEscrituraReviewPolicyAction(ORG_ID, 'exceptions_only')

    expect(result.error).toBe('Error al leer la política actual.')
  })
})
