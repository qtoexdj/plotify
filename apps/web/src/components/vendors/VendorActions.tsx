'use client'

import { useState } from 'react'
import { resendVendorInvite, removeVendor } from '@/actions/vendor-actions.action'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, Delete01Icon } from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'

interface VendorActionsProps {
  vendorId: string
  vendorEmail: string
  vendorName: string
  organizationId: string
  isAdmin: boolean
  isCurrentUser: boolean
}

export function VendorActions({
  vendorId,
  vendorEmail,
  vendorName,
  organizationId,
  isAdmin,
  isCurrentUser,
}: VendorActionsProps) {
  const [resending, setResending] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // No mostrar acciones para admins ni para el usuario actual
  if (isAdmin || isCurrentUser) return null

  const handleResend = async () => {
    setResending(true)
    try {
      const result = await resendVendorInvite(vendorEmail, organizationId)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Error al reenviar invitación')
    } finally {
      setResending(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const result = await removeVendor(vendorId, organizationId)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Error al eliminar vendedor')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-end gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleResend}
              disabled={resending}
              className="h-8 w-8 text-info hover:text-info hover:bg-info/10"
            >
              {resending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reenviar invitación</p>
          </TooltipContent>
        </Tooltip>

        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={deleting}
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {deleting ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <HugeiconsIcon icon={Delete01Icon} className="w-4 h-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Eliminar vendedor</p>
            </TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar a {vendorName || vendorEmail}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará al vendedor de la organización y su cuenta de acceso. Esta
                acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                Sí, eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
