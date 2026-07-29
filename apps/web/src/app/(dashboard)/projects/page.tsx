'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Folder02Icon } from '@hugeicons/core-free-icons'
import type { ProjectWithMetrics } from '@/types/database.types'
import { SkeletonCard } from '@/components/dashboard/skeleton-card'
import { EmptyState } from '@/components/dashboard/empty-state'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { BentoGrid } from '@/components/dashboard/bento-grid'
import { StatusBadge } from '@/components/ui/status-badge'

const projectStatusConfig: Record<
  string,
  { label: string; variant: 'success' | 'info' | 'neutral' }
> = {
  operational: { label: 'Operacional', variant: 'success' },
  validated: { label: 'Validado', variant: 'info' },
  imported: { label: 'Importado', variant: 'info' },
  draft: { label: 'Borrador', variant: 'neutral' },
  activo: { label: 'Activo', variant: 'success' },
  inactivo: { label: 'Inactivo', variant: 'neutral' },
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithMetrics[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

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
      const response = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
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
  const totals = projects.reduce(
    (acc, project) => ({
      lots: acc.lots + project.total_lotes,
      available: acc.available + project.lotes_libres,
      reserved: acc.reserved + project.lotes_reservados,
      sold: acc.sold + project.lotes_vendidos,
    }),
    { lots: 0, available: 0, reserved: 0, sold: 0 }
  )

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
        description="Administra tus loteos, disponibilidad y avance comercial."
        action={
          isAdmin ? (
            <Button asChild size="lg" className="min-h-11 px-5 font-semibold">
              <Link href="/onboarding/new">
                <HugeiconsIcon icon={PlusSignIcon} />
                Nuevo Proyecto
              </Link>
            </Button>
          ) : null
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
        <section className="rounded-2xl bg-background/70 p-4 shadow-sm ring-1 ring-border/40 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Portafolio</span>
            <StatusBadge variant="available">{totals.available} disponibles</StatusBadge>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-card px-5 py-4 shadow-xs">
              <p className="text-sm text-muted-foreground">Lotes totales</p>
              <p className="mt-1 font-display text-3xl font-semibold text-foreground">
                {totals.lots}
              </p>
              <p className="text-sm font-medium text-muted-foreground">
                {projects.length} proyectos activos
              </p>
            </div>
            <div className="rounded-2xl bg-card px-5 py-4 shadow-xs">
              <p className="text-sm text-muted-foreground">Reservados</p>
              <p className="mt-1 font-display text-3xl font-semibold text-foreground">
                {totals.reserved}
              </p>
              <p className="text-sm font-medium text-warning">por gestionar</p>
            </div>
            <div className="rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-xs">
              <p className="text-sm text-primary-foreground/80">Vendidos</p>
              <p className="mt-1 font-display text-3xl font-semibold">{totals.sold}</p>
              <p className="text-sm font-medium text-primary-foreground/85">cierres registrados</p>
            </div>
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <BentoGrid>
          {projects.map((project) => {
            const status = projectStatusConfig[project.estado ?? 'draft'] ?? {
              label: project.estado,
              variant: 'neutral' as const,
            }
            return (
              <div key={project.id} className="md:col-span-6 xl:col-span-4">
                <ProjectCard
                  project={project}
                  isAdmin={isAdmin}
                  deletingId={deletingId}
                  onDelete={handleDelete}
                  projectHref={`/projects/${project.id}`}
                  statusLabel={status.label}
                  statusVariant={status.variant}
                  layout="grid"
                />
              </div>
            )
          })}
        </BentoGrid>
      )}
    </PageShell>
  )
}
