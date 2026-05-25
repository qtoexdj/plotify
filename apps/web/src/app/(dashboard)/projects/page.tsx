'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon,
  Delete02Icon,
  Folder02Icon,
  Location01Icon,
} from '@hugeicons/core-free-icons'
import type { ProjectWithMetrics } from '@/types/database.types'
import { createClient } from '@/lib/supabase/client'

const getInitials = (name: string) => {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return parts[0].substring(0, 2).toUpperCase()
}

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
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-600">Cargando proyectos...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">Proyectos</h1>
          <p className="text-gray-600 dark:text-slate-400 mt-1">Gestiona tus proyectos de loteos</p>
        </div>
        {isAdmin && (
          <Link href="/onboarding/new">
            <Button size="lg">
              <HugeiconsIcon icon={PlusSignIcon} className="w-5 h-5 mr-2" />
              Nuevo Proyecto
            </Button>
          </Link>
        )}
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <HugeiconsIcon
              icon={Folder02Icon}
              className="w-16 h-16 text-gray-400 dark:text-slate-600 mb-4"
            />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">
              No hay proyectos
            </h3>
            <p className="text-gray-600 dark:text-slate-400 mb-4">
              Comienza creando tu primer proyecto
            </p>
            <Link href="/onboarding/new">
              <Button>
                <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4 mr-2" />
                Crear Proyecto
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="hover:shadow-lg transition-shadow cursor-pointer overflow-hidden flex flex-col border-slate-200 dark:border-slate-800"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              {/* Cover Image */}
              <div className="relative aspect-video w-full bg-slate-100 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 shrink-0">
                {project.images && project.images.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getFullUrl(project.images[0])}
                    alt={project.name}
                    className="absolute inset-0 object-cover w-full h-full"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src =
                        'https://placehold.co/600x400?text=Sin+Imagen'
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full text-slate-400">
                    <HugeiconsIcon icon={Folder02Icon} className="w-12 h-12" />
                  </div>
                )}
                {/* Status Badge overlay */}
                <div className="absolute top-3 left-3">
                  <Badge
                    variant="secondary"
                    className="bg-white/95 text-slate-900 border-none shadow-sm backdrop-blur-sm dark:bg-slate-900/95 dark:text-slate-100 font-medium"
                  >
                    {project.estado}
                  </Badge>
                </div>
              </div>

              <CardHeader className="pt-4 pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl line-clamp-1">{project.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1 text-sm">
                      <HugeiconsIcon icon={Location01Icon} className="w-4 h-4" />
                      {project.region} / {project.comuna}
                    </CardDescription>
                  </div>
                  {isAdmin && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 -mt-1 -mr-2"
                          disabled={deletingId === project.id}
                        >
                          <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminarán todos los datos
                            asociados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(project.id)}>
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-5 flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-2">
                    {project.descripcion || 'Sin descripción'}
                  </p>

                  {/* Vendedores / Avatares */}
                  {project.vendedores && project.vendedores.length > 0 && (
                    <div className="mt-4 flex items-center gap-2">
                      <AvatarGroup>
                        {project.vendedores.slice(0, 3).map((v) => (
                          <Avatar key={v.id}>
                            <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                              {getInitials(v.nombre)}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {project.vendedores.length > 3 && (
                          <AvatarGroupCount>+{project.vendedores.length - 3}</AvatarGroupCount>
                        )}
                      </AvatarGroup>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {project.vendedores.length} vendedor
                        {project.vendedores.length !== 1 ? 'es' : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* KPIs Grid */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {project.total_lotes}
                    </div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                      Total
                    </div>
                  </div>
                  <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {project.lotes_libres}
                    </div>
                    <div className="text-xs font-medium text-emerald-600/80 dark:text-emerald-500 mt-1">
                      Disponibles
                    </div>
                  </div>
                  <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-900/30">
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {project.lotes_reservados}
                    </div>
                    <div className="text-xs font-medium text-amber-600/80 dark:text-amber-500 mt-1">
                      Reservados
                    </div>
                  </div>
                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/30">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {project.lotes_vendidos}
                    </div>
                    <div className="text-xs font-medium text-blue-600/80 dark:text-blue-500 mt-1">
                      Vendidos
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
