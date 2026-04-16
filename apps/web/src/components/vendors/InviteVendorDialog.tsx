'use client'

import { useState } from 'react'
import { inviteVendor } from '@/actions/invite-vendor.action'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserAdd01Icon, Mail01Icon } from '@hugeicons/core-free-icons'

interface InviteVendorDialogProps {
    organizationId: string
}

export function InviteVendorDialog({ organizationId }: InviteVendorDialogProps) {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [open, setOpen] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!email || !email.includes('@')) {
            toast.error('Por favor ingresa un email válido')
            return
        }

        setLoading(true)
        try {
            const result = await inviteVendor(email, organizationId)

            if (result.success) {
                toast.success(result.message || 'Invitación enviada correctamente')
                setEmail('')
                setOpen(false)
            } else {
                toast.error(result.error || 'Error al enviar la invitación')
            }
        } catch {
            toast.error('Error inesperado al enviar la invitación')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <HugeiconsIcon icon={UserAdd01Icon} className="w-4 h-4" />
                    Invitar Vendedor
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <HugeiconsIcon icon={Mail01Icon} className="w-5 h-5 text-blue-600" />
                        Invitar Vendedor
                    </DialogTitle>
                    <DialogDescription>
                        Envía una invitación por email para que un nuevo vendedor se una a tu organización.
                        Recibirá un link para completar su registro.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="invite-email">Email del vendedor</Label>
                        <Input
                            id="invite-email"
                            type="email"
                            placeholder="vendedor@ejemplo.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={loading}
                            autoFocus
                        />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <DialogClose asChild>
                            <Button type="button" variant="outline" disabled={loading}>
                                Cancelar
                            </Button>
                        </DialogClose>
                        <Button type="submit" disabled={loading} className="gap-2">
                            {loading ? (
                                <>
                                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                    Enviando...
                                </>
                            ) : (
                                <>
                                    <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
                                    Enviar Invitación
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
