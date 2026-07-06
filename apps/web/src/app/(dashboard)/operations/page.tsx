import { Suspense } from 'react'
import { getAllActiveLots } from '@/lib/services/operations.service'
import { OperationsTable } from '@/components/operations/OperationsTable'
import { KPICards } from '@/components/operations/KPICards'
import { Skeleton } from '@/components/ui/skeleton'
import { SkeletonTable } from '@/components/dashboard/skeleton-card'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { BentoPanel } from '@/components/dashboard/bento-grid'

// Force dynamic rendering since data changes frequently
export const dynamic = 'force-dynamic'

export default async function OperationsPage() {
  // Get current user's organization context?
  // For now we assume user sees everything they have access to via RLS
  // getAllActiveLots might filter internally or via RLS.
  // Ideally we pass organization_id if we have it in session/context.

  const lots = await getAllActiveLots(/* orgId */)

  return (
    <PageShell>
      <PageHeader
        title="Dashboard de Operaciones"
        description="Gestión centralizada de inventario y estado de ventas."
      />

      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        }
      >
        <KPICards data={lots} />
      </Suspense>

      <BentoPanel className="p-4 sm:p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Inventario de Lotes</h2>
        </div>
        <Suspense fallback={<SkeletonTable />}>
          <OperationsTable data={lots} />
        </Suspense>
      </BentoPanel>
    </PageShell>
  )
}
