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
import { cn } from '@/lib/utils'

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

export function SuperAdminSidebar() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 p-4 space-y-2">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors',
              isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            )}
          >
            <HugeiconsIcon icon={Icon} className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
