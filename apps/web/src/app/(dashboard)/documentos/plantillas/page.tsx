import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { listTemplates } from '@/lib/services/documents.service'
import { TemplatesList } from '@/components/dashboard/documents/templates-list'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function PlantillasPage() {
  const { user } = await getUserWithSuperAdmin()

  if (!user) {
    redirect('/auth/login')
  }

  const workspace = await getActiveWorkspace(user.id)

  if (!workspace) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Sin workspace activo</CardTitle>
            <CardDescription>
              Debes pertenecer a una organización para gestionar plantillas.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const templates = await listTemplates(workspace.organization.id)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plantillas de Documento</h1>
        <p className="text-muted-foreground mt-1">
          Selecciona una plantilla para construir o generar documentos legales.
        </p>
      </div>

      <TemplatesList
        initialTemplates={templates}
        organizationId={workspace.organization.id}
      />
    </div>
  )
}
