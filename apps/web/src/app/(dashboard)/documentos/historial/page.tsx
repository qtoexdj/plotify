import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { listOrganizationMinutaGenerations } from '@/lib/documents/matriz-history'
import { GenerationHistory } from '@/components/documents/matriz/generation-history'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DocumentsHistoryPage() {
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
              Debes pertenecer a una organización para ver el historial de documentos.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const generations = await listOrganizationMinutaGenerations(workspace.organization.id)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Historial de Minutas</h1>
        <p className="text-muted-foreground mt-1">
          Minutas DOCX generadas desde matrices aprobadas y snapshots vigentes.
        </p>
      </div>

      <GenerationHistory generations={generations} />
    </div>
  )
}
