import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { WorkspaceSettingsForm } from '@/components/dashboard/workspace-settings-form'

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
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Configuración</h1>
        <div className="rounded-xl bg-amber-500/10 p-4 border border-amber-500/20">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            No se encontró un Workspace activo para tu cuenta. Por favor, contacta a soporte.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Configuración</h1>
        <p className="text-muted-foreground mt-1">Gestiona los ajustes de tu entorno de trabajo.</p>
      </div>

      <WorkspaceSettingsForm workspace={workspace} />
    </div>
  )
}
