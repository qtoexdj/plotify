'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  DashboardCircleIcon,
  Building03Icon,
  UserGroupIcon,
  Folder02Icon,
  FileSearchIcon,
  AiMagicIcon,
} from '@hugeicons/core-free-icons'
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
import { BackendStatusBadge } from '@/components/system/BackendStatusBadge'
import { UserMenu } from '@/components/auth/UserMenu'
import { BrandMark } from '@/components/brand/brand-mark'
import { CommandPaletteTrigger } from '@/components/command-palette'

export const NAV_ITEMS = [
  {
    href: '/super-admin',
    label: 'Dashboard',
    icon: DashboardCircleIcon,
  },
  {
    href: '/super-admin/organizations',
    label: 'Empresas',
    icon: Building03Icon,
  },
  {
    href: '/super-admin/users',
    label: 'Usuarios',
    icon: UserGroupIcon,
  },
  {
    href: '/super-admin/projects',
    label: 'Loteos',
    icon: Folder02Icon,
  },
  {
    href: '/super-admin/audit-logs',
    label: 'Auditoria',
    icon: FileSearchIcon,
  },
  {
    href: '/super-admin/prompt-ops',
    label: 'Prompt Ops',
    icon: AiMagicIcon,
  },
  {
    href: '/super-admin/llms',
    label: 'LLMs',
    icon: AiMagicIcon,
  },
]

export const ESCRITURAS_LAB_NAV_ITEM = {
  href: '/super-admin/labs/escrituras',
  label: 'Labs Escrituras',
  icon: FileSearchIcon,
}

const getNavItems = (showEscriturasLab: boolean) => [
  ...NAV_ITEMS,
  ...(showEscriturasLab ? [ESCRITURAS_LAB_NAV_ITEM] : []),
]

interface SuperAdminSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    email?: string | null
  }
  showEscriturasLab?: boolean
}

export function SuperAdminSidebar({
  user,
  showEscriturasLab = false,
  ...props
}: SuperAdminSidebarProps) {
  const pathname = usePathname()
  const navItems = getNavItems(showEscriturasLab)

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Plotify Admin">
              <Link href="/super-admin">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                  <BrandMark className="size-6" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-display font-semibold text-sidebar-foreground">
                    Plotify Admin
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/60 font-medium">
                    Control global
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <CommandPaletteTrigger />
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild tooltip={item.label} isActive={isActive}>
                  <Link href={item.href}>
                    <HugeiconsIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3">
        <BackendStatusBadge />
        <UserMenu user={{ email: user?.email ?? undefined }} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
