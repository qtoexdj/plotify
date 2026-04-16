import { Suspense } from 'react'
import { getAllActiveLots } from '@/lib/services/operations.service'
import { OperationsTable } from '@/components/operations/OperationsTable'
import { KPICards } from '@/components/operations/KPICards'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading02Icon } from '@hugeicons/core-free-icons'

// Force dynamic rendering since data changes frequently
export const dynamic = 'force-dynamic'

export default async function OperationsPage() {

    // Get current user's organization context?
    // For now we assume user sees everything they have access to via RLS
    // getAllActiveLots might filter internally or via RLS.
    // Ideally we pass organization_id if we have it in session/context.

    const lots = await getAllActiveLots(/* orgId */)

    return (
        <div className="flex flex-col gap-6 p-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard de Operaciones</h1>
                <p className="text-muted-foreground mt-2">
                    Gestión centralizada de inventario y estado de ventas.
                </p>
            </div>

            <Suspense fallback={<div className="w-full h-32 flex items-center justify-center"><HugeiconsIcon icon={Loading02Icon} className="animate-spin" /></div>}>
                <KPICards data={lots} />
            </Suspense>

            <div className="border rounded-xl p-6 bg-card shadow-xs">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold">Inventario de Lotes</h2>
                </div>
                <Suspense fallback={<div className="w-full h-64 flex items-center justify-center"><HugeiconsIcon icon={Loading02Icon} className="animate-spin" /></div>}>
                    <OperationsTable data={lots} />
                </Suspense>
            </div>
        </div>
    )
}
