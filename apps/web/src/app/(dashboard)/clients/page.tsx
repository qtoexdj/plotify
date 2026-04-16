'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserGroupIcon, PlusSignIcon } from '@hugeicons/core-free-icons'

export default function ClientsPage() {
  const [clients] = useState([])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-600 mt-1">Gestiona tus prospectos y ventas</p>
        </div>
        <Button size="lg">
          <HugeiconsIcon icon={PlusSignIcon} className="w-5 h-5 mr-2" />
          Nuevo Lead
        </Button>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <HugeiconsIcon icon={UserGroupIcon} className="w-16 h-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay leads</h3>
            <p className="text-gray-600 mb-4">
              Los leads se gestionarán desde los proyectos
            </p>
            <Button>
              <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4 mr-2" />
              Agregar Lead
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Leads</CardTitle>
              <CardDescription>Funcionalidad en desarrollo</CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}
    </div>
  )
}
