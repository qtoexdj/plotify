'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HugeiconsIcon } from '@hugeicons/react'
import { File02Icon, ShoppingCart01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import type { OperationLot } from '@/lib/services/operations.service'
import { useMemo } from 'react'

export function KPICards({ data }: { data: OperationLot[] }) {
  const stats = useMemo(() => {
    const totalReservas = data.filter((l) => l.estado === 'reservado').length
    const totalEscrituras = data.filter((l) => l.etapa_proceso === 'espera_firma_escritura').length
    // Ventas del mes (Sold in current month) - using sold_at if available or updated_at of sold lots
    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()

    const ventasMes = data.filter((l) => {
      if (l.estado !== 'vendido') return false
      const date = new Date(l.updated_at) // Assuming updated_at is reliable for sale date
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear
    }).length

    return { totalReservas, totalEscrituras, ventasMes }
  }, [data])

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Reservas Activas</CardTitle>
          <HugeiconsIcon icon={ShoppingCart01Icon} className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalReservas}</div>
          <p className="text-xs text-muted-foreground">Lotes reservados en proceso</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Escrituras en Trámite</CardTitle>
          <HugeiconsIcon icon={File02Icon} className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalEscrituras}</div>
          <p className="text-xs text-muted-foreground">Listas para firma</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ventas del Mes</CardTitle>
          <HugeiconsIcon icon={UserGroupIcon} className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.ventasMes}</div>
          <p className="text-xs text-muted-foreground">Cierres completados este mes</p>
        </CardContent>
      </Card>
    </div>
  )
}
