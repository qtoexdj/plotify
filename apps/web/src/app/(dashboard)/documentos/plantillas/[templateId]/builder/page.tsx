import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { getTemplateWithBlocks, listBlocks } from '@/lib/services/documents.service'
import { TemplateBuilder } from '@/components/dashboard/documents/template-builder'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function TemplateBuilderPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
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
              Debes pertenecer a una organización para usar el constructor.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const [template, allBlocks] = await Promise.all([
    getTemplateWithBlocks(templateId),
    listBlocks(workspace.organization.id),
  ])

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col p-6 gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{template.name}</h1>
          <p className="text-muted-foreground text-sm">
            Constructor de estructura · {template.document_type}
          </p>
        </div>
      </div>

      <TemplateBuilder template={template} availableBlocks={allBlocks} />
    </div>
  )
}
