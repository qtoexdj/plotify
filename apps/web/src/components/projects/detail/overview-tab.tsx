'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Calendar01Icon,
  UserAdd01Icon,
  Delete02Icon as Trash01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { AssignVendorDialog } from './assign-vendor-dialog'
import { useState, useTransition } from 'react'
import type { ProjectWithMetrics } from '@/types/database.types'
import { removeVendorFromProjectAction } from '@/actions/vendor-actions.action'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useEffect } from 'react'
import type { ProjectVendorAssignment } from '@/lib/services/vendors.service'
import { makeProjectOperational } from '@/actions/lot-verification.action'
import { cn } from '@/lib/utils'

const ESTADO_PROYECTO_CONFIG: Record<
  string,
  { label: string; description: string; className: string }
> = {
  draft: {
    label: 'Borrador',
    description:
      'El proyecto está en creación. Falta cargar la geometría (KML/KMZ) e iniciar la verificación legal.',
    className:
      'border-slate-300 text-slate-700 bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:bg-slate-500/20 border outline-none',
  },
  imported: {
    label: 'Geometría Importada',
    description:
      'Se han importado los lotes y caminos del archivo de geometría. Pendiente de verificación legal de cada lote.',
    className:
      'border-blue-300 text-blue-700 bg-blue-50 dark:border-blue-600 dark:text-blue-400 dark:bg-blue-500/20 border outline-none',
  },
  validated: {
    label: 'Validado Legalmente',
    description:
      'Todos los lotes tienen sus deslindes y superficies verificados. Listo para ser publicado y habilitar ventas.',
    className:
      'border-violet-300 text-violet-700 bg-violet-50 dark:border-violet-600 dark:text-violet-400 dark:bg-violet-500/20 border outline-none',
  },
  operational: {
    label: 'Operacional (Ventas Activas)',
    description:
      'Proyecto activo y operativo. Los vendedores asignados ya pueden reservar lotes y generar documentos.',
    className:
      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-700 border outline-none',
  },
  // Legacy backward-compatibility states
  activo: {
    label: 'Operacional (Activo)',
    description:
      'Proyecto activo y operativo. Los vendedores asignados ya pueden reservar lotes y generar documentos.',
    className:
      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-700 border outline-none',
  },
  inactivo: {
    label: 'Borrador (Inactivo)',
    description:
      'El proyecto está inactivo o en creación. Falta cargar la geometría (KML/KMZ) e iniciar la verificación legal.',
    className:
      'border-slate-300 text-slate-700 bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:bg-slate-500/20 border outline-none',
  },
}

interface OverviewTabProps {
  project: ProjectWithMetrics & { vendors?: ProjectVendorAssignment[] }
}

