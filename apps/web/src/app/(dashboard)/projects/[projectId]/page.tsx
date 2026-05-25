'use client'

import { use, useCallback, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GeometryViewer } from '@/components/projects/geometry-viewer'
import { ProjectHeader } from '@/components/projects/detail/project-header'
import { OverviewTab } from '@/components/projects/detail/overview-tab'
import { LotsTab } from '@/components/projects/detail/lots-tab'
import { ClientsTab } from '@/components/projects/detail/clients-tab'
import { LegalTab } from '@/components/projects/detail/legal-tab'
import { DocumentsTab } from '@/components/projects/detail/documents-tab'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProjectWithMetrics } from '@/types/database.types'
import type { LotWithRecord } from '@/components/projects/detail/types'
import { createClient } from '@/lib/supabase/client'

interface ProjectDetailPageProps {
  params: Promise<{ projectId: string }>
}

const deletedProjects = new Set<string>()

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = use(params)
  const router = useRouter()

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

  const [activeTab, setActiveTab] = useState('overview')

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === 'legal') {
      fetchLots()
    }
  }

  if (isLoading) {
    return (
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 md:h-8 md:w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-20 md:h-10 md:w-24" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 md:h-64 w-full" />
        </div>
      </div>
    )
  }

  if (!project) {
    return null
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4 md:space-y-6">
        <ProjectHeader
          project={project}
          onDelete={handleDelete}
          isDeleting={isDeleting}
          isAdmin={isAdmin}
        >
          <TabsList className="flex-wrap h-auto gap-0.5">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">
              Vista General
            </TabsTrigger>
            <TabsTrigger value="lots" className="text-xs sm:text-sm">
              Lotes
            </TabsTrigger>
            <TabsTrigger value="viewer" className="text-xs sm:text-sm">
              Visor
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs sm:text-sm">
              Documentos
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="clients" className="text-xs sm:text-sm">
                Clientes
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="legal" className="text-xs sm:text-sm">
                Legal
              </TabsTrigger>
            )}
          </TabsList>
        </ProjectHeader>

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
          {/* GeometryViewer ya maneja su propio estado interno, pero idealmente debería recibir datos 
               o tener un bus de eventos si quisieramos sincronizar selección */}
          <GeometryViewer projectId={projectId} projectName={project.name} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab project={project} isAdmin={isAdmin} />
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
    </div>
  )
}
