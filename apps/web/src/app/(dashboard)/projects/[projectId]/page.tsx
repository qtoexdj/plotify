'use client'

import { use, useCallback, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Delete02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GeometryViewer } from '@/components/projects/geometry-viewer'
import { OverviewTab } from '@/components/projects/detail/overview-tab'
import { LotsTab } from '@/components/projects/detail/lots-tab'
import { ClientsTab } from '@/components/projects/detail/clients-tab'
import { LegalTab } from '@/components/projects/detail/legal-tab'
import { DocumentsTab } from '@/components/projects/detail/documents-tab'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { ProjectWithMetrics } from '@/types/database.types'
import type { LotWithRecord } from '@/components/projects/detail/types'
import { createClient } from '@/lib/supabase/client'

interface ProjectDetailPageProps {
  params: Promise<{ projectId: string }>
}

const deletedProjects = new Set<string>()

const lotStatusConfig = {
  disponible: { label: 'Disponible', variant: 'available' },
  reservado: { label: 'Reserva', variant: 'reserved' },
  vendido: { label: 'Vendido', variant: 'sold' },
} as const

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

function ProjectSummaryPanel({
  project,
  lots,
}: {
  project: ProjectWithMetrics
  lots: LotWithRecord[]
}) {
  const tableLots = lots
    .filter((lot) => lot.estado !== 'disponible' || lot.lot_records?.cliente_nombre)
    .slice(0, 5)
  const enMesa = lots.filter((lot) => lot.verified_status === 'draft').length
  const revenue = lots.reduce((sum, lot) => sum + (lot.lot_records?.valor ?? lot.precio ?? 0), 0)
  const revenueUf = revenue > 0 ? Math.round(revenue / 39000) : 0
  const status = projectStatusConfig[project.estado ?? 'draft'] ?? projectStatusConfig.draft

  return (
    <section className="rounded-2xl bg-background/70 p-3 shadow-sm ring-1 ring-border/40 sm:p-4">
      <div className="grid gap-3 md:grid-cols-[1.1fr_1fr_1fr_1fr]">
        <div className="rounded-2xl bg-card px-4 py-3 shadow-xs">
          <p className="text-sm text-muted-foreground">Estado del proyecto</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
            <StatusBadge variant="available">{project.lotes_libres} disponibles</StatusBadge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {project.region} / {project.comuna}
          </p>
        </div>
        <div className="rounded-2xl bg-card px-4 py-3 shadow-xs">
          <p className="text-sm text-muted-foreground">Ventas registradas</p>
          <p className="mt-1 font-display text-2xl font-semibold text-foreground">
            {revenueUf > 0
              ? `UF ${revenueUf.toLocaleString('es-CL')}`
              : `${project.lotes_vendidos}`}
          </p>
          <p className="text-sm font-medium text-success">
            {revenueUf > 0 ? 'valor acumulado' : 'lotes vendidos'}
          </p>
        </div>
        <div className="rounded-2xl bg-card px-4 py-3 shadow-xs">
          <p className="text-sm text-muted-foreground">Reservados</p>
          <p className="mt-1 font-display text-2xl font-semibold text-foreground">
            {project.lotes_reservados}
          </p>
          <p className="text-sm font-medium text-warning">
            {project.lotes_reservados === 1
              ? '1 por revisar'
              : `${project.lotes_reservados} por revisar`}
          </p>
        </div>
        <div className="rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-xs">
          <p className="text-sm text-primary-foreground/80">En mesa</p>
          <p className="mt-1 font-display text-2xl font-semibold">{enMesa}</p>
          <p className="text-sm font-medium text-primary-foreground/85">
            {enMesa === 1 ? '1 bloqueada — revisar' : `${enMesa} bloqueadas — revisar`}
          </p>
        </div>
      </div>

      {tableLots.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="[&_th]:px-5 [&_th]:py-3 [&_th]:font-medium">
                  <th>Lote</th>
                  <th>Comprador</th>
                  <th>ROL</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {tableLots.map((lot) => {
                  const status = lotStatusConfig[lot.estado] ?? lotStatusConfig.disponible
                  return (
                    <tr key={lot.id} className="[&_td]:px-5 [&_td]:py-3">
                      <td className="font-medium text-foreground">{lot.numero_lote}</td>
                      <td className="text-foreground">
                        {lot.lot_records?.cliente_nombre ?? 'Sin comprador'}
                      </td>
                      <td className="font-mono text-muted-foreground">{lot.geometry_id ?? '—'}</td>
                      <td>
                        <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const viewerSectionRef = useRef<HTMLDivElement>(null)

  // Data State
  const [project, setProject] = useState<ProjectWithMetrics | null>(null)
  const [lots, setLots] = useState<LotWithRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  // Lots Fetching State
  const [isLotsLoading, setIsLotsLoading] = useState(true)
  const [lotsError, setLotsError] = useState<string | null>(null)

  // Local guard
  const isDeletedRef = useRef(false)

  // Check user role
  useEffect(() => {
    const checkRole = async () => {
      if (!project?.organization_id) return

      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data } = await supabase
          .from('organization_members')
          .select('role')
          .eq('organization_id', project.organization_id)
          .eq('user_id', user.id)
          .maybeSingle()

        setUserRole(data?.role || null)
      }
    }

    if (project) {
      checkRole()
    }
  }, [project])

  const isAdmin = userRole === 'admin'

  // Load Project Data
  useEffect(() => {
    if (isDeletedRef.current || deletedProjects.has(projectId)) return

    const controller = new AbortController()

    const loadProject = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          signal: controller.signal,
        })
        if (response.ok) {
          const data = await response.json()
          if (!isDeletedRef.current && !deletedProjects.has(projectId)) {
            setProject(data.project)
          }
        } else {
          // Si es 404
          if (!controller.signal.aborted && !isDeletedRef.current) {
            router.push('/projects')
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error loading project:', error)
        if (!controller.signal.aborted && !isDeletedRef.current) {
          router.push('/projects')
        }
      } finally {
        if (!controller.signal.aborted && !isDeletedRef.current) {
          setIsLoading(false)
        }
      }
    }

    loadProject()

    return () => {
      controller.abort()
    }
  }, [projectId, router])

  // Load Lots Data
  const fetchLots = useCallback(async () => {
    setIsLotsLoading(true)
    setLotsError(null)

    try {
      const response = await fetch(`/api/projects/${projectId}/lots`)
      if (!response.ok) {
        throw new Error('No se pudieron cargar los lotes')
      }
      const data = await response.json()
      setLots(data.lots || [])
    } catch (error) {
      console.error('Error loading lots:', error)
      setLotsError('No se pudieron cargar los lotes')
    } finally {
      setIsLotsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchLots()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [fetchLots])

  const requestedTab = searchParams.get('tab')
  const [selectedTab, setSelectedTab] = useState('overview')
  const validTabs = isAdmin
    ? ['overview', 'lots', 'viewer', 'documents', 'clients', 'legal']
    : ['overview', 'lots', 'viewer', 'documents']
  const activeTab = requestedTab && validTabs.includes(requestedTab) ? requestedTab : selectedTab

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        isDeletedRef.current = true
        deletedProjects.add(projectId)
        router.push('/projects')
      }
    } catch (error) {
      console.error('Error deleting project:', error)
    } finally {
      if (!isDeletedRef.current) {
        setIsDeleting(false)
      }
    }
  }

  const handleTabChange = (value: string) => {
    setSelectedTab(value)
    router.replace(`/projects/${projectId}${value === 'overview' ? '' : `?tab=${value}`}`, {
      scroll: false,
    })
    if (value === 'legal') {
      fetchLots()
    }
  }

  const handleStartSale = () => {
    handleTabChange('viewer')
    window.setTimeout(() => {
      viewerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader
          title="Cargando proyecto"
          description="Preparando resumen, lotes y visor del proyecto."
          action={<Skeleton className="h-11 w-32" />}
        />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 md:h-64 w-full" />
        </div>
      </PageShell>
    )
  }

  if (!project) {
    return null
  }

  return (
    <PageShell className="py-4 sm:py-5">
      <PageHeader
        title={project.name}
        description={`${project.region} / ${project.comuna}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button className="min-h-11 px-5 font-semibold" onClick={handleStartSale}>
              <HugeiconsIcon icon={PlusSignIcon} />
              Nueva venta
            </Button>
            {isAdmin ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={isDeleting}
                    className="min-h-11 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                    <span className="hidden sm:inline">Eliminar</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. Se eliminarán todos los datos asociados
                      incluidos lotes, geometrías y clientes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        }
      />

      <ProjectSummaryPanel project={project} lots={lots} />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4 md:space-y-6">
        <div className="flex overflow-x-auto px-1">
          <TabsList className="h-auto flex-wrap gap-0.5">
            <TabsTrigger value="overview" className="min-h-11 text-xs sm:text-sm">
              Vista General
            </TabsTrigger>
            <TabsTrigger value="lots" className="min-h-11 text-xs sm:text-sm">
              Lotes
            </TabsTrigger>
            <TabsTrigger value="viewer" className="min-h-11 text-xs sm:text-sm">
              Visor
            </TabsTrigger>
            <TabsTrigger value="documents" className="min-h-11 text-xs sm:text-sm">
              Documentos
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="clients" className="min-h-11 text-xs sm:text-sm">
                Clientes
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="legal" className="min-h-11 text-xs sm:text-sm">
                Legal
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab project={project} />
        </TabsContent>

        <TabsContent value="lots">
          <LotsTab
            projectId={projectId}
            lots={lots}
            isLoading={isLotsLoading}
            error={lotsError}
            onRefresh={fetchLots}
            isAdmin={isAdmin}
          />
        </TabsContent>

        <TabsContent value="viewer">
          <div ref={viewerSectionRef}>
            {/* GeometryViewer ya maneja su propio estado interno, pero idealmente debería recibir datos
                 o tener un bus de eventos si quisieramos sincronizar selección */}
            <GeometryViewer projectId={projectId} projectName={project.name} isAdmin={isAdmin} />
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab project={project} isAdmin={isAdmin} lots={lots} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="clients">
            <ClientsTab lots={lots} />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="legal">
            <LegalTab lots={lots} projectId={projectId} project={project} />
          </TabsContent>
        )}
      </Tabs>
    </PageShell>
  )
}
