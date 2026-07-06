import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { EmptyState } from '@/components/dashboard/empty-state'
import { FileSearchIcon } from '@hugeicons/core-free-icons'

export default async function SuperAdminAuditLogs() {
  const supabase = await createClient()
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('id, actor, action, entity, entity_id, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <PageShell>
      <PageHeader title="Auditoría" description="Eventos registrados por el sistema" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {logs && logs.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-3">Acción</th>
                    <th className="pb-3">Entidad</th>
                    <th className="pb-3">Actor</th>
                    <th className="pb-3">Fecha</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-border">
                      <td className="py-3 font-medium">{log.action}</td>
                      <td className="py-3">{log.entity}</td>
                      <td className="py-3 text-muted-foreground">{log.actor || 'system'}</td>
                      <td className="py-3">{log.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={FileSearchIcon}
              title="No hay eventos registrados"
              description="Aún no se ha registrado actividad de auditoría en el sistema."
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
