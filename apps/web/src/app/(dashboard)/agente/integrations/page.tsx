import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/app/(dashboard)/settings/profile/actions'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { getOrganizationMembers } from '@/lib/services/vendors.service'
import { TelegramLinkCard } from '@/components/dashboard/telegram-link-card'
import { TelegramBotSetup } from '@/components/dashboard/telegram-bot-setup'
import { HugeiconsIcon } from '@hugeicons/react'
import { AiChat01Icon, SentIcon } from '@hugeicons/core-free-icons'

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
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Integraciones</h1>
        <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
          <p className="text-sm text-yellow-800">
            No se encontró tu perfil o workspace. Por favor, contacta a soporte.
          </p>
        </div>
      </div>
    )
  }

  const members = await getOrganizationMembers(workspace.organization.id)
  const isAdmin = members.find((m) => m.id === user.id)?.role === 'admin'

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header con estilo premium */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-blue-600 mb-1">
          <HugeiconsIcon icon={AiChat01Icon} size={20} />
          <span className="text-sm font-semibold uppercase tracking-wider">Agente IA</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Integraciones
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl">
          Conecta tu Agente de Plotify con plataformas externas para potenciar tus flujos de trabajo
          y recibir notificaciones en tiempo real.
        </p>
      </div>

      {/* Grid de Integraciones */}
      <div className="grid grid-cols-1 gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <HugeiconsIcon icon={SentIcon} className="text-[#2AABEE]" size={24} />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Telegram</h2>
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
        <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
          <p className="text-sm text-slate-500 text-center italic">
            Próximamente: WhatsApp Business, Slack, Zapier y más...
          </p>
        </div>
      </div>
    </div>
  )
}
