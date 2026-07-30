import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { LlmAdminClient } from '@/components/super-admin/llms/llm-admin-client'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'

export default async function LlmsPage() {
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user || !isSuperAdmin) {
    redirect('/super-admin')
  }

  return (
    <PageShell>
      <PageHeader
        title="LLMs"
        description="Configura proveedores, modelos y razonamiento por tarea del agente"
      />
      <LlmAdminClient />
    </PageShell>
  )
}
