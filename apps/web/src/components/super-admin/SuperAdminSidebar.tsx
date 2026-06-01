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
]

interface SuperAdminSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    email?: string | null
  }
}

export function SuperAdminSidebar({ user, ...props }: SuperAdminSidebarProps) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Plotify Admin">
              <Link href="/super-admin">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand-gradient shadow-md transition-all duration-300 hover:scale-105">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="size-4 text-white"
                  >
                    <path
                      d="M12 2L2 7L12 12L22 7L12 2Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 17L12 22L22 17"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 12L12 17L22 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-foreground">Plotify Admin</span>
                  <span className="truncate text-xs text-accent font-semibold">Control global</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
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

      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-3">
        <BackendStatusBadge />
        <UserMenu user={{ email: user?.email ?? undefined }} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
