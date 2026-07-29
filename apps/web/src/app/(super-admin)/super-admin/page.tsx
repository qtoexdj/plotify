import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Building04Icon,
  UserGroupIcon,
  Folder01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { EmptyState } from '@/components/dashboard/empty-state'

function formatCount(value: number | null) {
  return value ?? 0
}

export default async function SuperAdminDashboard() {
  // Telegram administration is available only through the same-origin gateway.
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
    <PageShell>
      <PageHeader title="Dashboard Super Admin" description="Vista global de la plataforma" />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Empresas</CardTitle>
            <HugeiconsIcon icon={Building04Icon} className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold text-foreground">
              {formatCount(organizations.count)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Usuarios</CardTitle>
            <HugeiconsIcon icon={UserGroupIcon} className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold text-foreground">
              {formatCount(profiles.count)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Proyectos</CardTitle>
            <HugeiconsIcon icon={Folder01Icon} className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold text-foreground">
              {formatCount(projects.count)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Auditoría</CardTitle>
            <HugeiconsIcon icon={Search01Icon} className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-semibold text-foreground">
              {formatCount(audits.count)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogs && recentLogs.length > 0 ? (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-1 border border-border rounded-lg p-3"
                >
                  <div className="text-sm text-foreground">
                    <span className="font-medium">{log.action}</span> · {log.entity}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {log.actor || 'system'} · {log.created_at}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Search01Icon}
              title="No hay eventos recientes"
              description="Aún no se ha registrado actividad reciente en la plataforma."
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
