import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { PromptOpsClient } from '@/components/super-admin/prompt-ops/prompt-ops-client'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'

export default async function PromptOpsPage() {
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user || !isSuperAdmin) {
    redirect('/super-admin')
  }

  return (
    <PageShell>
      <PageHeader
        title="Prompt Ops"
        description="Gestiona los system prompts del agente IA — versiona, prueba y publica"
      />

      <PromptOpsClient endpoint="/api/prompt-ops" />
    </PageShell>
  )
}
