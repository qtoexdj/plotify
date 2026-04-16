import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { listBlocks } from '@/lib/services/documents.service'
import { BlocksTable } from '@/components/dashboard/documents/blocks-table'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function BloquesPage() {
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
              Debes pertenecer a una organización para gestionar bloques.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const blocks = await listBlocks(workspace.organization.id)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bloques de Documentos</h1>
        <p className="text-muted-foreground mt-1">
          Artículos y cláusulas reutilizables para escrituras y contratos.
        </p>
      </div>

      <BlocksTable
        initialBlocks={blocks}
        organizationId={workspace.organization.id}
        userId={user.id}
      />
    </div>
  )
}
