import { createClient } from '@/lib/supabase/server'
import type { SkillWithConfig } from '@/types/v2'

export async function getSkillsForOrg(organizationId: string): Promise<SkillWithConfig[]> {
  const supabase = await createClient()

  const { data: skills } = await supabase
    .from('agent_skills')
    .select('*')
    .order('category', { ascending: true })

  if (!skills) return []

  const { data: configs } = await supabase
    .from('org_skill_configs')
    .select('*')
    .eq('organization_id', organizationId)

  const configMap = new Map(configs?.map((c) => [c.skill_id, c]) ?? [])

  return skills.map((skill) => ({
    ...skill,
    org_config: configMap.get(skill.id) ?? null,
  }))
}
