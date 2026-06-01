import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { WorkspaceSettingsForm } from '@/components/dashboard/workspace-settings-form'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { BentoGrid } from '@/components/dashboard/bento-grid'

export const metadata = {
  title: 'Configuración del Workspace | Plotify',
}

export default async function WorkspaceSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  const workspace = await getActiveWorkspace(user.id)

  if (!workspace) {
    // Manejo de caso borde si el usuario no pertenece a ningún workspace aún.
    return (
      <PageShell>
        <PageHeader
          title="Configuración"
          description="Gestiona los ajustes de tu entorno de trabajo."
        />
        <div className="rounded-xl bg-amber-500/10 p-4 border border-amber-500/20 mt-6">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            No se encontró un Workspace activo para tu cuenta. Por favor, contacta a soporte.
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Configuración"
        description="Gestiona los ajustes de tu entorno de trabajo."
      />

      <BentoGrid className="mt-6">
        <div className="md:col-span-12">
          <WorkspaceSettingsForm workspace={workspace} />
        </div>
      </BentoGrid>
    </PageShell>
  )
}
