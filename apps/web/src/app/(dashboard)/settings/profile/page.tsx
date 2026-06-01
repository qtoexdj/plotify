import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from './actions'
import { ProfileSettingsForm } from '@/components/dashboard/profile-settings-form'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { BentoGrid } from '@/components/dashboard/bento-grid'

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
      <PageShell>
        <PageHeader
          title="Perfil de Usuario"
          description="Gestiona tu información personal y datos de contacto."
        />
        <div className="rounded-xl bg-amber-500/10 p-4 border border-amber-500/20 mt-6">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            No se encontró el perfil para tu cuenta. Por favor, contacta a soporte.
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Perfil de Usuario"
        description="Gestiona tu información personal y datos de contacto."
      />

      <BentoGrid className="mt-6">
        <div className="md:col-span-12">
          <ProfileSettingsForm profile={profile} email={user.email || ''} />
        </div>
      </BentoGrid>
    </PageShell>
  )
}
