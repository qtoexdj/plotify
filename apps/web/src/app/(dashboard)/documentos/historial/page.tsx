import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { listGeneratedDocs } from '@/lib/services/documents.service'
import { DocumentsHistoryTable } from '@/components/dashboard/documents/documents-history-table'
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

  const documents = await listGeneratedDocs(workspace.organization.id)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Historial de Documentos</h1>
        <p className="text-muted-foreground mt-1">
          Escrituras y documentos legales generados por tu organización.
        </p>
      </div>

      <DocumentsHistoryTable documents={documents} />
    </div>
  )
}
