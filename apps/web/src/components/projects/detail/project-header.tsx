'use client'

import { useRouter } from 'next/navigation'
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
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  Location01Icon,
  PencilEdit02Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import type { ProjectWithMetrics } from '@/types/database.types'

interface ProjectHeaderProps {
  project: ProjectWithMetrics
  onDelete: () => Promise<void>
  isDeleting: boolean
  isAdmin?: boolean
  children?: React.ReactNode
}

export function ProjectHeader({
  project,
  onDelete,
  isDeleting,
  isAdmin,
  children,
}: ProjectHeaderProps) {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push('/projects')}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
            {project.name}
          </h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
              <HugeiconsIcon icon={Location01Icon} className="w-3.5 h-3.5 shrink-0" />
              {project.region} / {project.comuna}
            </span>
            <Badge variant="secondary" className="text-xs">
              {project.estado}
            </Badge>
          </div>
        </div>
      </div>

      {children && (
        <div className="flex flex-1 justify-start md:justify-center overflow-x-auto min-w-0">
          {children}
        </div>
      )}

      {isAdmin && (
        <div className="flex items-center gap-2">
          {/* Edit button: icon-only on mobile, with label on desktop */}
          <Button variant="outline" size="icon" className="h-9 w-9 md:hidden">
            <HugeiconsIcon icon={PencilEdit02Icon} className="w-4 h-4" />
          </Button>
          <Button variant="outline" className="hidden md:flex">
            <HugeiconsIcon icon={PencilEdit02Icon} className="w-4 h-4 mr-2" />
            Editar
          </Button>

          {/* Delete button: icon-only on mobile, with label on desktop */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDeleting} className="gap-0 md:gap-2">
                <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
                <span className="hidden md:inline">Eliminar</span>
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
                <AlertDialogAction onClick={onDelete}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}
