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
        <h1 className="text-3xl font-bold text-slate-900">Configuración</h1>
        <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
          <p className="text-sm text-yellow-800">
            No se encontró un Workspace activo para tu cuenta. Por favor, contacta a soporte.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Configuración</h1>
        <p className="text-slate-600 mt-1">Gestiona los ajustes de tu entorno de trabajo.</p>
      </div>

      <WorkspaceSettingsForm workspace={workspace} />
    </div>
  )
}
