import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function SuperAdminUsers() {
  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, is_super_admin, updated_at')
    .order('updated_at', { ascending: false })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Usuarios</h1>
        <p className="text-slate-600 mt-1">Perfiles activos en la plataforma</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfiles</CardTitle>
        </CardHeader>
        <CardContent>
          {profiles && profiles.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="pb-3">ID</th>
                    <th className="pb-3">Usuario</th>
                    <th className="pb-3">Rol</th>
                    <th className="pb-3">Actualizado</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {profiles.map((profile) => (
                    <tr key={profile.id} className="border-t border-slate-100">
                      <td className="py-3 font-mono text-xs text-slate-500">{profile.id}</td>
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
            <div className="text-sm text-slate-500">No hay perfiles registrados.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
