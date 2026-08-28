'use client'

import Link from 'next/link'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { projectFileHref } from '@/lib/projects/project-media'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge, type statusBadgeVariants } from '@/components/ui/status-badge'
import {
  DeleteProjectDialog,
  type DeleteProjectConfirmation,
} from '@/components/projects/DeleteProjectDialog'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/ui/avatar'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, Folder02Icon, Location01Icon } from '@hugeicons/core-free-icons'
import type { ProjectWithMetrics } from '@/types/database.types'

type StatusVariant = NonNullable<VariantProps<typeof statusBadgeVariants>['variant']>

const projectCardVariants = cva(
  'group/project-card relative overflow-hidden flex bg-card text-card-foreground shadow-xs transition-shadow hover:shadow-md',
  {
    variants: {
      layout: {
        grid: 'flex-col rounded-2xl',
        list: 'flex-col md:flex-row rounded-2xl items-stretch md:min-h-[220px]',
        compact: 'flex-row rounded-xl p-3 items-center gap-3 py-4',
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
  onDelete: (id: string, confirmation: DeleteProjectConfirmation) => void
  projectHref: string
  statusLabel?: string
  statusVariant?: StatusVariant
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
  projectHref,
  statusLabel,
  statusVariant,
  layout,
  className,
}: ProjectCardProps) {
  const isGrid = layout === 'grid' || !layout
  const isList = layout === 'list'
  const isCompact = layout === 'compact'

  const coverImageUrl =
    project.images && project.images.length > 0 ? projectFileHref(project.images[0]) : ''

  const renderStatusBadge = () => (
    <StatusBadge variant={statusVariant ?? 'neutral'} className="shadow-xs">
      {statusLabel ?? project.estado}
    </StatusBadge>
  )

  const renderCardLink = () => (
    <Link
      href={projectHref}
      className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label={`Abrir proyecto ${project.name}`}
    >
      <span className="sr-only">Abrir proyecto {project.name}</span>
    </Link>
  )

  const renderDeleteButton = () => {
    if (!isAdmin) return null
    return (
      <DeleteProjectDialog
        project={project}
        isDeleting={deletingId === project.id}
        onConfirm={onDelete}
      >
        <Button
          variant="ghost"
          size="icon"
          className="relative z-20 min-h-11 min-w-11 shrink-0 text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
          disabled={deletingId === project.id}
          aria-label={`Eliminar proyecto ${project.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
        </Button>
      </DeleteProjectDialog>
    )
  }

  const renderKPIs = () => {
    const kpiClass = isList
      ? 'text-center px-4 py-2 bg-muted/40 rounded-xl min-w-[90px]'
      : 'text-center p-2.5 bg-muted/40 rounded-xl'

    const gridClass = isList
      ? 'flex flex-wrap md:flex-nowrap gap-3 shrink-0'
      : 'grid grid-cols-2 gap-2.5 mt-3'

    return (
      <div className={gridClass}>
        <div className={kpiClass}>
          <div className="font-display text-xl font-semibold text-foreground">
            {project.total_lotes}
          </div>
          <div className="text-[10px] font-bold text-muted-foreground mt-0.5 uppercase tracking-wide">
            Total
          </div>
        </div>
        <div className={kpiClass}>
          <div className="font-display text-xl font-semibold text-success">
            {project.lotes_libres}
          </div>
          <div className="text-[10px] font-bold text-success/80 mt-0.5 uppercase tracking-wide">
            Libres
          </div>
        </div>
        <div className={kpiClass}>
          <div className="font-display text-xl font-semibold text-warning">
            {project.lotes_reservados}
          </div>
          <div className="text-[10px] font-bold text-warning/80 mt-0.5 uppercase tracking-wide">
            Reservas
          </div>
        </div>
        <div className={kpiClass}>
          <div className="font-display text-xl font-semibold text-primary">
            {project.lotes_vendidos}
          </div>
          <div className="text-[10px] font-bold text-primary/80 mt-0.5 uppercase tracking-wide">
            Ventas
          </div>
        </div>
      </div>
    )
  }

  // --- 1. COMPACT LAYOUT ---
  if (isCompact) {
    return (
      <div className={cn(projectCardVariants({ layout }), className)}>
        {renderCardLink()}
        <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
          <HugeiconsIcon icon={Folder02Icon} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-display font-semibold text-sm text-foreground truncate">
            {project.name}
          </h4>
          <p className="text-xs text-muted-foreground truncate">
            {project.region} / {project.comuna}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge variant="available">{project.lotes_libres} Libres</StatusBadge>
          {renderDeleteButton()}
        </div>
      </div>
    )
  }

  // --- 2. GRID LAYOUT ---
  if (isGrid) {
    return (
      <Card className={cn(projectCardVariants({ layout }), className)}>
        {renderCardLink()}
        {/* Cover Image */}
        <div className="relative aspect-video w-full bg-muted shrink-0">
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
          <div className="absolute top-3 left-3">{renderStatusBadge()}</div>
        </div>

        <CardHeader className="pt-4 pb-2 shrink-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="font-display text-lg font-semibold text-foreground leading-snug tracking-tight truncate">
                {project.name}
              </CardTitle>
              <CardDescription className="flex items-center gap-1 mt-1 text-xs font-medium text-muted-foreground">
                <HugeiconsIcon
                  icon={Location01Icon}
                  className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                />
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
                    <Avatar key={v.id} className="w-6 h-6">
                      {v.avatar_url ? <AvatarImage src={v.avatar_url} alt={v.nombre} /> : null}
                      <AvatarFallback className="text-[9px] font-bold">
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
    <Card className={cn(projectCardVariants({ layout }), className)}>
      {renderCardLink()}
      {/* Left Image Area */}
      <div className="relative w-full md:w-64 bg-muted shrink-0 min-h-[160px] md:min-h-0">
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
        <div className="absolute top-3 left-3">{renderStatusBadge()}</div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col justify-between p-5 md:p-6 gap-4 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="font-display text-xl font-semibold text-foreground leading-snug tracking-tight truncate">
              {project.name}
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1">
                <HugeiconsIcon
                  icon={Location01Icon}
                  className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                />
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
                      <Avatar key={v.id} className="w-5.5 h-5.5">
                        {v.avatar_url ? <AvatarImage src={v.avatar_url} alt={v.nombre} /> : null}
                        <AvatarFallback className="text-[8px] font-bold">
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
