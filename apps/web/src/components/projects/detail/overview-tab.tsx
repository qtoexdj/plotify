'use client'

import Link from 'next/link'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/ui/status-badge'
import { LotStatusBadge } from '@/components/projects/LotStatusBadge'
import { getMatrizProject } from '@/lib/documents/matriz-client'
import type { MatrizView } from '@/lib/documents/matriz-types'
import { pendienteHref, pendienteTitle } from '@/components/documents/mesa/pendientes-list'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Calendar01Icon,
  UserAdd01Icon,
  Delete02Icon as Trash01Icon,
  PencilEdit02Icon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AssignVendorDialog } from './assign-vendor-dialog'
import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ProjectWithMetrics } from '@/types/database.types'
import type { LotWithRecord } from './types'
import { removeVendorFromProjectAction } from '@/actions/vendor-actions.action'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useEffect } from 'react'
import type { ProjectVendorAssignment } from '@/lib/services/vendors.service'
import { makeProjectOperational } from '@/actions/lot-verification.action'
import {
  CHILE_COMMUNES_BY_REGION,
  CHILE_REGIONS,
  fetchChileRegions,
  fetchCommunesByRegion,
  findRegionCode,
  type ChileRegion,
} from '@/lib/geo/chile-location'

const projectStatusConfig: Record<
  string,
  { label: string; variant: 'success' | 'info' | 'warning' | 'neutral' }
> = {
  operational: { label: 'Operacional', variant: 'success' },
  validated: { label: 'Validado', variant: 'info' },
  imported: { label: 'Importado', variant: 'info' },
  draft: { label: 'Borrador', variant: 'neutral' },
  activo: { label: 'Activo', variant: 'success' },
  inactivo: { label: 'Inactivo', variant: 'neutral' },
}

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
  lots: LotWithRecord[]
  onNavigateTab?: (tab: string) => void
}

const CHECKLIST_DOC_FIELDS: (keyof ProjectWithMetrics)[] = [
  'doc_dominio_vigente',
  'doc_hipoteca_gravamen',
  'doc_roles',
  'doc_subdivision',
  'doc_plano_oficial',
]

