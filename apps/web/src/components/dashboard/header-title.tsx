'use client'

import { usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon } from '@hugeicons/react'
import { Building03Icon } from '@hugeicons/core-free-icons'

interface HeaderTitleProps {
  workspaceName: string
  userRole: 'admin' | 'vendor'
}

export function HeaderTitle({ workspaceName, userRole }: HeaderTitleProps) {
  const pathname = usePathname()

  // Dynamic mapping of path to professional Spanish title
  const getTitle = (path: string) => {
    if (path.startsWith('/dashboard')) return 'Dashboard'
    if (path.startsWith('/projects')) return 'Proyectos'
    if (path.startsWith('/clients')) return 'Leads'
    if (path.startsWith('/vendors')) return 'Vendedores'
    if (path.startsWith('/documentos')) return 'Documentos'
    if (path.startsWith('/agente')) return 'Agente'
    if (path.startsWith('/settings')) return 'Configuración'
    if (path.startsWith('/ayuda')) return 'Ayuda'
    return 'Plotify'
  }

  const title = getTitle(pathname)

  return (
    <div className="flex items-center gap-3 shrink-0">
      <span className="text-base font-semibold text-foreground tracking-tight transition-all duration-300">
        {title}
      </span>
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted/50 border border-sidebar-border/80 shadow-3xs">
        <HugeiconsIcon icon={Building03Icon} className="h-3 w-3 text-muted-foreground/80" />
        <span className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
          {workspaceName}
        </span>
      </div>
      <Badge
        variant="outline"
        className={`hidden sm:inline-flex text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border-none shadow-none ${
          userRole === 'admin'
            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 dark:bg-indigo-500/15'
            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/15'
        }`}
      >
        {userRole === 'admin' ? 'Administrador' : 'Vendedor'}
      </Badge>
    </div>
  )
}
