import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { EmptyState } from '@/components/dashboard/empty-state'
import { Folder01Icon } from '@hugeicons/core-free-icons'

export default async function SuperAdminProjects() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, estado, organization_id, created_at')
    .order('created_at', { ascending: false })

  return (
    <PageShell>
      <PageHeader title="Proyectos" description="Vista global de proyectos" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proyectos registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {projects && projects.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-3">Proyecto</th>
                    <th className="pb-3">Estado</th>
                    <th className="pb-3">Organización</th>
                    <th className="pb-3">Creado</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {projects.map((project) => (
                    <tr key={project.id} className="border-t border-border">
                      <td className="py-3 font-medium">{project.name}</td>
                      <td className="py-3">
                        <Badge variant={project.estado === 'activo' ? 'default' : 'secondary'}>
                          {project.estado}
                        </Badge>
                      </td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">
                        {project.organization_id || '-'}
                      </td>
                      <td className="py-3">{project.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Folder01Icon}
              title="No hay proyectos registrados"
              description="Aún no se ha registrado ningún proyecto en la plataforma."
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
