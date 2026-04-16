import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function SuperAdminAuditLogs() {
  const supabase = await createClient()
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('id, actor, action, entity, entity_id, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Auditoria</h1>
        <p className="text-slate-600 mt-1">Eventos registrados por el sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ultimos eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {logs && logs.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="pb-3">Accion</th>
                    <th className="pb-3">Entidad</th>
                    <th className="pb-3">Actor</th>
                    <th className="pb-3">Fecha</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-slate-100">
                      <td className="py-3 font-medium">{log.action}</td>
                      <td className="py-3">{log.entity}</td>
                      <td className="py-3 text-slate-500">
                        {log.actor || 'system'}
                      </td>
                      <td className="py-3">{log.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-500">No hay eventos registrados.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
