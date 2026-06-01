import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Folder02Icon,
  LayerIcon,
  CheckmarkCircle02Icon,
  ShoppingBag01Icon,
} from '@hugeicons/core-free-icons'
import type { GlobalKPIs } from '@/lib/services/dashboard.service'

interface DashboardKPIsProps {
  kpis: GlobalKPIs
}

export function DashboardKPIs({ kpis }: DashboardKPIsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="transition-all duration-200 ease-in-out hover:-translate-y-1 hover:shadow-lg hover:border-accent/40 cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Proyectos Activos</CardTitle>
          <HugeiconsIcon icon={Folder02Icon} className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{kpis.totalProjects}</div>
          <p className="text-xs text-muted-foreground">Loteos gestionados en tu cuenta</p>
        </CardContent>
      </Card>

      <Card className="transition-all duration-200 ease-in-out hover:-translate-y-1 hover:shadow-lg hover:border-accent/40 cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Lotes</CardTitle>
          <HugeiconsIcon icon={LayerIcon} className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{kpis.totalLots}</div>
          <p className="text-xs text-muted-foreground">Suma de lotes en todos los proyectos</p>
        </CardContent>
      </Card>

      <Card className="transition-all duration-200 ease-in-out hover:-translate-y-1 hover:shadow-lg hover:border-accent/40 cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Lotes Disponibles</CardTitle>
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-4 w-4 text-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-success">{kpis.availableLots}</div>
          <p className="text-xs text-muted-foreground">Listos para la venta</p>
        </CardContent>
      </Card>

      <Card className="transition-all duration-200 ease-in-out hover:-translate-y-1 hover:shadow-lg hover:border-accent/40 cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Lotes Vendidos</CardTitle>
          <HugeiconsIcon icon={ShoppingBag01Icon} className="h-4 w-4 text-accent" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-accent">{kpis.soldLots}</div>
          <p className="text-xs text-muted-foreground">
            Con reserva pendiente:{' '}
            <span className="text-warning font-semibold">{kpis.reservedLots}</span> lotes
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
