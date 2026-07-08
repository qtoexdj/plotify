'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Spinner } from '@/components/ui/spinner'
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
  reservationSchema,
  saleSchema,
  type ReservationInput,
  type SaleInput,
} from '@/lib/validations/lot-reservation.schema'
import { requestReservationApproval, requestSaleApproval } from '@/actions/request-approval.action'
import type { ReservationFormInput, SaleFormInput } from '@/lib/validations/approval-request.schema'
import { CHILE_REGIONS, findRegionCode } from '@/lib/geo/chile-location'
import type { LotClientPrefill } from '@/types/viewer.types'
import { ClienteIdentificacion } from '@/components/projects/lot-reservation-form/cliente-identificacion'
import { ClienteDomicilio } from '@/components/projects/lot-reservation-form/cliente-domicilio'
import { ClienteContacto } from '@/components/projects/lot-reservation-form/cliente-contacto'
import { FirmaYMonto } from '@/components/projects/lot-reservation-form/firma-y-monto'
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
  /** T042 (FR-016): datos de la reserva aprobada para precargar la venta. */
  initialClientData?: LotClientPrefill | null
}

const PREFILLABLE_FIELDS_IN_ORDER = [
  'cliente_nombre',
  'cliente_run',
  'cliente_direccion',
  'cliente_region',
  'cliente_comuna',
  'cliente_estado_civil',
  'cliente_nacionalidad',
  'cliente_ocupacion',
  'cliente_email',
  'cliente_telefono',
] as const

export function LotReservationForm({
  projectId,
  lotId,
  lotNumber,
  onSuccess,
  onCancel,
  mode = 'reservation',
  initialReservationValue = 0,
  initialClientData = null,
}: LotReservationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isDirectSale = mode === 'direct_sale'
  const hasPrefill = isDirectSale && Boolean(initialClientData)

  const form = useForm<SaleInput>({
    resolver: zodResolver(isDirectSale ? saleSchema : reservationSchema) as never,
    defaultValues: {
      cliente_nombre: initialClientData?.cliente_nombre ?? '',
      cliente_run: initialClientData?.cliente_run ?? '',
      cliente_direccion: initialClientData?.cliente_direccion ?? '',
      // cliente_region viaja como nombre legible en lot_records (el mismo
      // formato que se guarda al enviar, ver onSubmit más abajo), pero el
      // <Select> de región usa el código como value interno — hay que
      // convertir nombre→código al precargar o el combobox queda vacío
      // aunque el dato exista (T042).
      cliente_region: initialClientData?.cliente_region
        ? findRegionCode(initialClientData.cliente_region)
        : '',
      cliente_comuna: initialClientData?.cliente_comuna ?? '',
      cliente_estado_civil: initialClientData?.cliente_estado_civil ?? '',
      cliente_nacionalidad: initialClientData?.cliente_nacionalidad ?? '',
      cliente_ocupacion: initialClientData?.cliente_ocupacion ?? '',
      cliente_email: initialClientData?.cliente_email ?? '',
      cliente_telefono: initialClientData?.cliente_telefono ?? '',
      fecha: new Date().toISOString().split('T')[0], // Today YYYY-MM-DD
      notaria: '',
      valor_reserva: initialReservationValue,
    },
  })

  // T042: foco en el primer campo vacío tras precargar desde la reserva.
  useEffect(() => {
    if (!hasPrefill) return
    const firstEmpty = PREFILLABLE_FIELDS_IN_ORDER.find(
      (field) => !initialClientData?.[field]?.trim()
    )
    if (firstEmpty) {
      form.setFocus(firstEmpty)
    } else {
      form.setFocus('fecha')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSubmit(data: ReservationInput | SaleInput) {
    setIsSubmitting(true)
    try {
      const selectedRegion = CHILE_REGIONS.find((region) => region.code === data.cliente_region)
      const submissionData = {
        ...data,
        cliente_region: selectedRegion?.name ?? data.cliente_region,
      }

      if (mode === 'direct_sale') {
        const result = await requestSaleApproval(projectId, lotId, submissionData as SaleFormInput)
        if (result.success) {
          toast.success('Solicitud de venta enviada', {
            description: `La solicitud de venta del lote ${lotNumber} fue enviada al administrador para aprobación.`,
          })
          onSuccess()
        } else {
          toast.error('Error', { description: result.error })
        }
      } else {
        // Flujo de aprobación cruzada
        const result = await requestReservationApproval(
          projectId,
          lotId,
          submissionData as ReservationFormInput
        )
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
    <div className="flex max-h-[80vh] flex-col">
      <div className="px-1 pb-4">
        <h3 className="text-lg font-medium">
          {mode === 'direct_sale' ? `Venta Lote ${lotNumber}` : `Reservar Lote ${lotNumber}`}
        </h3>
        <p className="text-sm text-muted-foreground">
          Complete los datos del cliente para solicitar la{' '}
          {mode === 'direct_sale' ? 'venta' : 'reserva'}.
        </p>
        {hasPrefill ? (
          <p
            role="status"
            className="mt-2 rounded-md bg-info/10 px-3 py-2 text-xs font-medium text-info"
          >
            Datos cargados desde la reserva. Revísalos y completa lo que falte.
          </p>
        ) : null}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-4 pr-2">
            <ClienteIdentificacion control={form.control} />
            <ClienteDomicilio control={form.control} setValue={form.setValue} />
            <ClienteContacto control={form.control} />

            {isDirectSale ? (
              <FirmaYMonto control={form.control} />
            ) : (
              <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Monto</p>
                  <p className="text-xs text-muted-foreground">
                    Compromiso comercial inicial de la reserva.
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="valor_reserva"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor reserva ($)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="500000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            )}
          </div>

          <div className="flex w-full flex-col gap-2 border-t bg-background/95 px-1 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
              className="min-h-11 w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-h-11 w-full sm:w-auto">
              {isSubmitting && <Spinner className="mr-2 h-4 w-4" />}
              {mode === 'direct_sale' ? 'Confirmar Venta' : 'Solicitar Reserva'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