export function OverviewTab({ project }: OverviewTabProps) {
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)

  useEffect(() => {
    const checkRole = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user && project.organization_id) {
        const { data } = await supabase
          .from('organization_members')
          .select('role')
          .eq('organization_id', project.organization_id)
          .eq('user_id', user.id)
          .maybeSingle()
        setUserRole(data?.role || null)
      }
    }
    checkRole()
  }, [project.organization_id])

  const isAdmin = userRole === 'admin'

  const handleRemoveVendor = async (vendorId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este vendedor del proyecto?')) return

    startTransition(async () => {
      const result = await removeVendorFromProjectAction(project.id, vendorId)
      if (result.success) {
        toast.success('Vendedor eliminado con éxito')
        window.location.reload()
      } else {
        toast.error(result.error || 'Error al eliminar vendedor')
      }
    })
  }

  const handleMakeOperational = async () => {
    if (
      !confirm(
        '¿Estás seguro de que deseas hacer este proyecto operacional? Esto habilitará las reservas y ventas.'
      )
    )
      return

    setIsPublishing(true)
    try {
      const result = await makeProjectOperational(project.id)
      if (result.success) {
        toast.success(result.message || 'Proyecto publicado con éxito')
        window.location.reload()
      } else {
        toast.error(result.error || 'Error al publicar el proyecto')
      }
    } catch {
      toast.error('Error inesperado al publicar')
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Lotes</CardDescription>
            <CardTitle className="text-3xl">{project.total_lotes}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-green-50 dark:bg-emerald-900/20 border-green-200 dark:border-emerald-500/50">
          <CardHeader className="pb-3">
            <CardDescription>Disponibles</CardDescription>
            <CardTitle className="text-3xl text-green-600 dark:text-emerald-400">
              {project.lotes_libres}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-yellow-50 dark:bg-amber-900/20 border-yellow-200 dark:border-amber-500/50">
          <CardHeader className="pb-3">
            <CardDescription>Reservados</CardDescription>
            <CardTitle className="text-3xl text-yellow-600 dark:text-amber-400">
              {project.lotes_reservados}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-500/50">
          <CardHeader className="pb-3">
            <CardDescription>Vendidos</CardDescription>
            <CardTitle className="text-3xl text-blue-600 dark:text-blue-400">
              {project.lotes_vendidos}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Estado del Proyecto - Banner Premium (T026) */}
      <Card
        className={cn(
          'border overflow-hidden',
          project.estado === 'operational'
            ? 'border-emerald-200 bg-emerald-500/5 dark:border-emerald-500/10'
            : project.estado === 'validated'
              ? 'border-violet-200 bg-violet-500/5 dark:border-violet-500/10'
              : project.estado === 'imported'
                ? 'border-blue-200 bg-blue-500/5 dark:border-blue-500/10'
                : 'border-slate-200 bg-slate-500/5 dark:border-slate-600/10'
        )}
      >
        <CardContent className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Estado de Preparación:
              </span>
              <Badge
                className={cn(
                  'text-[10px] py-0.5 px-1.5',
                  ESTADO_PROYECTO_CONFIG[project.estado || 'draft']?.className
                )}
              >
                {ESTADO_PROYECTO_CONFIG[project.estado || 'draft']?.label}
              </Badge>
            </div>
            <h4 className="text-sm font-semibold text-foreground mt-1">
              {project.estado === 'operational'
                ? '¡Proyecto Activo y Operativo!'
                : 'Proyecto en Fase de Preparación'}
            </h4>
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              {ESTADO_PROYECTO_CONFIG[project.estado || 'draft']?.description}
            </p>
          </div>

          {isAdmin && project.estado !== 'operational' && (
            <Button
              size="sm"
              onClick={handleMakeOperational}
              disabled={isPublishing || isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 shrink-0 self-start md:self-center"
            >
              {isPublishing ? 'Publicando...' : 'Habilitar Ventas'}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Información del Proyecto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-slate-400">
                  Región
                </label>
                <p className="text-lg">{project.region}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-slate-400">
                  Comuna
                </label>
                <p className="text-lg">{project.comuna}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-slate-400">
                  Estado
                </label>
                <p className="text-lg mt-0.5">
                  <Badge className={ESTADO_PROYECTO_CONFIG[project.estado || 'draft']?.className}>
                    {ESTADO_PROYECTO_CONFIG[project.estado || 'draft']?.label}
                  </Badge>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-slate-400">
                  Creado
                </label>
                <p className="text-lg flex items-center gap-2">
                  <HugeiconsIcon icon={Calendar01Icon} className="w-4 h-4" />
                  {/* Simplificamos para evitar hidratación mismatch por ahora, idealmente usar date-fns o similar en cliente */}
                  {project.created_at
                    ? new Date(project.created_at).toLocaleDateString('es-CL')
                    : '—'}
                </p>
              </div>
            </div>

            <Separator />

            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-slate-400">
                Descripción
              </label>
              <p className="text-gray-900 dark:text-slate-100 mt-1">
                {project.descripcion || 'Sin descripción'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Vendors Preview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Vendedores del Proyecto</CardTitle>
              <CardDescription>Asignados a este proyecto</CardDescription>
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => setIsAssignDialogOpen(true)}
              >
                <HugeiconsIcon icon={UserAdd01Icon} className="w-4 h-4" />
                Asignar
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64 pr-3">
              <div className="space-y-4">
                {project.vendors && project.vendors.length > 0 ? (
                  project.vendors.map((item, index) => {
                    const vendor = item.vendor
                    const initials =
                      vendor?.nombre
                        ?.split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .toUpperCase() || 'V'

                    return (
                      <div key={vendor.id} className="space-y-4 pt-4 first:pt-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage
                                src={vendor.user_profile?.avatar_url || ''}
                                alt={vendor.nombre}
                              />
                              <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                {vendor.nombre}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-slate-400">
                                {item.rol || 'Vendedor'}
                              </p>
                            </div>
                          </div>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => handleRemoveVendor(vendor.id)}
                              disabled={isPending}
                            >
                              <HugeiconsIcon icon={Trash01Icon} className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        {index < (project.vendors?.length || 0) - 1 ? <Separator /> : null}
                      </div>
                    )
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-center bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed p-4">
                    <HugeiconsIcon icon={UserAdd01Icon} className="w-8 h-8 text-slate-400 mb-2" />
                    <p className="text-sm text-slate-500">Sin vendedores asignados</p>
                    {isAdmin && (
                      <Button
                        variant="link"
                        size="sm"
                        className="mt-2"
                        onClick={() => setIsAssignDialogOpen(true)}
                      >
                        Asignar ahora
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <AssignVendorDialog
        projectId={project.id}
        organizationId={project.organization_id || ''}
        isOpen={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
        assignedVendorIds={project.vendors?.map((v) => v.vendor.id) || []}
        onSuccess={() => {
          window.location.reload()
        }}
      />
    </div>
  )
}
