'use client'

import { use, useCallback, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight01Icon, Delete02Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ProjectWithMetrics } from '@/types/database.types'
import type { LotWithRecord } from '@/components/projects/detail/types'
import { createClient } from '@/lib/supabase/client'
import { useSetBreadcrumbLabel } from '@/components/dashboard/breadcrumb-context'
import { cn } from '@/lib/utils'

interface ProjectDetailPageProps {
  params: Promise<{ projectId: string }>
}

const deletedProjects = new Set<string>()

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const viewerSectionRef = useRef<HTMLDivElement>(null)

  // Data State
  const [project, setProject] = useState<ProjectWithMetrics | null>(null)
  const [lots, setLots] = useState<LotWithRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useSetBreadcrumbLabel(project?.name)
  const [isDeleting, setIsDeleting] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [isRoleLoading, setIsRoleLoading] = useState(true)

  // Lots Fetching State
  const [isLotsLoading, setIsLotsLoading] = useState(true)
  const [lotsError, setLotsError] = useState<string | null>(null)

  // Local guard
  const isDeletedRef = useRef(false)

  // Check user role
  useEffect(() => {
    const checkRole = async () => {
      if (!project?.organization_id) {
        setIsRoleLoading(false)
        return
      }

      setIsRoleLoading(true)

      const supabase = createClient()
      try {
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
        } else {
          setUserRole(null)
        }
      } finally {
        setIsRoleLoading(false)
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
  const adminTabs = ['clients', 'legal']
  const validTabs = isAdmin
    ? ['overview', 'lots', 'viewer', 'documents', 'clients', 'legal']
    : ['overview', 'lots', 'viewer', 'documents']
  const isRequestedAdminTab = requestedTab ? adminTabs.includes(requestedTab) : false
  const canHoldRequestedAdminTab = isRoleLoading && isRequestedAdminTab
  const activeTab =
    requestedTab && (validTabs.includes(requestedTab) || canHoldRequestedAdminTab)
      ? requestedTab
      : selectedTab
  const isViewerTab = activeTab === 'viewer'

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
    <PageShell
      className={cn('py-4 sm:py-5', isViewerTab && 'md:h-[calc(100svh-4.5rem)] md:overflow-hidden')}
      contentClassName={cn(
        isViewerTab && 'md:flex md:h-full md:min-h-0 md:flex-col md:gap-5 md:space-y-0'
      )}
    >
      <PageHeader
        title={project.name}
        description={`${project.region} / ${project.comuna}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button className="min-h-11 px-5 font-semibold" onClick={handleStartSale}>
              <HugeiconsIcon icon={ArrowRight01Icon} />
              Ir al visor
            </Button>
            {isAdmin ? (
              <AlertDialog>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="min-h-11 min-w-11 px-3"
                      aria-label="Administrar proyecto"
                    >
                      <HugeiconsIcon icon={MoreHorizontalIcon} />
                      <span className="hidden sm:inline">Administrar</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem disabled className="text-muted-foreground">
                      Acciones del proyecto
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        className="gap-2 text-destructive focus:text-destructive"
                        disabled={isDeleting}
                        onSelect={(event) => event.preventDefault()}
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="h-4 w-4" />
                        Eliminar proyecto
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                  </DropdownMenuContent>
                </DropdownMenu>
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

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className={cn(
          'space-y-4 md:space-y-6',
          isViewerTab && 'md:flex md:min-h-0 md:flex-1 md:flex-col md:gap-5 md:space-y-0'
        )}
      >
        <div className="relative -mx-1 overflow-hidden px-1">
          <div className="overflow-x-auto pb-1 pr-10">
            <TabsList className="!h-11 shrink-0 gap-0.5">
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
              {(isAdmin || (isRoleLoading && isRequestedAdminTab)) && (
                <TabsTrigger value="clients" className="min-h-11 text-xs sm:text-sm">
                  Clientes
                </TabsTrigger>
              )}
              {(isAdmin || (isRoleLoading && isRequestedAdminTab)) && (
                <TabsTrigger value="legal" className="min-h-11 text-xs sm:text-sm">
                  Legal
                </TabsTrigger>
              )}
            </TabsList>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
        </div>

        <TabsContent value="overview">
          <OverviewTab project={project} lots={lots} />
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

        <TabsContent value="viewer" className={cn(isViewerTab && 'md:min-h-0 md:flex-1')}>
          <div ref={viewerSectionRef} className={cn(isViewerTab && 'md:h-full md:min-h-0')}>
            {/* GeometryViewer ya maneja su propio estado interno, pero idealmente debería recibir datos
                 o tener un bus de eventos si quisieramos sincronizar selección */}
            <GeometryViewer projectId={projectId} projectName={project.name} isAdmin={isAdmin} />
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab project={project} isAdmin={isAdmin} lots={lots} />
        </TabsContent>

        {(isAdmin || (isRoleLoading && activeTab === 'clients')) && (
          <TabsContent value="clients">
            {isAdmin ? (
              <ClientsTab lots={lots} />
            ) : (
              <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
                Cargando permisos del proyecto…
              </div>
            )}
          </TabsContent>
        )}

        {(isAdmin || (isRoleLoading && activeTab === 'legal')) && (
          <TabsContent value="legal">
            {isAdmin ? (
              <LegalTab lots={lots} projectId={projectId} project={project} />
            ) : (
              <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
                Cargando centro legal y permisos del proyecto…
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </PageShell>
  )
}
