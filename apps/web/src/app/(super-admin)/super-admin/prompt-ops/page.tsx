import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { PromptOpsTable } from '@/components/super-admin/prompt-ops/prompt-ops-table'
import type { PromptWithActiveVersion } from '@/types/v2'

export default async function PromptOpsPage() {
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user || !isSuperAdmin) {
    redirect('/super-admin')
  }

  const supabase = await createClient()

  const { data: prompts } = await supabase
    .from('system_prompts')
    .select(`
      *,
      active_version:prompt_versions!inner(
        id, version, created_at, is_active, change_note
      )
    `)
    .eq('prompt_versions.is_active', true)
    .order('created_at', { ascending: true })

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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Prompt Ops</h1>
        <p className="text-slate-600 mt-1">
          Gestiona los system prompts del agente IA — versiona, prueba y publica
        </p>
      </div>

      <PromptOpsTable prompts={promptsWithVersion} />
    </div>
  )
}
