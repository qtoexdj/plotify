import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { WorkspaceSettingsForm } from '@/components/dashboard/workspace-settings-form'
import { WorkspaceEscrituraConfigForm } from '@/components/dashboard/workspace-escritura-config-form'
import { WorkspaceTelegramBotForm } from '@/components/dashboard/workspace-telegram-bot-form'
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
        <div className="rounded-xl bg-warning/10 p-4 border border-warning/20 mt-6">
          <p className="text-sm text-warning font-medium">
            No se encontró un Workspace activo para tu cuenta. Por favor, contacta a soporte.
          </p>
        </div>
      </PageShell>
    )
  }

  // 1. Obtener la información de pago de la organización
  const { data: paymentInfo } = await supabase
    .from('organization_payment_info')
    .select('razon_social, rut, banco, tipo_cuenta, numero_cuenta, email_transferencia')
    .eq('organization_id', workspace.organization.id)
    .maybeSingle()

  // 2. Obtener el primer proyecto activo para leer sus variables y pre-cargar defaults
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('organization_id', workspace.organization.id)
    .limit(1)

  const initialVariables: Record<string, string> = {}
  if (projects && projects.length > 0) {
    const { data: resolutions } = await supabase
      .from('variable_resolutions')
      .select('variable_key, value_text')
      .eq('project_id', projects[0].id)
      .in('variable_key', [
        'documento.abogado_redactor.nombre',
        'documento.abogado_redactor.rut',
        'documento.abogado_redactor.email',
        'mandato.rectificacion_nombre',
        'mandato.rectificacion_rut',
        'mandato.facultades',
      ])
      .is('lot_id', null)
      .is('escritura_case_id', null)
      .neq('state', 'superseded')

    if (resolutions) {
      resolutions.forEach((r) => {
        initialVariables[r.variable_key] = r.value_text || ''
      })
    }
  }

  // 3. Obtener el bot de Telegram de la organización
  const { data: telegramBot } = await supabase
    .from('telegram_bots')
    .select('bot_username, is_active')
    .eq('organization_id', workspace.organization.id)
    .maybeSingle()

  const isAdmin = workspace.role === 'admin'

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
        <div className="md:col-span-12 mt-6">
          <WorkspaceEscrituraConfigForm
            orgId={workspace.organization.id}
            isAdmin={isAdmin}
            initialPaymentInfo={paymentInfo}
            initialVariables={initialVariables}
          />
        </div>
        <div className="md:col-span-12 mt-6">
          <WorkspaceTelegramBotForm
            orgId={workspace.organization.id}
            isAdmin={isAdmin}
            initialBot={telegramBot}
          />
        </div>
      </BentoGrid>
    </PageShell>
  )
}