export function OverviewTab({ project, lots, onNavigateTab }: OverviewTabProps) {
  const router = useRouter()
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isTableExpanded, setIsTableExpanded] = useState(false)
  const [showRevenue, setShowRevenue] = useState(false)
  const [ufValue, setUfValue] = useState<number | null>(null)
  const [ufDate, setUfDate] = useState<string | null>(null)
  const [projectMatriz, setProjectMatriz] = useState<MatrizView | null>(null)
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState(project.descripcion ?? '')
  const [localDescription, setLocalDescription] = useState(project.descripcion ?? '')
  const [isSavingDescription, setIsSavingDescription] = useState(false)
  const [localRegion, setLocalRegion] = useState(project.region ?? '')
  const [localComuna, setLocalComuna] = useState(project.comuna ?? '')
  const [isLocationOpen, setIsLocationOpen] = useState(false)
  const [regions, setRegions] = useState<ChileRegion[]>(CHILE_REGIONS)
  const [communes, setCommunes] = useState<string[]>([])
  const [locationRegionCode, setLocationRegionCode] = useState(findRegionCode(project.region))
  const [locationComuna, setLocationComuna] = useState(project.comuna ?? '')
  const [isLoadingCommunes, setIsLoadingCommunes] = useState(false)
  const [isSavingLocation, setIsSavingLocation] = useState(false)

  const tableLots = lots
    .filter((lot) => lot.estado !== 'disponible' || lot.lot_records?.cliente_nombre)
    .slice(0, 10)
  const visibleActivityLots = isTableExpanded ? tableLots : tableLots.slice(0, 2)
  const revenue = lots.reduce((sum, lot) => sum + (lot.lot_records?.valor ?? lot.precio ?? 0), 0)
  const revenueUf = revenue > 0 ? Math.round(revenue / (ufValue ?? 39000)) : 0

  const isOperational = project.estado === 'operational' || project.estado === 'activo'
  const hasVentas = project.lotes_reservados > 0 || project.lotes_vendidos > 0
  const isProjectOperational = isOperational || hasVentas

  const estadoProyectoReal = useMemo(() => {
    if (isProjectOperational) return 'operational'

    // /api/projects/[id]/lots filtra por vendedor_id para roles no-admin, así
    // que `lots` no representa el proyecto completo para ellos: con esa
    // lista parcial (o vacía) no se puede inferir cuántos lotes están
    // verificados. project.total_lotes sí es un conteo a nivel proyecto,
    // no filtrado por vendedor, así que alcanza para distinguir "sin
    // geometría" de "con geometría" (project.estado no sirve: es el mismo
    // flag fijo que T051 reemplaza para el admin).
    if (userRole !== 'admin') return project.total_lotes > 0 ? 'imported' : 'draft'

    const lotesTotal = lots.length
    if (lotesTotal === 0) return 'draft'

    const lotesVerificados = lots.filter(
      (lot) => Boolean(lot.geometry_id) && lot.verified_status !== 'draft'
    ).length
    const lotesListo = lotesTotal > 0 && lotesVerificados === lotesTotal

    const blockers = (projectMatriz?.approval_blockers ?? []).filter(
      (blocker) => !(blocker.kind === 'readiness_gate' && blocker.inherited === true)
    )
    const tituloBlocker = blockers.find(
      (blocker) => blocker.kind === 'readiness_gate' && blocker.gate === 'title_verified'
    )
    const tituloListo = Boolean(projectMatriz) && !tituloBlocker

    const variableBlockers = blockers.filter(
      (blocker) => !(blocker.kind === 'readiness_gate' && blocker.gate === 'title_verified')
    )
    const variablesListo = Boolean(projectMatriz) && variableBlockers.length === 0

    const moldeListo = projectMatriz?.status === 'approved'

    if (lotesListo && tituloListo && variablesListo && moldeListo) {
      return 'validated'
    }

    return 'imported'
  }, [isProjectOperational, lots, projectMatriz, userRole, project.total_lotes])

  const summaryStatus = projectStatusConfig[estadoProyectoReal] ?? projectStatusConfig.draft

  useEffect(() => {
    if (!isLocationOpen) return

    let isMounted = true

    fetchChileRegions()
      .then((items) => {
        if (!isMounted) return
        setRegions(items)
      })
      .catch(() => {
        if (!isMounted) return
        setRegions(CHILE_REGIONS)
      })

    return () => {
      isMounted = false
    }
  }, [isLocationOpen])

  useEffect(() => {
    if (!isLocationOpen || !locationRegionCode) return

    let isMounted = true
    const fallbackCommunes = CHILE_COMMUNES_BY_REGION[locationRegionCode] ?? []

    window.queueMicrotask(() => {
      if (!isMounted) return
      setCommunes(fallbackCommunes)
      setIsLoadingCommunes(true)
    })

    fetchCommunesByRegion(locationRegionCode)
      .then((items) => {
        if (!isMounted) return
        setCommunes(items)
      })
      .catch(() => {
        if (!isMounted) return
        setCommunes([])
      })
      .finally(() => {
        if (!isMounted) return
        setIsLoadingCommunes(false)
      })

    return () => {
      isMounted = false
    }
  }, [isLocationOpen, locationRegionCode])

  useEffect(() => {
    let isMounted = true

    fetch('https://mindicador.cl/api')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const nextValue = Number(data?.uf?.valor)
        if (!isMounted || !Number.isFinite(nextValue) || nextValue <= 0) return
        setUfValue(nextValue)
        setUfDate(typeof data?.uf?.fecha === 'string' ? data.uf.fecha : null)
      })
      .catch(() => {
        if (!isMounted) return
        setUfValue(null)
        setUfDate(null)
      })

    return () => {
      isMounted = false
    }
  }, [])

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

  useEffect(() => {
    const isProjectOperational = project.estado === 'operational' || project.estado === 'activo'
    if (userRole !== 'admin' || isProjectOperational) return

    let isMounted = true

    getMatrizProject(project.id)
      .then((result) => {
        if (isMounted) setProjectMatriz(result.matriz)
      })
      .catch(() => {
        if (isMounted) setProjectMatriz(null)
      })

    return () => {
      isMounted = false
    }
  }, [project.id, project.estado, userRole])

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

  const handleMakeOperational = useCallback(async () => {
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
  }, [project.id])

  const handleOpenDescription = () => {
    setDescriptionDraft(localDescription)
    setIsDescriptionOpen(true)
  }

  const handleOpenLocation = () => {
    setLocationRegionCode(findRegionCode(localRegion))
    setLocationComuna(localComuna)
    setIsLocationOpen(true)
  }

  const handleSaveDescription = async () => {
    setIsSavingDescription(true)
    try {
      const nextDescription = descriptionDraft.trim()
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion: nextDescription || null }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || 'No se pudo actualizar la descripción')
      }

      setLocalDescription(nextDescription)
      setIsDescriptionOpen(false)
      toast.success('Descripción actualizada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la descripción')
    } finally {
      setIsSavingDescription(false)
    }
  }

  const handleSaveLocation = async () => {
    const selectedRegion = regions.find((region) => region.code === locationRegionCode)
    if (!selectedRegion || !locationComuna) {
      toast.error('Selecciona región y comuna')
      return
    }

    setIsSavingLocation(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: selectedRegion.name, comuna: locationComuna }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || 'No se pudo actualizar la ubicación')
      }

      setLocalRegion(selectedRegion.name)
      setLocalComuna(locationComuna)
      setIsLocationOpen(false)
      router.refresh()
      toast.success('Ubicación actualizada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la ubicación')
    } finally {
      setIsSavingLocation(false)
    }
  }

  const checklistSteps = useMemo(() => {
    const blockers = (projectMatriz?.approval_blockers ?? []).filter(
      (blocker) => !(blocker.kind === 'readiness_gate' && blocker.inherited === true)
    )

    const docsCargados = CHECKLIST_DOC_FIELDS.filter((field) => Boolean(project[field])).length
    const docsListo = docsCargados === CHECKLIST_DOC_FIELDS.length

    const tituloBlocker = blockers.find(
      (blocker) => blocker.kind === 'readiness_gate' && blocker.gate === 'title_verified'
    )
    const tituloListo = Boolean(projectMatriz) && !tituloBlocker

    const variableBlockers = blockers.filter(
      (blocker) => !(blocker.kind === 'readiness_gate' && blocker.gate === 'title_verified')
    )
    const variablesListo = Boolean(projectMatriz) && variableBlockers.length === 0

    const moldeListo = projectMatriz?.status === 'approved'

    const lotesTotal = lots.length
    const lotesVerificados = lots.filter(
      (lot) => Boolean(lot.geometry_id) && lot.verified_status !== 'draft'
    ).length
    const lotesListo = lotesTotal > 0 && lotesVerificados === lotesTotal

    const matrizHref = `/documentos/matriz/proyecto/${project.id}`

    return [
      {
        id: 'documentos',
        label: 'Documentos',
        done: docsListo,
        detail: docsListo
          ? 'Todos los documentos legales están cargados.'
          : `${docsCargados} de ${CHECKLIST_DOC_FIELDS.length} documentos cargados.`,
        ctaLabel: docsListo ? undefined : 'Cargar documentos',
        onClick: docsListo ? undefined : () => onNavigateTab?.('documents'),
        href: undefined as string | undefined,
      },
      {
        id: 'titulo',
        label: 'Título',
        done: tituloListo,
        detail: tituloBlocker
          ? pendienteTitle(tituloBlocker)
          : projectMatriz
            ? 'Título verificado.'
            : 'Esperando datos de la matriz del proyecto.',
        ctaLabel: tituloBlocker ? (tituloBlocker.action_label ?? 'Revisar título') : undefined,
        onClick: undefined as (() => void) | undefined,
        href: tituloBlocker ? (pendienteHref(tituloBlocker) ?? matrizHref) : undefined,
      },
      {
        id: 'variables',
        label: 'Variables',
        done: variablesListo,
        detail: variablesListo
          ? 'Todas las variables están completas o aprobadas.'
          : `Faltan ${variableBlockers.length} dato(s) por completar o aprobar.`,
        ctaLabel: variablesListo ? undefined : 'Completar variables',
        onClick: undefined as (() => void) | undefined,
        href: variablesListo ? undefined : matrizHref,
      },
      {
        id: 'molde',
        label: 'Molde',
        done: moldeListo,
        detail: moldeListo
          ? 'Molde aprobado, esperando ventas.'
          : 'El molde del proyecto aún no ha sido aprobado.',
        ctaLabel: moldeListo ? undefined : 'Revisar molde',
        onClick: undefined as (() => void) | undefined,
        href: moldeListo ? undefined : matrizHref,
      },
      {
        id: 'lotes',
        label: 'Lotes',
        done: lotesListo,
        detail:
          lotesTotal === 0
            ? 'Aún no se ha importado la geometría del proyecto.'
            : lotesListo
              ? 'Todos los lotes están verificados.'
              : `${lotesVerificados} de ${lotesTotal} lotes verificados.`,
        ctaLabel: lotesListo
          ? undefined
          : lotesTotal === 0
            ? 'Importar geometría'
            : 'Verificar lotes',
        onClick: lotesListo
          ? undefined
          : () => onNavigateTab?.(lotesTotal === 0 ? 'viewer' : 'lots'),
        href: undefined as string | undefined,
      },
      {
        id: 'ventas',
        label: 'Ventas',
        done: isProjectOperational,
        detail: isProjectOperational
          ? 'Las ventas están habilitadas.'
          : 'Las ventas aún no están habilitadas para este proyecto.',
        ctaLabel: isProjectOperational ? undefined : 'Habilitar ventas',
        onClick: isProjectOperational ? undefined : handleMakeOperational,
        href: undefined as string | undefined,
      },
    ]
  }, [project, projectMatriz, lots, isProjectOperational, onNavigateTab, handleMakeOperational])

  const formattedClp = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(revenue)
  const formattedUfValue = ufValue
    ? new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
      }).format(ufValue)
    : null
  const formattedUf = `UF ${revenueUf.toLocaleString('es-CL')}`
  const visibleClpDisplay = revenue > 0 ? (showRevenue ? formattedClp : '$•••.•••.•••') : '$0'
  const visibleUfDisplay = revenue > 0 ? (showRevenue ? formattedUf : 'UF •••••') : 'UF 0'
  const ufDateLabel = ufDate
    ? new Date(ufDate).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
    : null
  const locationCommuneOptions =
    locationComuna && !communes.includes(locationComuna) ? [locationComuna, ...communes] : communes

  return (
    <div className="space-y-6">
      {!isProjectOperational && (
        <Card className="w-full gap-0 overflow-hidden border-primary/30 bg-primary/5 py-0">
          <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Estado de Preparación:
                </span>
                <Badge className="border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  {ESTADO_PROYECTO_CONFIG[estadoProyectoReal]?.label}
                </Badge>
              </div>
              <h4 className="mt-1 text-sm font-semibold text-foreground">
                Proyecto en Fase de Preparación
              </h4>
              <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
                {ESTADO_PROYECTO_CONFIG[estadoProyectoReal]?.description}
              </p>
            </div>

            {isAdmin && !hasVentas && (
              <Button
                size="sm"
                onClick={handleMakeOperational}
                disabled={isPublishing || isPending}
                className="flex min-h-11 w-full shrink-0 items-center gap-1.5 bg-success font-semibold text-success-foreground hover:bg-success/90 sm:w-fit lg:justify-self-end"
              >
                {isPublishing ? 'Publicando...' : 'Habilitar Ventas'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!isProjectOperational && isAdmin && (
        <Card className="w-full shadow-xs">
          <CardHeader>
            <CardTitle>Checklist de preparación</CardTitle>
            <CardDescription>
              Pasos para dejar el proyecto listo para ventas y escrituras.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {checklistSteps.map((step) => (
                <li
                  key={step.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge variant={step.done ? 'success' : 'warning'}>
                        {step.done ? 'Listo' : 'Pendiente'}
                      </StatusBadge>
                      <p className="text-sm font-semibold text-foreground">{step.label}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
                  </div>
                  {step.ctaLabel ? (
                    step.href ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11 shrink-0 sm:min-h-9"
                        asChild
                      >
                        <Link href={step.href}>{step.ctaLabel}</Link>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11 shrink-0 sm:min-h-9"
                        onClick={step.onClick}
                        disabled={step.id === 'ventas' && (isPublishing || isPending)}
                      >
                        {step.id === 'ventas' && isPublishing ? 'Publicando...' : step.ctaLabel}
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Resumen del proyecto */}
      <section className="rounded-2xl bg-background/70 p-3 shadow-sm ring-1 ring-border/40 sm:p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-card px-4 py-3 shadow-xs">
            <p className="text-sm text-muted-foreground">Estado del proyecto</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge variant={summaryStatus.variant}>{summaryStatus.label}</StatusBadge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {localRegion} / {localComuna}
            </p>
          </div>
          <div className="rounded-2xl bg-card px-4 py-3 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Ventas registradas</p>
                <p className="text-xs text-muted-foreground">Valor acumulado</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="min-h-11 min-w-11"
                onClick={() => setShowRevenue((value) => !value)}
                aria-label={showRevenue ? 'Ocultar cifra' : 'Mostrar cifra'}
              >
                <HugeiconsIcon icon={showRevenue ? ViewOffIcon : ViewIcon} />
              </Button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="min-w-0">
                <p className="font-display text-2xl font-semibold text-foreground">
                  {visibleClpDisplay}
                </p>
                <p className="mt-0.5 text-sm font-medium text-success">{visibleUfDisplay}</p>
              </div>
              <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="block font-medium text-foreground">
                  UF actual {formattedUfValue ?? 'no disponible'}
                </span>
                <span>{ufDateLabel ? `Mindicador.cl · ${ufDateLabel}` : 'Mindicador.cl'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-card px-4 py-3 shadow-xs">
            <p className="text-sm text-muted-foreground">Disponibles</p>
            <p className="mt-1 font-display text-2xl font-semibold text-success">
              {project.lotes_libres}
            </p>
          </div>
          <div className="rounded-2xl bg-card px-4 py-3 shadow-xs">
            <p className="text-sm text-muted-foreground">Reservados</p>
            <p className="mt-1 font-display text-2xl font-semibold text-warning">
              {project.lotes_reservados}
            </p>
          </div>
          <div className="rounded-2xl bg-card px-4 py-3 shadow-xs">
            <p className="text-sm text-muted-foreground">Vendidos</p>
            <p className="mt-1 font-display text-2xl font-semibold text-status-sold">
              {project.lotes_vendidos}
            </p>
          </div>
        </div>

        {tableLots.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Lotes con movimiento</h3>
                <p className="text-xs text-muted-foreground">
                  Reservas, ventas o compradores registrados.
                </p>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Desliza para ver columnas
              </span>
            </div>

            <div className="grid gap-2 p-3 md:hidden">
              {visibleActivityLots.map((lot) => (
                <div key={lot.id} className="rounded-xl border bg-background/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        Lote {lot.numero_lote}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {lot.lot_records?.cliente_nombre ?? 'Sin comprador'}
                      </p>
                    </div>
                    <LotStatusBadge status={lot.estado || 'disponible'} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Vendedor: {lot.vendors?.nombre ?? 'Sin asignar'}
                  </p>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr className="[&_th]:px-5 [&_th]:py-3 [&_th]:font-medium">
                    <th>Lote</th>
                    <th>Comprador</th>
                    <th>Estado</th>
                    <th>Vendedor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {tableLots.map((lot) => (
                    <tr key={lot.id} className="[&_td]:px-5 [&_td]:py-3">
                      <td className="font-medium text-foreground">{lot.numero_lote}</td>
                      <td className="text-foreground">
                        {lot.lot_records?.cliente_nombre ?? 'Sin comprador'}
                      </td>
                      <td>
                        <LotStatusBadge status={lot.estado || 'disponible'} />
                      </td>
                      <td className="text-muted-foreground">{lot.vendors?.nombre ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tableLots.length > 2 ? (
              <button
                type="button"
                onClick={() => setIsTableExpanded((value) => !value)}
                className="min-h-11 w-full border-t border-border/60 px-5 py-2 text-left text-sm font-medium text-primary hover:bg-muted/40 focus-visible:outline-primary"
              >
                {isTableExpanded ? 'Ver menos' : `Ver todos (${tableLots.length})`}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-background/70 p-3 shadow-sm ring-1 ring-border/40 sm:p-4">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Project Info */}
          <Card className="lg:col-span-2 ring-0 shadow-xs">
            <CardHeader>
              <CardTitle>Información del Proyecto</CardTitle>
              <CardDescription>Datos operativos visibles para administración.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-muted-foreground">Región</label>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11"
                        onClick={handleOpenLocation}
                        aria-label="Editar región y comuna"
                      >
                        <HugeiconsIcon icon={PencilEdit02Icon} />
                      </Button>
                    )}
                  </div>
                  <p className="text-lg">{localRegion}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-muted-foreground">Comuna</label>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11"
                        onClick={handleOpenLocation}
                        aria-label="Editar región y comuna"
                      >
                        <HugeiconsIcon icon={PencilEdit02Icon} />
                      </Button>
                    )}
                  </div>
                  <p className="text-lg">{localComuna}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Estado</label>
                  <p className="text-lg mt-0.5">
                    <Badge className={ESTADO_PROYECTO_CONFIG[estadoProyectoReal]?.className}>
                      {ESTADO_PROYECTO_CONFIG[estadoProyectoReal]?.label}
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
                <div className="flex items-start justify-between gap-3">
                  <label className="text-sm font-medium text-muted-foreground">Descripción</label>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={handleOpenDescription}
                    >
                      <HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" />
                      Editar
                    </Button>
                  )}
                </div>
                <p className="mt-2 rounded-xl bg-muted/40 px-3 py-2 text-foreground">
                  {localDescription || 'Sin descripción'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Vendors Preview */}
          <Card className="overflow-hidden ring-0 shadow-xs">
            <CardHeader>
              <CardTitle>Vendedores del Proyecto</CardTitle>
              <CardDescription>Asignados a este proyecto</CardDescription>
              <CardAction>
                <Badge variant="secondary">{project.vendors?.length ?? 0}</Badge>
              </CardAction>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex min-h-11 items-center gap-2"
                  onClick={() => setIsAssignDialogOpen(true)}
                >
                  <HugeiconsIcon icon={UserAdd01Icon} className="w-4 h-4" />
                  Asignar
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Asignados</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-foreground">
                    {project.vendors?.length ?? 0}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Estado</p>
                  <p className="mt-2">
                    <Badge variant={project.vendors?.length ? 'default' : 'secondary'}>
                      {project.vendors?.length ? 'Activo' : 'Pendiente'}
                    </Badge>
                  </p>
                </div>
              </div>

              <ScrollArea className="h-52 pr-3">
                <div className="space-y-2">
                  {project.vendors && project.vendors.length > 0 ? (
                    project.vendors.map((item) => {
                      const vendor = item.vendor
                      const initials =
                        vendor?.nombre
                          ?.split(' ')
                          .map((n: string) => n[0])
                          .join('')
                          .toUpperCase() || 'V'

                      return (
                        <div
                          key={vendor.id}
                          className="flex items-center justify-between gap-3 rounded-xl border bg-background/60 p-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar className="size-10">
                              <AvatarImage
                                src={vendor.user_profile?.avatar_url || ''}
                                alt={vendor.nombre}
                              />
                              <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
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
                              className="min-h-11 min-w-11 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleRemoveVendor(vendor.id)}
                              disabled={isPending}
                            >
                              <HugeiconsIcon icon={Trash01Icon} />
                              <span className="sr-only">Eliminar vendedor</span>
                            </Button>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/35 p-4 text-center">
                      <HugeiconsIcon
                        icon={UserAdd01Icon}
                        className="mb-2 h-8 w-8 text-muted-foreground/60"
                      />
                      <p className="text-sm text-muted-foreground">Sin vendedores asignados</p>
                      {isAdmin && (
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-2 min-h-11"
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
      </section>

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
      <Dialog open={isLocationOpen} onOpenChange={setIsLocationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar ubicación</DialogTitle>
            <DialogDescription>
              Selecciona la región y comuna administrativas del proyecto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Región</label>
              <Select
                value={locationRegionCode}
                onValueChange={(value) => {
                  setLocationRegionCode(value)
                  setLocationComuna('')
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona región" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.code} value={region.code}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Comuna</label>
              <Select
                value={locationComuna}
                onValueChange={setLocationComuna}
                disabled={!locationRegionCode || locationCommuneOptions.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={isLoadingCommunes ? 'Cargando comunas...' : 'Selecciona comuna'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {locationCommuneOptions.map((commune) => (
                    <SelectItem key={commune} value={commune}>
                      {commune}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLocationOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveLocation}
              disabled={isSavingLocation || isLoadingCommunes || !locationComuna}
            >
              {isSavingLocation ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isDescriptionOpen} onOpenChange={setIsDescriptionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar descripción</DialogTitle>
            <DialogDescription>
              Actualiza la descripción operativa visible en la vista general del proyecto.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={descriptionDraft}
            onChange={(event) => setDescriptionDraft(event.target.value)}
            placeholder="Describe el proyecto, su etapa o detalles relevantes..."
            className="min-h-32"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDescriptionOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDescription} disabled={isSavingDescription}>
              {isSavingDescription ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
