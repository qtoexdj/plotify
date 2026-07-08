import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { PageHeader } from '@/components/dashboard/page-header'
import { PageShell } from '@/components/dashboard/page-shell'
import { EscrituraTabs } from '@/components/documents/escritura-tabs'
import { PlantillaEditor } from '@/components/documents/mesa/plantilla-editor'

export const metadata = {
  title: 'Plantillas de escritura | Plotify',
}

export default async function PlantillasPage() {
  const { user } = await getUserWithSuperAdmin()

  if (!user) {
    redirect('/auth/login')
  }

  const workspace = await getActiveWorkspace(user.id)

  // Guard server-side: solo administradores tienen acceso a plantillas
  if (!workspace || workspace.role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <PageShell>
      <PageHeader
        title="Plantillas de escritura"
        description="Redacta cláusulas, condiciones y alertas con nombres humanos."
      />
      <EscrituraTabs active="plantillas" />
      <PlantillaEditor />
    </PageShell>
  )
}
