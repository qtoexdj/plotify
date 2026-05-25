import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { SuperAdminSidebar } from '@/components/super-admin/SuperAdminSidebar'
import { BackendStatusBadge } from '@/components/system/BackendStatusBadge'
import { UserMenu } from '@/components/auth/UserMenu'
import Link from 'next/link'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user) {
    redirect('/auth/login')
  }

  if (!isSuperAdmin) {
    redirect('/projects')
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <Link href="/super-admin">
            <h1 className="text-2xl font-bold text-slate-900">Plotify Admin</h1>
            <p className="text-sm text-slate-600">Control global</p>
          </Link>
        </div>

        <SuperAdminSidebar />

        <div className="p-4 border-t border-slate-200 space-y-3">
          <BackendStatusBadge />
          <UserMenu user={{ email: user.email }} />
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
