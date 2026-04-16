import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function SuperAdminOrganizations() {
  const supabase = await createClient()
  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name, slug, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Empresas</h1>
        <p className="text-slate-600 mt-1">Listado global de organizaciones</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organizaciones registradas</CardTitle>
        </CardHeader>
        <CardContent>
          {organizations && organizations.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="pb-3">Nombre</th>
                    <th className="pb-3">Slug</th>
                    <th className="pb-3">Creado</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {organizations.map((org) => (
                    <tr key={org.id} className="border-t border-slate-100">
                      <td className="py-3 font-medium">{org.name}</td>
                      <td className="py-3">{org.slug}</td>
                      <td className="py-3">{org.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-500">No hay empresas registradas.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
