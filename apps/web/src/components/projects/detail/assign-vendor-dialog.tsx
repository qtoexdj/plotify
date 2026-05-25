'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import {
  getOrganizationMembersAction,
  assignVendorsToProjectAction,
} from '@/actions/vendor-actions.action'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserAdd01Icon, Tick01Icon } from '@hugeicons/core-free-icons'
import type { OrganizationMemberWithProfile } from '@/lib/services/vendors.service'

interface AssignVendorDialogProps {
  projectId: string
  organizationId: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  assignedVendorIds: string[]
  onSuccess: () => void
}

export function AssignVendorDialog({
  projectId,
  organizationId,
  isOpen,
  onOpenChange,
  assignedVendorIds,
  onSuccess,
}: AssignVendorDialogProps) {
  const [loading, setLoading] = useState(false)
  const [members, setMembers] = useState<OrganizationMemberWithProfile[]>([])
  // Ahora guardamos el ID del miembro (que es su profile_id/user_id)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])

  const loadMembers = useCallback(async () => {
    setLoading(true)
    const result = await getOrganizationMembersAction(organizationId)
    if (result.success && result.data) {
      // Mostrar todos los miembros para asegurar que cargan, incluso los que no tienen vendor_id
      const nextMembers = result.data as OrganizationMemberWithProfile[]
      setMembers(nextMembers)
      setSelectedMemberIds(
        nextMembers
          .filter((m) => m.vendor_id && assignedVendorIds.includes(m.vendor_id))
          .map((m) => m.id)
      )
    } else {
      toast.error('Error al cargar miembros')
    }
    setLoading(false)
  }, [assignedVendorIds, organizationId])

  useEffect(() => {
    if (!isOpen) return

    const timeoutId = window.setTimeout(() => {
      void loadMembers()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [isOpen, loadMembers])

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((i) => i !== memberId) : [...prev, memberId]
    )
  }

  const handleAssign = async () => {
    setLoading(true)
    try {
      // Preparar data para el servidor: por cada seleccionado, enviamos su vendor_id (si tiene) o su user_id (para crear)
      const assignmentsData = selectedMemberIds.map((mId) => {
        const member = members.find((m) => m.id === mId)
        return {
          vendorId: member?.vendor_id,
          userId: mId,
        }
      })

      const result = await assignVendorsToProjectAction(projectId, assignmentsData, organizationId)
      if (result.success) {
        toast.success('Vendedores asignados correctamente')
        onSuccess()
        onOpenChange(false)
      } else {
        toast.error(result.error || 'Error al asignar')
      }
    } catch (error) {
      console.error(error)
      toast.error('Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <HugeiconsIcon icon={UserAdd01Icon} className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle>Asignar Vendedores</DialogTitle>
          </div>
          <DialogDescription>
            Selecciona los vendedores de tu organización que tendrán acceso a este proyecto.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Command className="rounded-lg border shadow-md">
            <CommandInput placeholder="Buscar vendedor..." />
            <CommandList>
              <CommandEmpty>No se encontraron miembros.</CommandEmpty>
              <CommandGroup heading="Miembros de la Organización">
                {members.map((member) => (
                  <CommandItem
                    key={member.id}
                    onSelect={() => toggleMember(member.id)}
                    className="flex items-center gap-3 p-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedMemberIds.includes(member.id)}
                      onCheckedChange={() => toggleMember(member.id)}
                    />
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback>
                        {member.first_name?.[0]}
                        {member.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {member.first_name} {member.last_name}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {member.role === 'admin' ? 'Administrador' : 'Vendedor'}
                      </span>
                    </div>
                    {selectedMemberIds.includes(member.id) && (
                      <HugeiconsIcon icon={Tick01Icon} className="ml-auto w-4 h-4 text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleAssign} disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
