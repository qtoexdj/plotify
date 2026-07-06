import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSkillsForOrg } from '@/lib/services/agent-skills.service'
import { CustomSkillEditor } from '@/components/dashboard/skills/custom-skill-editor'
import { SkillsGrid } from '@/components/dashboard/skills/skills-grid'
import { AgenteTabs } from '@/components/agente/agente-tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { PageShell } from '@/components/dashboard/page-shell'

export const dynamic = 'force-dynamic'

export default async function SkillsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'admin') redirect('/')

  const organizationId = member.organization_id
  const skills = await getSkillsForOrg(organizationId)
  const availableTools = skills
    .filter(
      (skill) =>
        skill.organization_id === null &&
        ['builtin', 'mcp'].includes(skill.category ?? '') &&
        skill.validation_status !== 'blocked'
    )
    .map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      roles: skill.requires_role ?? [],
    }))

  return (
    <PageShell id="agent-skills-page">
      <PageHeader
        title="Skills del Agente"
        description="Habilita o deshabilita las herramientas que tu agente de IA puede utilizar."
      />
      <AgenteTabs active="skills" />
      <CustomSkillEditor organizationId={organizationId} availableTools={availableTools} />
      <SkillsGrid skills={skills} organizationId={organizationId} />
    </PageShell>
  )
}
