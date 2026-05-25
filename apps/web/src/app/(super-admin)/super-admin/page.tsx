import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Building04Icon,
  UserGroupIcon,
  Folder01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'

function formatCount(value: number | null) {
  return value ?? 0
}

export default async function SuperAdminDashboard() {
  const supabase = await createClient()

  const [organizations, profiles, projects, audits] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
  ])

  const { data: recentLogs } = await supabase
    .from('audit_logs')
    .select('id, actor, action, entity, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard Super Admin</h1>
        <p className="text-slate-600 mt-1">Vista global de la plataforma</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-slate-600">Empresas</CardTitle>
            <HugeiconsIcon icon={Building04Icon} className="w-5 h-5 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-slate-900">
              {formatCount(organizations.count)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-slate-600">Usuarios</CardTitle>
            <HugeiconsIcon icon={UserGroupIcon} className="w-5 h-5 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-slate-900">
              {formatCount(profiles.count)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-slate-600">Proyectos</CardTitle>
            <HugeiconsIcon icon={Folder01Icon} className="w-5 h-5 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-slate-900">
              {formatCount(projects.count)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-slate-600">Auditoria</CardTitle>
            <HugeiconsIcon icon={Search01Icon} className="w-5 h-5 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-slate-900">{formatCount(audits.count)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ultimos eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogs && recentLogs.length > 0 ? (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-1 border border-slate-200 rounded-lg p-3"
                >
                  <div className="text-sm text-slate-700">
                    <span className="font-medium">{log.action}</span> · {log.entity}
                  </div>
                  <div className="text-xs text-slate-500">
                    {log.actor || 'system'} · {log.created_at}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">No hay eventos recientes.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
