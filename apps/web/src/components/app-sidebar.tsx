import { DashboardCircleIcon, Folder02Icon, UserGroupIcon, Settings01Icon, UserStar01Icon, AiChat01Icon, PuzzleIcon, File02Icon } from "@hugeicons/core-free-icons"
import Link from "next/link"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export const navItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: DashboardCircleIcon,
  },
  {
    title: "Proyectos",
    url: "/projects",
    icon: Folder02Icon,
  },
  {
    title: "Agente",
    icon: AiChat01Icon,
    items: [
      {
        title: "Chat",
        url: "/agente",
      },
      {
        title: "Skills",
        url: "/agente/skills",
        icon: PuzzleIcon,
      },
      {
        title: "Integraciones",
        url: "/agente/integrations",
      },
    ],
  },
  {
    title: "Leads",
    url: "/clients",
    icon: UserGroupIcon,
  },
  {
    title: "Vendedores",
    url: "/vendors",
    icon: UserStar01Icon,
  },
  {
    title: "Documentos",
    icon: File02Icon,
    items: [
      {
        title: "Plantillas",
        url: "/documentos/plantillas",
      },
      {
        title: "Bloques",
        url: "/documentos/bloques",
      },
      {
        title: "Historial",
        url: "/documentos/historial",
      },
    ],
  },
  {
    title: "Configuración",
    icon: Settings01Icon,
    items: [
      {
        title: "Perfil de Usuario",
        url: "/settings/profile",
      },
      {
        title: "Workspace",
        url: "/settings/workspace",
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
}

export function AppSidebar({ user, workspace, ...props }: AppSidebarProps) {
  const sidebarUser = {
    name: user?.name ?? "Usuario",
    email: user?.email ?? "",
    avatar: user?.avatar ?? "",
  }

  const workspaceName = workspace?.organization?.name ?? "Plotify"
  const workspaceType = workspace?.organization
    ? workspace.organization.is_personal
      ? "Cuenta Independiente"
      : "Empresa"
    : "Gestión de loteos"

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Plotify">
              <Link href="/projects">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
                  {workspaceName.charAt(0).toUpperCase()}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{workspaceName}</span>
                  <span className="truncate text-xs text-blue-600 font-medium dark:text-blue-400">
                    {workspaceType}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <NavMain items={navItems.map(item => ({ ...item, icon: undefined, hugeIcon: item.icon }))} />
      <SidebarFooter>
        <NavUser user={sidebarUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
