import { createClient } from '@/lib/supabase/server'
import type { SkillWithConfig } from '@/types/v2'

export async function getSkillsForOrg(organizationId: string): Promise<SkillWithConfig[]> {
  const supabase = await createClient()

  const { data: skills } = await supabase
    .from('agent_skills')
    .select('*')
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order('category', { ascending: true })

  if (!skills) return []

  const { data: configs } = await supabase
    .from('org_skill_configs')
    .select('*')
    .eq('organization_id', organizationId)

  const { data: mcpConnections } = await supabase
    .from('mcp_connections')
    .select('provider,status')
    .eq('organization_id', organizationId)

  const configMap = new Map(configs?.map((c) => [c.skill_id, c]) ?? [])
  const mcpStatusByProvider = new Map<string, string>()
  for (const connection of mcpConnections ?? []) {
    const provider = connection.provider
    if (!provider) continue
    const currentStatus = mcpStatusByProvider.get(provider)
    if (!currentStatus || currentStatus !== 'active') {
      mcpStatusByProvider.set(provider, connection.status)
    }
  }

  return skills.map((skill) => {
    const mcpConnectionStatus = skill.mcp_provider
      ? (mcpStatusByProvider.get(skill.mcp_provider) ?? null)
      : null
    const mcpRequirementState = !skill.requires_mcp
      ? 'none'
      : mcpConnectionStatus === 'active'
        ? 'ready'
        : mcpConnectionStatus === 'revoked' ||
            mcpConnectionStatus === 'expired' ||
            mcpConnectionStatus === 'error'
          ? mcpConnectionStatus
          : 'pending'

    return {
      ...skill,
      org_config: configMap.get(skill.id) ?? null,
      mcp_ready: mcpRequirementState === 'ready' || mcpRequirementState === 'none',
      mcp_requirement_state: mcpRequirementState,
      mcp_connection_status: mcpConnectionStatus,
    }
  })
}
