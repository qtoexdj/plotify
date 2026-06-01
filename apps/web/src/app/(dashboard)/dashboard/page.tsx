import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getGlobalKPIs, getVendorsPerformance } from '@/lib/services/dashboard.service'
import { DashboardKPIs } from '@/components/dashboard/dashboard-kpis'
import { VendorsList } from '@/components/dashboard/vendors-list'
import { createClient } from '@/lib/supabase/server'
import { PendingApprovalsPanel } from '@/components/dashboard/approvals/pending-approvals-panel'
import { VendorRequestsPanel } from '@/components/dashboard/approvals/vendor-requests-panel'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'

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

  const hasNoCommercialHistory = kpis.totalProjects === 0

  return (
    <div className="p-6 space-y-8 animate-fade-in-up">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Hola, {userGreetingName}
        </h1>
        <p className="text-muted-foreground">
          Revisa el rendimiento global de tus proyectos y equipo de ventas.
        </p>
      </div>

      {member?.role === 'admin' && (
        <PendingApprovalsPanel organizationId={member.organization_id} />
      )}

      {member?.role === 'vendor' && (
        <VendorRequestsPanel userId={userId} organizationId={member.organization_id} />
      )}

      {hasNoCommercialHistory ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Primeros Pasos</h2>
          <OnboardingChecklist
            hasProjects={kpis.totalProjects > 0}
            hasVendors={vendors.length > 0}
            hasClients={false}
          />
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}
