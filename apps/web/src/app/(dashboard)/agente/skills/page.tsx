import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSkillsForOrg } from '@/lib/services/agent-skills.service'
import { SkillsGrid } from '@/components/dashboard/skills/skills-grid'

export const dynamic = 'force-dynamic'

export default async function SkillsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'admin') redirect('/')

  const skills = await getSkillsForOrg(member.organization_id)

  return (
    <div className="p-6 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Skills del Agente</h1>
        <p className="text-muted-foreground mt-1">
          Habilita o deshabilita las herramientas que tu agente de IA puede utilizar
        </p>
      </div>
      <SkillsGrid
        skills={skills}
        organizationId={member.organization_id}
      />
    </div>
  )
}
