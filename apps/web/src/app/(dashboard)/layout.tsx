import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { createClient } from '@/lib/supabase/server'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { HeaderTitle } from '@/components/dashboard/header-title'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
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

  const organizationId = workspace?.organization?.id ?? ''
  const userRole = (workspace?.role === 'admin' ? 'admin' : 'vendor') as 'admin' | 'vendor'
  let leadCount = 0

  const supabase = await createClient()

  // Fetch the real user profile data (avatar, full name) from the database
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, avatar_url')
    .eq('id', user.id)
    .single()

  const fullName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name ?? ''}`.trim()
    : name
  const avatarUrl = profile?.avatar_url ?? ''

  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  if (organizationId) {
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)

    leadCount = count ?? 0
  }

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg z-50 font-medium shadow-lg"
      >
        Saltar al contenido principal
      </a>
      <AppSidebar
        user={{
          name: fullName,
          email,
          avatar: avatarUrl,
        }}
        workspace={workspace}
        leadCount={leadCount}
      />
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-border/40 bg-background/70 backdrop-blur-md transition-all duration-300">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <HeaderTitle
              workspaceName={workspace?.organization?.name ?? 'Plotify'}
              userRole={userRole}
            />
          </div>
          <div className="ml-auto px-4 flex items-center gap-3">
            {organizationId && (
              <NotificationBell
                userId={user.id}
                organizationId={organizationId}
                userRole={userRole}
              />
            )}
            <Avatar className="h-8 w-8 rounded-lg border border-border shadow-xs shrink-0">
              <AvatarImage src={avatarUrl} alt={fullName} />
              <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-bold text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto outline-none">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
