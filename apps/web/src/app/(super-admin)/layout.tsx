import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { SuperAdminSidebar } from '@/components/super-admin/SuperAdminSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

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
      <SuperAdminSidebar user={{ email: user.email }} />
      <SidebarInset className="bg-slate-50 flex flex-col min-h-svh">
        <main className="flex-1 overflow-auto outline-none">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
