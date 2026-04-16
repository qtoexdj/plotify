import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function SuperAdminProjects() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, estado, organization_id, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Proyectos</h1>
        <p className="text-slate-600 mt-1">Vista global de proyectos</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proyectos registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {projects && projects.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="pb-3">Proyecto</th>
                    <th className="pb-3">Estado</th>
                    <th className="pb-3">Organizacion</th>
                    <th className="pb-3">Creado</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {projects.map((project) => (
                    <tr key={project.id} className="border-t border-slate-100">
                      <td className="py-3 font-medium">{project.name}</td>
                      <td className="py-3">
                        <Badge variant={project.estado === 'activo' ? 'default' : 'secondary'}>
                          {project.estado}
                        </Badge>
                      </td>
                      <td className="py-3 font-mono text-xs text-slate-500">
                        {project.organization_id || '-'}
                      </td>
                      <td className="py-3">{project.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-500">No hay proyectos registrados.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
