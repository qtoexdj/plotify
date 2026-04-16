'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import {
    lotReservationSchema,
    type LotReservationInput,
    formatRut
} from '@/lib/validations/lot-reservation.schema'
import { requestReservationApproval } from '@/actions/request-approval.action'
import { directSale } from '@/actions/lot-process.action'
// Assuming we have a toast hook
import { toast } from 'sonner'

interface LotReservationFormProps {
    projectId: string
    lotId: string
    lotNumber: string
    onSuccess: () => void
    onCancel: () => void
    mode?: 'reservation' | 'direct_sale'
    initialReservationValue?: number
}

export function LotReservationForm({
    projectId,
    lotId,
    lotNumber,
    onSuccess,
    onCancel,
    mode = 'reservation',
    initialReservationValue = 0,
}: LotReservationFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)

    const form = useForm<LotReservationInput>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(lotReservationSchema) as any,
        defaultValues: {
            cliente_nombre: '',
            cliente_run: '',
            cliente_direccion: '',
            cliente_estado_civil: '',
            cliente_ocupacion: '',
            cliente_email: '',
            cliente_telefono: '',
            fecha: new Date().toISOString().split('T')[0], // Today YYYY-MM-DD
            notaria: '',
            valor_reserva: initialReservationValue,
        },
    })

    async function onSubmit(data: LotReservationInput) {
        setIsSubmitting(true)
        try {
            if (mode === 'direct_sale') {
                const result = await directSale(projectId, lotId, data)
                if (result.success) {
                    toast.success('Venta Directa exitosa', {
                        description: `El lote ${lotNumber} ha sido reservado para venta directa.`,
                    })
                    onSuccess()
                } else {
                    toast.error('Error', { description: result.error })
                }
            } else {
                // Flujo de aprobación cruzada
                const result = await requestReservationApproval(projectId, lotId, data)
                if (result.success) {
                    toast.success('Solicitud enviada', {
                        description: `La solicitud de reserva del lote ${lotNumber} fue enviada al administrador para aprobación.`,
                    })
                    onSuccess()
                } else {
                    toast.error('Error', { description: result.error })
                }
            }
        } catch {
            toast.error('Error', {
                description: 'Ocurrió un error inesperado.',
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-4 py-2">
            <div className="mb-4">
                <h3 className="text-lg font-medium">
                    {mode === 'direct_sale' ? `Venta Directa Lote ${lotNumber}` : `Reservar Lote ${lotNumber}`}
                </h3>
                <p className="text-sm text-gray-500">
                    Complete los datos del cliente para realizar la {mode === 'direct_sale' ? 'venta' : 'reserva'}.
                </p>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField<LotReservationInput, 'cliente_nombre'>
                        control={form.control}
                        name="cliente_nombre"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nombre Completo</FormLabel>
                                <FormControl>
                                    <Input placeholder="Juan Pérez" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField<LotReservationInput, 'cliente_run'>
                        control={form.control}
                        name="cliente_run"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>RUT</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="12.345.678-9"
                                        {...field}
                                        onChange={(e) => {
                                            const formatted = formatRut(e.target.value)
                                            field.onChange(formatted)
                                        }}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField<LotReservationInput, 'cliente_direccion'>
                        control={form.control}
                        name="cliente_direccion"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Dirección</FormLabel>
                                <FormControl>
                                    <Input placeholder="Av. Siempre Viva 123" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField<LotReservationInput, 'cliente_estado_civil'>
                            control={form.control}
                            name="cliente_estado_civil"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Estado Civil</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Soltero/a" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField<LotReservationInput, 'cliente_ocupacion'>
                            control={form.control}
                            name="cliente_ocupacion"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Ocupación</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Arquitecto" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField<LotReservationInput, 'cliente_email'>
                            control={form.control}
                            name="cliente_email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input type="email" placeholder="juan@email.com" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField<LotReservationInput, 'cliente_telefono'>
                            control={form.control}
                            name="cliente_telefono"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Teléfono</FormLabel>
                                    <FormControl>
                                        <Input placeholder="+569..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField<LotReservationInput, 'fecha'>
                            control={form.control}
                            name="fecha"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Fecha de Firma</FormLabel>
                                    <FormControl>
                                        <Input type="date" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField<LotReservationInput, 'notaria'>
                            control={form.control}
                            name="notaria"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Notaría</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ej: Notaría Santiago" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField<LotReservationInput, 'valor_reserva'>
                            control={form.control}
                            name="valor_reserva"
                            render={({ field }) => (
                                <FormItem className="col-span-1 md:col-span-2">
                                    <FormLabel>Valor Reserva ($)</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            placeholder="500000"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <HugeiconsIcon icon={Loading02Icon} className="mr-2 h-4 w-4 animate-spin" />}
                            {mode === 'direct_sale' ? 'Confirmar Venta' : 'Solicitar Reserva'}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    )
}
