import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserCircleIcon, Mail01Icon, CallIcon } from '@hugeicons/core-free-icons'
import type { VendorPerformance } from '@/lib/services/dashboard.service'

interface VendorsListProps {
  vendors: VendorPerformance[]
}

export function VendorsList({ vendors }: VendorsListProps) {
  if (vendors.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rendimiento por Vendedor</CardTitle>
          <CardDescription>No hay vendedores activos registrados en el sistema.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rendimiento por Vendedor</CardTitle>
        <CardDescription>Métricas de ventas y asignaciones por cada agente activo.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {vendors.map((vendor) => (
            <div
              key={vendor.id}
              className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <HugeiconsIcon icon={UserCircleIcon} className="h-6 w-6 text-slate-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{vendor.nombre}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {vendor.email && (
                      <span className="flex items-center gap-1">
                        <HugeiconsIcon icon={Mail01Icon} className="h-3 w-3" />
                        {vendor.email}
                      </span>
                    )}
                    {vendor.phone && (
                      <span className="flex items-center gap-1">
                        <HugeiconsIcon icon={CallIcon} className="h-3 w-3" />
                        {vendor.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 text-right">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Proyectos</span>
                  <span className="text-sm font-medium">{vendor.projectsCount}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Reservas</span>
                  <Badge
                    variant="outline"
                    className="mt-1 text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200"
                  >
                    {vendor.reservedLots}
                  </Badge>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Ventas</span>
                  <Badge
                    variant="secondary"
                    className="mt-1 text-blue-600 bg-blue-50 dark:bg-blue-950/30"
                  >
                    {vendor.soldLots}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
