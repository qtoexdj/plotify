import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { SuperAdminSidebar } from '@/components/super-admin/SuperAdminSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { isEscriturasLabEnabled } from '@/lib/labs/escrituras.guard'
import { CommandPaletteProvider } from '@/components/command-palette'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user) {
    redirect('/auth/login')
  }

  if (!isSuperAdmin) {
    redirect('/projects')
  }

  return (
    <SidebarProvider>
      <CommandPaletteProvider>
        <SuperAdminSidebar
          user={{ email: user.email }}
          showEscriturasLab={isEscriturasLabEnabled()}
        />
        <SidebarInset className="flex flex-col min-h-svh">
          <main className="flex-1 overflow-auto outline-none">{children}</main>
        </SidebarInset>
      </CommandPaletteProvider>
    </SidebarProvider>
  )
}
