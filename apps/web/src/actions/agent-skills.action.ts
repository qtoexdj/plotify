'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'
import { microserviceFetch } from '@/lib/services/microservice.client'

export interface SkillValidationError {
  code: string
  message: string
  field?: string | null
}

export interface SkillValidationResult {
  status: 'valid' | 'blocked'
  normalized_slug: string
  approved_tool_slugs: string[]
  errors: SkillValidationError[]
  warnings: string[]
}

export interface CustomSkillApiResponse {
  id: string
  organization_id: string
  slug: string
  name: string
  description: string
  definition_markdown: string
  approved_tool_slugs: string[]
  requires_role: string[]
  current_version: number
  validation_status: 'draft' | 'valid' | 'blocked'
  validation_errors: SkillValidationError[]
  requires_mcp: boolean
  mcp_provider: string | null
  updated_at: string | null
}

interface CustomSkillDefinitionInput {
  organizationId: string
  skillId?: string | null
  slug: string
  definitionMarkdown: string
  requiresRole: string[]
  approvedToolSlugs: string[]
  requiresMcp: boolean
  mcpProvider?: string | null
}

interface CustomSkillSaveInput extends CustomSkillDefinitionInput {
  name: string
  description: string
  changeSummary?: string | null
}

interface CustomSkillPublishInput {
  organizationId: string
  skillId: string
  changeSummary?: string | null
}

async function requireOrgAdmin(organizationId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'No autenticado' }

  const { data: member } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .single()

  if (!member || member.role !== 'admin') {
    return { ok: false as const, error: 'No autorizado' }
  }

  return { ok: true as const, userId: user.id }
}

export async function toggleOrgSkill(organizationId: string, skillId: string, enabled: boolean) {
  const admin = await requireOrgAdmin(organizationId)
  if (!admin.ok) return { success: false, error: admin.error }

  const supabase = await createClient()

  // Verificar que la skill no es is_system (no se puede deshabilitar)
  const { data: skill } = await supabase
    .from('agent_skills')
    .select('is_system, slug')
    .eq('id', skillId)
    .single()

  if (!skill) return { success: false, error: 'Skill no encontrada' }
  if (skill.is_system && !enabled) {
    return { success: false, error: 'Las skills del sistema no se pueden deshabilitar' }
  }

  // Upsert en org_skill_configs
  const { error } = await supabase.from('org_skill_configs').upsert(
    {
      organization_id: organizationId,
      skill_id: skillId,
      enabled,
      enabled_by: admin.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,skill_id' }
  )

  if (error) {
    logger.error({ error, skillId, organizationId }, 'toggle_skill_failed')
    return { success: false, error: 'Error al actualizar skill' }
  }

  const invalidation = await microserviceFetch<{
    status: string
    organization_id: string
  }>('/api/v1/skills/invalidate-cache', {
    method: 'POST',
    body: { organization_id: organizationId },
  })

  if (invalidation.error || invalidation.status >= 400) {
    logger.error(
      {
        error: invalidation.error,
        status: invalidation.status,
        skillId,
        organizationId,
      },
      'toggle_skill_invalidation_failed'
    )
    return { success: false, error: 'No se pudo actualizar el runtime del agente' }
  }

  revalidatePath('/agente/skills')
  return { success: true }
}

export async function validateCustomSkill(input: CustomSkillDefinitionInput): Promise<{
  success: boolean
  validation?: SkillValidationResult
  error?: string
}> {
  const admin = await requireOrgAdmin(input.organizationId)
  if (!admin.ok) return { success: false, error: admin.error }

  const response = await microserviceFetch<SkillValidationResult>(
    '/api/v1/skills/validate-definition',
    {
      method: 'POST',
      body: {
        organization_id: input.organizationId,
        skill_id: input.skillId ?? null,
        slug: input.slug,
        definition_markdown: input.definitionMarkdown,
        requires_role: input.requiresRole,
        approved_tool_slugs: input.approvedToolSlugs,
        requires_mcp: input.requiresMcp,
        mcp_provider: input.mcpProvider ?? null,
      },
    }
  )

  if (response.error || response.status >= 400 || !response.data) {
    logger.error({ error: response.error, status: response.status }, 'validate_custom_skill_failed')
    return { success: false, error: response.error ?? 'No se pudo validar la skill' }
  }

  return { success: true, validation: response.data }
}

export async function createCustomSkill(input: CustomSkillSaveInput): Promise<{
  success: boolean
  skill?: CustomSkillApiResponse
  error?: string
}> {
  const admin = await requireOrgAdmin(input.organizationId)
  if (!admin.ok) return { success: false, error: admin.error }

  const response = await microserviceFetch<CustomSkillApiResponse>('/api/v1/skills/custom', {
    method: 'POST',
    headers: { 'X-User-Id': admin.userId },
    body: {
      organization_id: input.organizationId,
      skill_id: input.skillId ?? null,
      slug: input.slug,
      name: input.name,
      description: input.description,
      definition_markdown: input.definitionMarkdown,
      requires_role: input.requiresRole,
      approved_tool_slugs: input.approvedToolSlugs,
      requires_mcp: input.requiresMcp,
      mcp_provider: input.mcpProvider ?? null,
      change_summary: input.changeSummary ?? null,
    },
  })

  if (response.error || response.status >= 400 || !response.data) {
    logger.error({ error: response.error, status: response.status }, 'create_custom_skill_failed')
    return { success: false, error: response.error ?? 'No se pudo guardar la skill' }
  }

  revalidatePath('/agente/skills')
  return { success: true, skill: response.data }
}

export async function publishCustomSkill(input: CustomSkillPublishInput): Promise<{
  success: boolean
  skill?: CustomSkillApiResponse
  error?: string
}> {
  const admin = await requireOrgAdmin(input.organizationId)
  if (!admin.ok) return { success: false, error: admin.error }

  const response = await microserviceFetch<CustomSkillApiResponse>(
    '/api/v1/skills/custom/publish',
    {
      method: 'POST',
      headers: { 'X-User-Id': admin.userId },
      body: {
        organization_id: input.organizationId,
        skill_id: input.skillId,
        change_summary: input.changeSummary ?? null,
      },
    }
  )

  if (response.error || response.status >= 400 || !response.data) {
    logger.error({ error: response.error, status: response.status }, 'publish_custom_skill_failed')
    return { success: false, error: response.error ?? 'No se pudo publicar la skill' }
  }

  revalidatePath('/agente/skills')
  return { success: true, skill: response.data }
}
