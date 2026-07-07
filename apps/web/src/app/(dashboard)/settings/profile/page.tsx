import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from './actions'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { ProfileSettingsForm } from '@/components/dashboard/profile-settings-form'
import { ProfileTelegramConnection } from '@/components/dashboard/profile-telegram-connection'
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
        <div className="rounded-xl bg-warning/10 p-4 border border-warning/20 mt-6">
          <p className="text-sm text-warning font-medium">
            No se encontró el perfil para tu cuenta. Por favor, contacta a soporte.
          </p>
        </div>
      </PageShell>
    )
  }

  // Obtener el bot de Telegram de la organización activa para el deep link
  const workspace = await getActiveWorkspace(user.id)
  let botUsername: string | null = null
  if (workspace) {
    const { data: bot } = await supabase
      .from('telegram_bots')
      .select('bot_username')
      .eq('organization_id', workspace.organization.id)
      .eq('is_active', true)
      .maybeSingle()
    if (bot) {
      botUsername = bot.bot_username
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Perfil de Usuario"
        description="Gestiona tu información personal y datos de contacto."
      />

      <BentoGrid className="mt-6">
        <div className="md:col-span-12 lg:col-span-8">
          <ProfileSettingsForm profile={profile} email={user.email || ''} />
        </div>
        <div className="md:col-span-12 lg:col-span-4">
          <ProfileTelegramConnection
            userId={user.id}
            telegramChatId={profile.telegram_chat_id}
            botUsername={botUsername}
            organizationId={workspace?.organization.id ?? null}
          />
        </div>
      </BentoGrid>
    </PageShell>
  )
}
