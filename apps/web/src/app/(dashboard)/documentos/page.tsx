'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  DatabaseIcon,
  File02Icon,
  FileAttachmentIcon,
  Folder02Icon,
  LayoutLeftIcon,
  Loading02Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { BentoGrid, BentoPanel } from '@/components/dashboard/bento-grid'
import { EmptyState } from '@/components/dashboard/empty-state'
import type { ProjectWithMetrics } from '@/types/database.types'

const ACCESOS = [
  {
    title: 'Historial',
    description: 'Revisa las minutas generadas desde escrituras aprobadas.',
    href: '/documentos/historial',
    icon: FileAttachmentIcon,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
  },
  {
    title: 'Plantillas',
    description: 'Redacta cláusulas, condiciones y alertas con nombres claros.',
    href: '/documentos/plantillas',
    icon: LayoutLeftIcon,
    color: 'text-sky-700',
    bg: 'bg-sky-50',
  },
] as const

type ProjectsResponse = {
  projects?: ProjectWithMetrics[]
  error?: string
}

function projectLocation(project: ProjectWithMetrics) {
  return [project.comuna, project.region].filter(Boolean).join(', ')
}

function projectMetrics(project: ProjectWithMetrics) {
  return [
    `${project.total_lotes} lotes`,
    `${project.lotes_vendidos} vendidos`,
    `${project.lotes_reservados} reservados`,
  ]
}

export default function DocumentosPage() {
  const [projects, setProjects] = useState<ProjectWithMetrics[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadProjects() {
      try {
        const response = await fetch('/api/projects')
        const payload = (await response.json()) as ProjectsResponse
        if (!response.ok) {
          throw new Error(payload.error || 'No se pudieron cargar los proyectos')
        }
        if (!active) return
        const nextProjects = payload.projects ?? []
        setProjects(nextProjects)
        setSelectedProjectId((current) => current || nextProjects[0]?.id || '')
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los proyectos')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadProjects()

    return () => {
      active = false
    }
  }, [])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId]
  )

  const matrixHref = selectedProject
    ? `/documentos/matriz/proyecto/${selectedProject.id}`
    : '/projects'
  const variablesHref = selectedProject
    ? `/projects/${selectedProject.id}?tab=legal#variables-legales`
    : '/projects'

  return (
    <PageShell>
      <PageHeader
        title="Documentos legales"
        description="Matrices, variables legales e historial documental por proyecto."
      />

      {isLoading ? (
        <BentoGrid>
          <BentoPanel className="md:col-span-12 p-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <HugeiconsIcon icon={Loading02Icon} className="h-4 w-4 animate-spin" />
              Cargando proyectos...
            </div>
          </BentoPanel>
        </BentoGrid>
      ) : error ? (
        <BentoGrid>
          <BentoPanel className="md:col-span-12 p-6">
            <div className="flex items-start gap-3 text-sm text-destructive">
              <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          </BentoPanel>
        </BentoGrid>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={Folder02Icon}
          title="No hay proyectos"
          description="Crea un proyecto para preparar su matriz de escritura y revisar sus variables legales."
          actionLabel="Ir a Proyectos"
          actionHref="/projects"
        />
      ) : (
        <BentoGrid>
          <BentoPanel className="md:col-span-12">
            <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Proyecto
                </p>
                <div className="space-y-1">
                  <h2 className="truncate text-xl font-semibold text-foreground">
                    {selectedProject?.name}
                  </h2>
                  {selectedProject ? (
                    <p className="text-sm text-muted-foreground">
                      {projectLocation(selectedProject) || 'Sin ubicación registrada'}
                    </p>
                  ) : null}
                </div>
                {selectedProject ? (
                  <div className="flex flex-wrap gap-2">
                    {projectMetrics(selectedProject).map((metric) => (
                      <Badge key={metric} variant="secondary" className="rounded-md">
                        {metric}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={selectedProject?.id ?? ''} onValueChange={setSelectedProjectId}>
                  <SelectTrigger aria-label="Cambiar proyecto" className="w-full min-w-56 sm:w-64">
                    <SelectValue placeholder="Selecciona proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" asChild>
                  <Link href="/projects">Ver proyecto</Link>
                </Button>
              </div>
            </div>
          </BentoPanel>

          <BentoPanel className="md:col-span-6">
            <div className="flex h-full flex-col justify-between gap-6 p-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                    <HugeiconsIcon icon={File02Icon} className="h-5 w-5" />
                  </div>
                  <Badge variant="outline" className="rounded-md">
                    Proyecto
                  </Badge>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">
                    Matriz de escritura del proyecto
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Base aprobable una vez para el proyecto, con datos de venta pendientes para cada
                    lote.
                  </p>
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <HugeiconsIcon icon={Tick02Icon} className="h-4 w-4 text-emerald-600" />
                    Vendedor, predio y título del proyecto
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <HugeiconsIcon icon={FileAttachmentIcon} className="h-4 w-4 text-amber-600" />
                    Comprador, lote y precio al validar venta
                  </div>
                </div>
              </div>
              <Button asChild className="w-full sm:w-fit">
                <Link href={matrixHref}>Abrir matriz</Link>
              </Button>
            </div>
          </BentoPanel>

          <BentoPanel className="md:col-span-6">
            <div className="flex h-full flex-col justify-between gap-6 p-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <HugeiconsIcon icon={DatabaseIcon} className="h-5 w-5" />
                  </div>
                  <Badge variant="outline" className="rounded-md">
                    Centro Legal
                  </Badge>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">
                    Matriz de variables del proyecto
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Revisión legal existente del proyecto: título, SII, SAG y plano.
                  </p>
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <span>Se abre en el Centro de Control Legal del proyecto.</span>
                  <span>No crea una entidad nueva de revisión.</span>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full sm:w-fit">
                <Link href={variablesHref}>Abrir variables</Link>
              </Button>
            </div>
          </BentoPanel>

          <BentoPanel className="md:col-span-12">
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">Actividad reciente</h3>
                  <p className="text-sm text-muted-foreground">
                    Movimientos de escrituras para el proyecto seleccionado.
                  </p>
                </div>
                <Badge variant="secondary" className="rounded-md">
                  Próximo
                </Badge>
              </div>
              <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                Aún no hay actividad de escrituras para este proyecto.
              </div>
            </div>
          </BentoPanel>
        </BentoGrid>
      )}

      <BentoGrid>
        {ACCESOS.map((item) => (
          <Link key={item.href} href={item.href} className="group md:col-span-6 xl:col-span-4">
            <BentoPanel className="h-full transition-shadow hover:shadow-md cursor-pointer">
              <CardHeader className="gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.bg}`}>
                  <HugeiconsIcon icon={item.icon} className={`w-5 h-5 ${item.color}`} />
                </div>
                <div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription className="text-sm mt-0.5">{item.description}</CardDescription>
                </div>
              </CardHeader>
            </BentoPanel>
          </Link>
        ))}
      </BentoGrid>
    </PageShell>
  )
}
