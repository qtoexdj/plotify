'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Folder02Icon } from '@hugeicons/core-free-icons'
import type { ProjectWithMetrics } from '@/types/database.types'
import { createClient } from '@/lib/supabase/client'
import { SkeletonCard } from '@/components/dashboard/skeleton-card'
import { EmptyState } from '@/components/dashboard/empty-state'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { BentoGrid } from '@/components/dashboard/bento-grid'

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectWithMetrics[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

  const supabase = createClient()

  const getFullUrl = (path: string | null | undefined) => {
    if (!path || path === '[]') return ''
    const cleanPath = path.replace(/^project-files\//, '')
    const { data } = supabase.storage.from('project-files').getPublicUrl(cleanPath)
    return data.publicUrl
  }

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()
      setProjects(data.projects || [])
      setUserRole(data.role || 'user')
    } catch (error) {
      console.error('Error loading projects:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProjects()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadProjects])

  const handleDelete = async (projectId: string) => {
    setDeletingId(projectId)
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId))
      }
    } catch (error) {
      console.error('Error deleting project:', error)
    } finally {
      setDeletingId(null)
    }
  }

  const isAdmin = userRole === 'admin'

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-9 w-40 bg-muted rounded animate-pulse" />
            <div className="h-4 w-60 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-10 w-36 bg-muted rounded animate-pulse" />
        </div>
        <BentoGrid>
          <div className="md:col-span-6 xl:col-span-4">
            <SkeletonCard />
          </div>
          <div className="md:col-span-6 xl:col-span-4">
            <SkeletonCard />
          </div>
          <div className="md:col-span-6 xl:col-span-4">
            <SkeletonCard />
          </div>
        </BentoGrid>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Proyectos"
        description="Gestiona tus proyectos de loteos"
        action={
          isAdmin && (
            <Link href="/onboarding/new">
              <Button size="lg">
                <HugeiconsIcon icon={PlusSignIcon} className="w-5 h-5 mr-2" />
                Nuevo Proyecto
              </Button>
            </Link>
          )
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={Folder02Icon}
          title="No hay proyectos"
          description="Aún no has registrado ningún proyecto de loteo. Comienza creando tu primer loteo para habilitar las ventas y comisiones de tu equipo."
          actionLabel="Crear Proyecto"
          actionHref="/onboarding/new"
        />
      ) : (
        <BentoGrid>
          {projects.map((project) => (
            <div key={project.id} className="md:col-span-6 xl:col-span-4">
              <ProjectCard
                project={project}
                isAdmin={isAdmin}
                deletingId={deletingId}
                onDelete={handleDelete}
                onClick={() => router.push(`/projects/${project.id}`)}
                getFullUrl={getFullUrl}
                layout="grid"
              />
            </div>
          ))}
        </BentoGrid>
      )}
    </PageShell>
  )
}
