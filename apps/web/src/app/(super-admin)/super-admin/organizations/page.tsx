import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { EmptyState } from '@/components/dashboard/empty-state'
import { Building03Icon } from '@hugeicons/core-free-icons'

export default async function SuperAdminOrganizations() {
  const supabase = await createClient()
  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name, slug, created_at')
    .order('created_at', { ascending: false })

  return (
    <PageShell>
      <PageHeader title="Empresas" description="Listado global de organizaciones" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organizaciones registradas</CardTitle>
        </CardHeader>
        <CardContent>
          {organizations && organizations.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-3">Nombre</th>
                    <th className="pb-3">Slug</th>
                    <th className="pb-3">Creado</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {organizations.map((org) => (
                    <tr key={org.id} className="border-t border-border">
                      <td className="py-3 font-medium">{org.name}</td>
                      <td className="py-3">{org.slug}</td>
                      <td className="py-3">{org.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Building03Icon}
              title="No hay empresas registradas"
              description="Aún no se ha registrado ninguna organización en la plataforma."
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
