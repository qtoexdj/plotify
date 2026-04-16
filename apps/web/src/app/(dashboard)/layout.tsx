import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { BackendStatusBadge } from '@/components/system/BackendStatusBadge'
import { ModeToggle } from '@/components/mode-toggle'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user) {
    redirect('/auth/login')
  }

  if (isSuperAdmin) {
    redirect('/super-admin')
  }

  const email = user.email ?? ''
  const name = email.split('@')[0] ?? 'Usuario'
  const workspace = await getActiveWorkspace(user.id)

  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          name,
          email,
        }}
        workspace={workspace}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </div>
          <div className="ml-auto px-4 flex items-center gap-2">
            <ModeToggle />
            <BackendStatusBadge />
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}

