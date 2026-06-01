import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { getOrganizationMembers } from '@/lib/services/vendors.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserStar01Icon } from '@hugeicons/core-free-icons'
import { InviteVendorDialog } from '@/components/vendors/InviteVendorDialog'
import { VendorActions } from '@/components/vendors/VendorActions'
import { EmptyState } from '@/components/dashboard/empty-state'

export default async function VendorsPage() {
  const { user } = await getUserWithSuperAdmin()

  if (!user) {
    redirect('/auth/login')
  }

  const workspace = await getActiveWorkspace(user.id)

  if (!workspace) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>No hay Workspace activo</CardTitle>
            <CardDescription>
              Debes pertenecer a una organización para ver los vendedores.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const members = await getOrganizationMembers(workspace.organization.id)
  const isAdmin = members.find((m) => m.id === user.id)?.role === 'admin'

  return (
    <div className="p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <HugeiconsIcon icon={UserStar01Icon} className="w-8 h-8 text-blue-600" />
            Vendedores
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Miembros de {workspace.organization.name} que pueden gestionar lotes
          </p>
        </div>
        {isAdmin && <InviteVendorDialog organizationId={workspace.organization.id} />}
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={UserStar01Icon}
          title="No hay vendedores"
          description="Aún no has registrado ningún vendedor en tu organización. Invita a miembros de tu equipo para que puedan gestionar lotes y comisiones."
          action={
            isAdmin ? <InviteVendorDialog organizationId={workspace.organization.id} /> : undefined
          }
        />
      ) : (
        <Card className="border-sidebar-border overflow-hidden">
          <CardHeader className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-sidebar-border">
            <CardTitle>Equipo de Trabajo</CardTitle>
            <CardDescription>Lista de usuarios con acceso a este Workspace</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-sidebar-border">
                    <TableHead className="w-20">Avatar</TableHead>
                    <TableHead>Nombre Completo</TableHead>
                    <TableHead>Email / Usuario</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead className="text-right w-25">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id} className="border-sidebar-border">
                      <TableCell>
                        <Avatar>
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="bg-blue-100 text-blue-700 font-medium">
                            {member.first_name?.[0] || member.username?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">
                        {member.first_name} {member.last_name}
                        {!member.first_name &&
                          !member.last_name &&
                          (member.username || 'Usuario sin nombre')}
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-600 dark:text-gray-400">{member.username}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-600 dark:text-gray-400">
                          {member.phone || '---'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={member.role === 'admin' ? 'default' : 'secondary'}
                          className={member.role === 'admin' ? 'bg-blue-600' : ''}
                        >
                          {member.role === 'admin' ? 'Administrador' : 'Vendedor'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin && (
                          <VendorActions
                            vendorId={member.id}
                            vendorEmail={member.username || ''}
                            vendorName={
                              member.first_name
                                ? `${member.first_name} ${member.last_name || ''}`.trim()
                                : ''
                            }
                            organizationId={workspace.organization.id}
                            isAdmin={member.role === 'admin'}
                            isCurrentUser={member.id === user.id}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card List View (< 768px) */}
            <div className="grid grid-cols-1 gap-4 p-4 md:hidden">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col p-5 rounded-2xl border border-sidebar-border bg-background/50 hover:bg-muted/10 transition-colors shadow-sm space-y-4 relative"
                >
                  {/* Top Header section */}
                  <div className="flex items-center gap-3">
                    <Avatar className="w-11 h-11 shrink-0 border border-sidebar-border shadow-sm">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="bg-blue-100 text-blue-700 font-bold text-sm">
                        {member.first_name?.[0] || member.username?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <h4 className="font-bold text-base text-foreground leading-snug truncate">
                        {member.first_name} {member.last_name}
                        {!member.first_name &&
                          !member.last_name &&
                          (member.username || 'Usuario sin nombre')}
                      </h4>
                      <Badge
                        variant={member.role === 'admin' ? 'default' : 'secondary'}
                        className={
                          member.role === 'admin'
                            ? 'bg-blue-600 font-bold text-[10px]'
                            : 'font-bold text-[10px]'
                        }
                      >
                        {member.role === 'admin' ? 'Administrador' : 'Vendedor'}
                      </Badge>
                    </div>

                    {/* Action Button Container (with minimum target size 44x44px for accessibility) */}
                    {isAdmin && (
                      <div className="flex items-center justify-center min-w-11 min-h-11 shrink-0 bg-muted/40 rounded-xl hover:bg-muted/80 transition-colors">
                        <VendorActions
                          vendorId={member.id}
                          vendorEmail={member.username || ''}
                          vendorName={
                            member.first_name
                              ? `${member.first_name} ${member.last_name || ''}`.trim()
                              : ''
                          }
                          organizationId={workspace.organization.id}
                          isAdmin={member.role === 'admin'}
                          isCurrentUser={member.id === user.id}
                        />
                      </div>
                    )}
                  </div>

                  {/* Body fields section */}
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-sidebar-border text-xs leading-relaxed">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        Correo
                      </span>
                      <p className="text-foreground truncate font-medium">{member.username}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        Teléfono
                      </span>
                      <p className="text-foreground font-medium">{member.phone || '---'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
