import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/app/(dashboard)/settings/profile/actions'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { getOrganizationMembers } from '@/lib/services/vendors.service'
import { TelegramLinkCard } from '@/components/dashboard/telegram-link-card'
import { TelegramBotSetup } from '@/components/dashboard/telegram-bot-setup'
import { HugeiconsIcon } from '@hugeicons/react'
import { SentIcon } from '@hugeicons/core-free-icons'
import { AgenteTabs } from '@/components/agente/agente-tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { PageShell } from '@/components/dashboard/page-shell'

export const metadata = {
  title: 'Integraciones | Agente Plotify',
}

export default async function IntegrationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const profile = await getProfile(user.id)
  const workspace = await getActiveWorkspace(user.id)

  if (!profile || !workspace) {
    return (
      <PageShell className="max-w-4xl">
        <PageHeader
          title="Integraciones"
          description="Conecta tu Agente de Plotify con plataformas externas."
        />
        <AgenteTabs active="integraciones" />
        <div className="rounded-md bg-warning/10 p-4 border border-warning/20">
          <p className="text-sm text-warning">
            No se encontró tu perfil o workspace. Por favor, contacta a soporte.
          </p>
        </div>
      </PageShell>
    )
  }

  const members = await getOrganizationMembers(workspace.organization.id, supabase)
  const isAdmin = members.find((m) => m.id === user.id)?.role === 'admin'

  return (
    <PageShell className="max-w-4xl">
      <PageHeader
        title="Integraciones"
        description="Conecta tu Agente de Plotify con plataformas externas para potenciar tus flujos de trabajo y recibir notificaciones en tiempo real."
      />
      <AgenteTabs active="integraciones" />
      <div className="grid grid-cols-1 gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <HugeiconsIcon icon={SentIcon} className="text-[#2AABEE]" size={24} />
            <h2 className="font-display text-xl font-semibold text-foreground">Telegram</h2>
          </div>

          {/* Sección de Setup para Administradores de la Organización */}
          {isAdmin && (
            <div className="animate-in slide-in-from-bottom-4 duration-700 delay-100 mb-8">
              <h3 className="text-lg font-semibold mb-4">Configuración del Bot (Admin)</h3>
              <TelegramBotSetup organizationId={workspace.organization.id} />
            </div>
          )}

          <div className="animate-in slide-in-from-bottom-4 duration-700 delay-150">
            <h3 className="text-lg font-semibold mb-4">Vinculación Personal</h3>
            <TelegramLinkCard
              profileId={profile.id}
              telegramChatId={profile.telegram_chat_id}
              organizationId={workspace.organization.id}
            />
          </div>
        </div>

        {/* Placeholder para futuras integraciones */}
        <div className="mt-8 pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground text-center italic">
            Próximamente: WhatsApp Business, Slack, Zapier y más...
          </p>
        </div>
      </div>
    </PageShell>
  )
}
