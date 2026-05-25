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
    <div className="p-6 space-y-6">
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

      <Card className="border-sidebar-border overflow-hidden">
        <CardHeader className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-sidebar-border">
          <CardTitle>Equipo de Trabajo</CardTitle>
          <CardDescription>Lista de usuarios con acceso a este Workspace</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
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
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No se encontraron miembros en esta organización.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
