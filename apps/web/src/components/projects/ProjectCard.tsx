'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
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
import { Delete02Icon, Folder02Icon, Location01Icon } from '@hugeicons/core-free-icons'
import type { ProjectWithMetrics } from '@/types/database.types'

const projectCardVariants = cva(
  'hover:shadow-lg transition-all duration-300 cursor-pointer overflow-hidden flex border border-border/80 bg-card text-card-foreground shadow-sm',
  {
    variants: {
      layout: {
        grid: 'flex-col rounded-2xl',
        list: 'flex-col md:flex-row rounded-2xl items-stretch md:min-h-[220px]',
        compact: 'flex-row rounded-xl p-3 items-center gap-3 border-border/60 hover:shadow-md py-4',
      },
    },
    defaultVariants: {
      layout: 'grid',
    },
  }
)

interface ProjectCardProps extends VariantProps<typeof projectCardVariants> {
  project: ProjectWithMetrics
  isAdmin: boolean
  deletingId: string | null
  onDelete: (id: string) => void
  onClick: () => void
  getFullUrl: (path: string | null | undefined) => string
  className?: string
}

const getInitials = (name: string) => {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return parts[0].substring(0, 2).toUpperCase()
}

export function ProjectCard({
  project,
  isAdmin,
  deletingId,
  onDelete,
  onClick,
  getFullUrl,
  layout,
  className,
}: ProjectCardProps) {
  const isGrid = layout === 'grid' || !layout
  const isList = layout === 'list'
  const isCompact = layout === 'compact'

  const coverImageUrl =
    project.images && project.images.length > 0 ? getFullUrl(project.images[0]) : ''

  const renderDeleteButton = () => {
    if (!isAdmin) return null
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 transition-colors"
            disabled={deletingId === project.id}
          >
            <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todos los datos asociados al proyecto
              &quot;{project.name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => onDelete(project.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  const renderKPIs = () => {
    const kpiClass = isList
      ? 'text-center px-4 py-2 bg-muted/30 rounded-xl border border-border/40 min-w-[90px]'
      : 'text-center p-2.5 bg-muted/40 rounded-xl border border-border/50'

    const gridClass = isList
      ? 'flex flex-wrap md:flex-nowrap gap-3 shrink-0'
      : 'grid grid-cols-2 gap-2.5 mt-3'

    return (
      <div className={gridClass}>
        <div className={kpiClass}>
          <div className="text-xl font-bold text-foreground">{project.total_lotes}</div>
          <div className="text-[10px] font-bold text-muted-foreground mt-0.5 uppercase tracking-wide">
            Total
          </div>
        </div>
        <div
          className={cn(
            kpiClass,
            'bg-success/10 border-success/25 dark:bg-success/15 dark:border-success/30'
          )}
        >
          <div className="text-xl font-bold text-success">{project.lotes_libres}</div>
          <div className="text-[10px] font-bold text-success/80 mt-0.5 uppercase tracking-wide">
            Libres
          </div>
        </div>
        <div
          className={cn(
            kpiClass,
            'bg-warning/10 border-warning/25 dark:bg-warning/15 dark:border-warning/30'
          )}
        >
          <div className="text-xl font-bold text-warning">{project.lotes_reservados}</div>
          <div className="text-[10px] font-bold text-warning/80 mt-0.5 uppercase tracking-wide">
            Reservas
          </div>
        </div>
        <div
          className={cn(
            kpiClass,
            'bg-accent/10 border-accent/25 dark:bg-accent/15 dark:border-accent/30'
          )}
        >
          <div className="text-xl font-bold text-accent">{project.lotes_vendidos}</div>
          <div className="text-[10px] font-bold text-accent/80 mt-0.5 uppercase tracking-wide">
            Ventas
          </div>
        </div>
      </div>
    )
  }

  // --- 1. COMPACT LAYOUT ---
  if (isCompact) {
    return (
      <div className={cn(projectCardVariants({ layout }), className)} onClick={onClick}>
        <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent border border-accent/25 flex items-center justify-center shrink-0">
          <HugeiconsIcon icon={Folder02Icon} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-sm text-foreground truncate">{project.name}</h4>
          <p className="text-xs text-muted-foreground truncate">
            {project.region} / {project.comuna}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="secondary"
            className="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider bg-accent/10 text-accent border-none"
          >
            {project.lotes_libres} Libres
          </Badge>
          {renderDeleteButton()}
        </div>
      </div>
    )
  }

  // --- 2. GRID LAYOUT ---
  if (isGrid) {
    return (
      <Card className={cn(projectCardVariants({ layout }), className)} onClick={onClick}>
        {/* Cover Image */}
        <div className="relative aspect-video w-full bg-muted border-b border-border shrink-0">
          {coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImageUrl}
              alt={project.name}
              className="absolute inset-0 object-cover w-full h-full hover:scale-102 transition-transform duration-500 ease-out"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Sin+Imagen'
              }}
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full text-muted-foreground/60 bg-muted/65">
              <HugeiconsIcon icon={Folder02Icon} className="w-10 h-10 stroke-[1.2]" />
            </div>
          )}
          {/* Status Badge overlay */}
          <div className="absolute top-3 left-3">
            <Badge
              variant="secondary"
              className="bg-background/95 text-foreground border border-border shadow-sm backdrop-blur-sm font-semibold text-xs tracking-wide px-2.5 py-0.5 rounded-full"
            >
              {project.estado}
            </Badge>
          </div>
        </div>

        <CardHeader className="pt-4 pb-2 shrink-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg font-bold text-foreground leading-snug tracking-tight truncate">
                {project.name}
              </CardTitle>
              <CardDescription className="flex items-center gap-1 mt-1 text-xs font-semibold text-muted-foreground">
                <HugeiconsIcon icon={Location01Icon} className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="truncate">
                  {project.region} / {project.comuna}
                </span>
              </CardDescription>
            </div>
            {renderDeleteButton()}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 flex-1 flex flex-col justify-between pt-0 pb-5">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {project.descripcion || 'Sin descripción descriptiva registrada.'}
            </p>

            {/* Vendedores / Avatares */}
            {project.vendedores && project.vendedores.length > 0 && (
              <div className="flex items-center gap-2">
                <AvatarGroup>
                  {project.vendedores.slice(0, 3).map((v) => (
                    <Avatar key={v.id} className="w-6 h-6 border-2 border-background shadow-sm">
                      <AvatarFallback className="text-[9px] font-bold bg-accent/10 text-accent border border-accent/20">
                        {getInitials(v.nombre)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {project.vendedores.length > 3 && (
                    <AvatarGroupCount className="text-[9px] w-6 h-6 font-bold">
                      +{project.vendedores.length - 3}
                    </AvatarGroupCount>
                  )}
                </AvatarGroup>
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  {project.vendedores.length} asesor{project.vendedores.length !== 1 ? 'es' : ''}
                </span>
              </div>
            )}
          </div>

          {renderKPIs()}
        </CardContent>
      </Card>
    )
  }

  // --- 3. LIST LAYOUT ---
  return (
    <Card className={cn(projectCardVariants({ layout }), className)} onClick={onClick}>
      {/* Left Image Area */}
      <div className="relative w-full md:w-64 bg-muted border-b md:border-b-0 md:border-r border-border shrink-0 min-h-[160px] md:min-h-0">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt={project.name}
            className="absolute inset-0 object-cover w-full h-full hover:scale-102 transition-transform duration-500 ease-out"
            onError={(e) => {
              ;(e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Sin+Imagen'
            }}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-muted-foreground/60 bg-muted/65">
            <HugeiconsIcon icon={Folder02Icon} className="w-10 h-10 stroke-[1.2]" />
          </div>
        )}
        {/* Status Badge overlay */}
        <div className="absolute top-3 left-3">
          <Badge
            variant="secondary"
            className="bg-background/95 text-foreground border border-border shadow-sm backdrop-blur-sm font-semibold text-xs tracking-wide px-2.5 py-0.5 rounded-full"
          >
            {project.estado}
          </Badge>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col justify-between p-5 md:p-6 gap-4 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-xl font-bold text-foreground leading-snug tracking-tight truncate">
              {project.name}
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1">
                <HugeiconsIcon icon={Location01Icon} className="w-3.5 h-3.5 text-accent shrink-0" />
                {project.region} / {project.comuna}
              </span>

              {project.vendedores && project.vendedores.length > 0 && (
                <span className="hidden sm:inline text-muted-foreground/45">•</span>
              )}

              {/* Vendedores simple in list layout */}
              {project.vendedores && project.vendedores.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <AvatarGroup>
                    {project.vendedores.slice(0, 3).map((v) => (
                      <Avatar key={v.id} className="w-5.5 h-5.5 border border-background">
                        <AvatarFallback className="text-[8px] font-bold bg-accent/10 text-accent border border-accent/20">
                          {getInitials(v.nombre)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </AvatarGroup>
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    {project.vendedores.length} asesor{project.vendedores.length !== 1 ? 'es' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
          {renderDeleteButton()}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 flex-1">
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl line-clamp-2">
            {project.descripcion || 'Sin descripción descriptiva registrada.'}
          </p>
          {renderKPIs()}
        </div>
      </div>
    </Card>
  )
}
