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
    className: 'border-border text-muted-foreground bg-muted border outline-none',
  },
  imported: {
    label: 'Geometría Importada',
    description:
      'Se han importado los lotes y caminos del archivo de geometría. Pendiente de verificación legal de cada lote.',
    className: 'border-info/30 text-info bg-info/10 border outline-none',
  },
  validated: {
    label: 'Validado Legalmente',
    description:
      'Todos los lotes tienen sus deslindes y superficies verificados. Listo para ser publicado y habilitar ventas.',
    className: 'border-info/30 text-info bg-info/10 border outline-none',
  },
  operational: {
    label: 'Operacional (Ventas Activas)',
    description:
      'Proyecto activo y operativo. Los vendedores asignados ya pueden reservar lotes y generar documentos.',
    className: 'bg-success/15 text-success border-success/30 border outline-none',
  },
  // Legacy backward-compatibility states
  activo: {
    label: 'Operacional (Activo)',
    description:
      'Proyecto activo y operativo. Los vendedores asignados ya pueden reservar lotes y generar documentos.',
    className: 'bg-success/15 text-success border-success/30 border outline-none',
  },
  inactivo: {
    label: 'Borrador (Inactivo)',
    description:
      'El proyecto está inactivo o en creación. Falta cargar la geometría (KML/KMZ) e iniciar la verificación legal.',
    className: 'border-border text-muted-foreground bg-muted border outline-none',
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
        <Card className="bg-success/10 border-success/20">
          <CardHeader className="pb-3">
            <CardDescription>Disponibles</CardDescription>
            <CardTitle className="text-3xl text-success">{project.lotes_libres}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-warning/10 border-warning/20">
          <CardHeader className="pb-3">
            <CardDescription>Reservados</CardDescription>
            <CardTitle className="text-3xl text-warning">{project.lotes_reservados}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-status-sold/10 border-status-sold/20">
          <CardHeader className="pb-3">
            <CardDescription>Vendidos</CardDescription>
            <CardTitle className="text-3xl text-status-sold">{project.lotes_vendidos}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Estado del Proyecto - Banner Premium (T026) */}
      <Card
        className={cn(
          'border overflow-hidden',
          project.estado === 'operational'
            ? 'border-success/20 bg-success/5'
            : project.estado === 'validated'
              ? 'border-info/20 bg-info/5'
              : project.estado === 'imported'
                ? 'border-info/20 bg-info/5'
                : 'border-border bg-muted/50'
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
              className="bg-success text-success-foreground hover:bg-success/90 font-semibold flex items-center gap-1.5 shrink-0 self-start md:self-center"
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
                <label className="text-sm font-medium text-muted-foreground">Región</label>
                <p className="text-lg">{project.region}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Comuna</label>
                <p className="text-lg">{project.comuna}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Estado</label>
                <p className="text-lg mt-0.5">
                  <Badge className={ESTADO_PROYECTO_CONFIG[project.estado || 'draft']?.className}>
                    {ESTADO_PROYECTO_CONFIG[project.estado || 'draft']?.label}
                  </Badge>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Creado</label>
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
              <label className="text-sm font-medium text-muted-foreground">Descripción</label>
              <p className="text-foreground mt-1">{project.descripcion || 'Sin descripción'}</p>
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
                              <p className="text-sm font-semibold text-foreground">
                                {vendor.nombre}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.rol || 'Vendedor'}
                              </p>
                            </div>
                          </div>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
                  <div className="flex flex-col items-center justify-center h-48 text-center bg-muted/50 rounded-lg border border-dashed p-4">
                    <HugeiconsIcon
                      icon={UserAdd01Icon}
                      className="w-8 h-8 text-muted-foreground/60 mb-2"
                    />
                    <p className="text-sm text-muted-foreground">Sin vendedores asignados</p>
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
