import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getGlobalKPIs, getVendorsPerformance } from '@/lib/services/dashboard.service'
import { DashboardKPIs } from '@/components/dashboard/dashboard-kpis'
import { VendorsList } from '@/components/dashboard/vendors-list'
import { createClient } from '@/lib/supabase/server'
import { PendingApprovalsPanel } from '@/components/dashboard/approvals/pending-approvals-panel'
import { VendorRequestsPanel } from '@/components/dashboard/approvals/vendor-requests-panel'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { BentoGrid } from '@/components/dashboard/bento-grid'

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
    <PageShell>
      <PageHeader
        title={`Hola, ${userGreetingName}`}
        description="Revisa el rendimiento global de tus proyectos y equipo de ventas."
      />

      <BentoGrid>
        {member?.role === 'admin' && (
          <div className="xl:col-span-12">
            <PendingApprovalsPanel organizationId={member.organization_id} />
          </div>
        )}

        {member?.role === 'vendor' && (
          <div className="xl:col-span-12">
            <VendorRequestsPanel userId={userId} organizationId={member.organization_id} />
          </div>
        )}

        {hasNoCommercialHistory ? (
          <div className="xl:col-span-12 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Primeros Pasos</h2>
            <OnboardingChecklist
              hasProjects={kpis.totalProjects > 0}
              hasVendors={vendors.length > 0}
              hasClients={false}
            />
          </div>
        ) : (
          <>
            <div className="xl:col-span-12 space-y-4">
              <h2 className="text-xl font-semibold tracking-tight">Resumen Global</h2>
              <DashboardKPIs kpis={kpis} />
            </div>

            <div className="xl:col-span-12 space-y-4">
              <h2 className="text-xl font-semibold tracking-tight">Equipo de Ventas</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <VendorsList vendors={vendors} />
              </div>
            </div>
          </>
        )}
      </BentoGrid>
    </PageShell>
  )
}
