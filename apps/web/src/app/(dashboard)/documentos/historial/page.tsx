import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import {
  listOrganizationHistoryProjects,
  listOrganizationMinutaGenerations,
} from '@/lib/documents/matriz-history'
import { HistorialGeneraciones } from '@/components/documents/mesa/historial-generaciones'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type DocumentsHistoryPageProps = {
  searchParams?: Promise<{
    projectId?: string | string[]
  }>
}

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function DocumentsHistoryPage({ searchParams }: DocumentsHistoryPageProps) {
  const { user } = await getUserWithSuperAdmin()
  const params = (await searchParams) ?? {}

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

  const projects = await listOrganizationHistoryProjects(workspace.organization.id)
  const requestedProjectId = firstSearchParam(params.projectId)
  const selectedProject = projects.find((project) => project.id === requestedProjectId) ?? null
  const selectedProjectId = selectedProject?.id ?? null
  const generations = await listOrganizationMinutaGenerations(workspace.organization.id, {
    projectId: selectedProjectId,
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Historial de minutas</h1>
          <p className="text-muted-foreground mt-1">
            Minutas generadas desde escrituras aprobadas y expedientes vigentes.
          </p>
        </div>
        <form
          action="/documentos/historial"
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-end"
        >
          <label className="flex min-w-64 flex-col gap-1 text-sm font-medium" htmlFor="projectId">
            Proyecto
            <select
              id="projectId"
              name="projectId"
              defaultValue={selectedProjectId ?? ''}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              <option value="">Todos los proyectos</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
            {selectedProjectId ? (
              <Button type="button" variant="ghost" asChild>
                <Link href="/documentos/historial">Limpiar</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </div>

      <HistorialGeneraciones generations={generations} />
    </div>
  )
}
