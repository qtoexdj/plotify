import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getGlobalKPIs, getVendorsPerformance } from '@/lib/services/dashboard.service'
import { DashboardKPIs } from '@/components/dashboard/dashboard-kpis'
import { VendorsList } from '@/components/dashboard/vendors-list'
import { createClient } from '@/lib/supabase/server'
import { PendingApprovalsPanel } from '@/components/dashboard/approvals/pending-approvals-panel'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user) {
    redirect('/auth/login')
  }

  if (isSuperAdmin) {
    redirect('/super-admin')
  }

  const supabase = await createClient()
  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  const userId = user.id

  // Realizar fetchs paralelos
  const [kpis, vendors] = await Promise.all([getGlobalKPIs(userId), getVendorsPerformance(userId)])

  // Sacamos el nombre si está disponible, si no derivamos del email
  const userGreetingName = user.user_metadata?.name || user.email?.split('@')[0] || 'Gestor'

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-slate-100">
          Hola, {userGreetingName}
        </h1>
        <p className="text-gray-500 dark:text-slate-400">
          Revisa el rendimiento global de tus proyectos y equipo de ventas.
        </p>
      </div>

      {member?.role === 'admin' && (
        <PendingApprovalsPanel organizationId={member.organization_id} />
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Resumen Global</h2>
        <DashboardKPIs kpis={kpis} />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Equipo de Ventas</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <VendorsList vendors={vendors} />
        </div>
      </div>
    </div>
  )
}
