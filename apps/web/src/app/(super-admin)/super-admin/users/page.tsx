import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { EmptyState } from '@/components/dashboard/empty-state'
import { UserGroupIcon } from '@hugeicons/core-free-icons'

export default async function SuperAdminUsers() {
  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, is_super_admin, updated_at')
    .order('updated_at', { ascending: false })

  return (
    <PageShell>
      <PageHeader title="Usuarios" description="Perfiles activos en la plataforma" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfiles</CardTitle>
        </CardHeader>
        <CardContent>
          {profiles && profiles.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-3">ID</th>
                    <th className="pb-3">Usuario</th>
                    <th className="pb-3">Rol</th>
                    <th className="pb-3">Actualizado</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {profiles.map((profile) => (
                    <tr key={profile.id} className="border-t border-border">
                      <td className="py-3 font-mono text-xs text-muted-foreground">{profile.id}</td>
                      <td className="py-3">{profile.username || 'sin-username'}</td>
                      <td className="py-3">
                        {profile.is_super_admin ? (
                          <Badge>superadmin</Badge>
                        ) : (
                          <Badge variant="secondary">usuario</Badge>
                        )}
                      </td>
                      <td className="py-3">{profile.updated_at || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={UserGroupIcon}
              title="No hay perfiles registrados"
              description="Aún no hay perfiles de usuario registrados en la plataforma."
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
