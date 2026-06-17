import {
  DashboardCircleIcon,
  Folder02Icon,
  UserGroupIcon,
  Settings01Icon,
  UserStar01Icon,
  AiChat01Icon,
  PuzzleIcon,
  File02Icon,
} from '@hugeicons/core-free-icons'
import Link from 'next/link'

import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
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
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: DashboardCircleIcon,
  },
  {
    title: 'Proyectos',
    url: '/projects',
    icon: Folder02Icon,
  },
  {
    title: 'Agente',
    icon: AiChat01Icon,
    items: [
      {
        title: 'Chat',
        url: '/agente',
      },
      {
        title: 'Skills',
        url: '/agente/skills',
        icon: PuzzleIcon,
      },
      {
        title: 'Integraciones',
        url: '/agente/integrations',
      },
    ],
  },
  {
    title: 'Leads',
    url: '/clients',
    icon: UserGroupIcon,
  },
  {
    title: 'Vendedores',
    url: '/vendors',
    icon: UserStar01Icon,
  },
  {
    title: 'Documentos',
    icon: File02Icon,
    items: [
      {
        title: 'Plantillas',
        url: '/documentos/plantillas',
      },
      {
        title: 'Historial',
        url: '/documentos/historial',
      },
    ],
  },
  {
    title: 'Configuración',
    icon: Settings01Icon,
    items: [
      {
        title: 'Perfil de Usuario',
        url: '/settings/profile',
      },
      {
        title: 'Workspace',
        url: '/settings/workspace',
      },
    ],
  },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    name: string
    email: string
    avatar?: string
  }
  workspace?: { organization?: { name?: string | null; is_personal?: boolean | null } } | null
  leadCount?: number
}

export function AppSidebar({ user, workspace, leadCount = 0, ...props }: AppSidebarProps) {
  const sidebarUser = {
    name: user?.name ?? 'Usuario',
    email: user?.email ?? '',
    avatar: user?.avatar ?? '',
  }

  const workspaceName = workspace?.organization?.name ?? 'Plotify'
  const workspaceType = workspace?.organization
    ? workspace.organization.is_personal
      ? 'Cuenta Independiente'
      : 'Empresa'
    : 'Gestión de loteos'

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Plotify">
              <Link href="/projects">
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
                  <span className="truncate font-semibold text-foreground">{workspaceName}</span>
                  <span className="truncate text-xs text-accent font-semibold">
                    {workspaceType}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          label="Principal"
          items={navItems
            .filter((item) => ['Dashboard', 'Proyectos'].includes(item.title))
            .map((item) => ({ ...item, icon: undefined, hugeIcon: item.icon }))}
        />
        <NavMain
          label="Herramientas"
          items={navItems
            .filter((item) => ['Agente', 'Leads', 'Vendedores', 'Documentos'].includes(item.title))
            .map((item) => {
              if (item.title === 'Leads') {
                return { ...item, icon: undefined, hugeIcon: item.icon, badge: leadCount }
              }
              return { ...item, icon: undefined, hugeIcon: item.icon }
            })}
        />
        <NavMain
          label="Configuración"
          items={navItems
            .filter((item) => ['Configuración'].includes(item.title))
            .map((item) => ({ ...item, icon: undefined, hugeIcon: item.icon }))}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
