'use client'

import {
  DashboardCircleIcon,
  Folder02Icon,
  UserGroupIcon,
  Settings01Icon,
  UserStar01Icon,
  AiChat01Icon,
  File02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import Link from 'next/link'

import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import { BrandMark } from '@/components/brand/brand-mark'
import { CommandPaletteTrigger } from '@/components/command-palette'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

export const navItems = [
  { title: 'Panel', url: '/dashboard', icon: DashboardCircleIcon },
  { title: 'Proyectos', url: '/projects', icon: Folder02Icon },
  { title: 'Escrituras', url: '/documentos', icon: File02Icon },
  { title: 'Leads', url: '/clients', icon: UserGroupIcon },
  { title: 'Vendedores', url: '/vendors', icon: UserStar01Icon },
  { title: 'Agente', url: '/agente', icon: AiChat01Icon },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    name: string
    email: string
    avatar?: string
  }
  workspaceName?: string
  leadCount?: number
  userRole?: 'admin' | 'vendor'
}

export function AppSidebar({
  user,
  workspaceName = 'Plotify',
  leadCount = 0,
  userRole = 'vendor',
  ...props
}: AppSidebarProps) {
  const sidebarUser = {
    name: user?.name ?? 'Usuario',
    email: user?.email ?? '',
    avatar: user?.avatar ?? '',
  }

  const filteredNavItems = navItems.filter((item) => {
    // Si el usuario es vendor (no-admin), ocultamos "Escrituras" y "Vendedores"
    if (userRole !== 'admin') {
      if (item.url === '/documentos' || item.url === '/vendors') {
        return false
      }
    }
    return true
  })

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Plotify">
              <Link href="/dashboard">
                <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <BrandMark className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-display font-semibold text-sidebar-foreground">
                    Plotify
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    {workspaceName}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <CommandPaletteTrigger />
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={filteredNavItems.map((item) => {
            if (item.title === 'Leads') {
              return { ...item, icon: undefined, hugeIcon: item.icon, badge: leadCount }
            }
            return { ...item, icon: undefined, hugeIcon: item.icon }
          })}
        />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Configuración">
              <Link href="/settings/profile">
                <HugeiconsIcon icon={Settings01Icon} />
                <span>Configuración</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={sidebarUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
