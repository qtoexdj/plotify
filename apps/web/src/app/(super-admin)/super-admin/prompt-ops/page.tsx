import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { PromptOpsTable } from '@/components/super-admin/prompt-ops/prompt-ops-table'
import type { PromptWithActiveVersion } from '@/types/v2'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'

export default async function PromptOpsPage() {
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user || !isSuperAdmin) {
    redirect('/super-admin')
  }

  const supabase = await createClient()

  // Normalizar estructura (activa_version puede ser null si no hay versión activa aún)
  const { data: allPrompts } = await supabase
    .from('system_prompts')
    .select('*')
    .order('name', { ascending: true })

  const { data: activeVersions } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('is_active', true)

  const promptsWithVersion: PromptWithActiveVersion[] = (allPrompts ?? []).map((p) => ({
    ...p,
    active_version: activeVersions?.find((v) => v.prompt_id === p.id) ?? null,
  }))

  return (
    <PageShell>
      <PageHeader
        title="Prompt Ops"
        description="Gestiona los system prompts del agente IA — versiona, prueba y publica"
      />

      <PromptOpsTable prompts={promptsWithVersion} />
    </PageShell>
  )
}
