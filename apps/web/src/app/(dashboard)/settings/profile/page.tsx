import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from './actions'
import { ProfileSettingsForm } from '@/components/dashboard/profile-settings-form'

export const metadata = {
  title: 'Perfil de Usuario | Plotify',
}

export default async function ProfileSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const profile = await getProfile(user.id)

  if (!profile) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Perfil</h1>
        <div className="rounded-xl bg-amber-500/10 p-4 border border-amber-500/20">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            No se encontró el perfil para tu cuenta. Por favor, contacta a soporte.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Perfil de Usuario</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona tu información personal y datos de contacto.
        </p>
      </div>

      <ProfileSettingsForm profile={profile} email={user.email || ''} />
    </div>
  )
}
