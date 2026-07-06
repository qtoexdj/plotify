'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  formatRut,
} from '@/lib/validations/lot-reservation.schema'
import { requestReservationApproval, requestSaleApproval } from '@/actions/request-approval.action'
import {
  CHILE_COMMUNES_BY_REGION,
  CHILE_REGIONS,
  fetchChileRegions,
  fetchCommunesByRegion,
  type ChileRegion,
} from '@/lib/geo/chile-location'
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
  const [regions, setRegions] = useState<ChileRegion[]>(CHILE_REGIONS)
  const [communes, setCommunes] = useState<string[]>([])
  const [isLoadingCommunes, setIsLoadingCommunes] = useState(false)

  const form = useForm<LotReservationInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(lotReservationSchema) as any,
    defaultValues: {
      cliente_nombre: '',
      cliente_run: '',
      cliente_direccion: '',
      cliente_region: '',
      cliente_comuna: '',
      cliente_estado_civil: '',
      cliente_nacionalidad: '',
      cliente_ocupacion: '',
      cliente_email: '',
      cliente_telefono: '',
      fecha: new Date().toISOString().split('T')[0], // Today YYYY-MM-DD
      notaria: '',
      valor_reserva: initialReservationValue,
    },
  })

  const selectedRegionCode = form.watch('cliente_region')
  const selectedCommune = form.watch('cliente_comuna')
  const communeOptions =
    selectedCommune && !communes.includes(selectedCommune)
      ? [selectedCommune, ...communes]
      : communes

  useEffect(() => {
    let isMounted = true

    fetchChileRegions()
      .then((items) => {
        if (!isMounted) return
        setRegions(items)
      })
      .catch(() => {
        if (!isMounted) return
        setRegions(CHILE_REGIONS)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedRegionCode) {
      setCommunes([])
      return
    }

    let isMounted = true
    const fallbackCommunes = CHILE_COMMUNES_BY_REGION[selectedRegionCode] ?? []

    setCommunes(fallbackCommunes)
    setIsLoadingCommunes(true)

    fetchCommunesByRegion(selectedRegionCode)
      .then((items) => {
        if (!isMounted) return
        setCommunes(items)
      })
      .catch(() => {
        if (!isMounted) return
        setCommunes([])
      })
      .finally(() => {
        if (!isMounted) return
        setIsLoadingCommunes(false)
      })

    return () => {
      isMounted = false
    }
  }, [selectedRegionCode])

  async function onSubmit(data: LotReservationInput) {
    setIsSubmitting(true)
    try {
      const selectedRegion = regions.find((region) => region.code === data.cliente_region)
      const submissionData = {
        ...data,
        cliente_region: selectedRegion?.name ?? data.cliente_region,
      }

      if (mode === 'direct_sale') {
        const result = await requestSaleApproval(projectId, lotId, submissionData)
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
        const result = await requestReservationApproval(projectId, lotId, submissionData)
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
    <div className="flex max-h-[min(82vh,780px)] flex-col">
      <div className="px-1 pb-4">
        <h3 className="text-lg font-medium">
          {mode === 'direct_sale' ? `Venta Lote ${lotNumber}` : `Reservar Lote ${lotNumber}`}
        </h3>
        <p className="text-sm text-muted-foreground">
          Complete los datos del cliente para solicitar la{' '}
          {mode === 'direct_sale' ? 'venta' : 'reserva'}.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-4 pr-2">
            <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Identificación</p>
                <p className="text-xs text-muted-foreground">Datos legales del comprador.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField<LotReservationInput, 'cliente_nombre'>
                  control={form.control}
                  name="cliente_nombre"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Nombre completo</FormLabel>
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

                <FormField<LotReservationInput, 'cliente_nacionalidad'>
                  control={form.control}
                  name="cliente_nacionalidad"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nacionalidad</FormLabel>
                      <FormControl>
                        <Input placeholder="Chilena" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField<LotReservationInput, 'cliente_estado_civil'>
                  control={form.control}
                  name="cliente_estado_civil"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado civil</FormLabel>
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
            </section>

            <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Domicilio</p>
                <p className="text-xs text-muted-foreground">
                  Dirección civil y ubicación administrativa.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField<LotReservationInput, 'cliente_direccion'>
                  control={form.control}
                  name="cliente_direccion"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Dirección</FormLabel>
                      <FormControl>
                        <Input placeholder="Av. Siempre Viva 123" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField<LotReservationInput, 'cliente_region'>
                  control={form.control}
                  name="cliente_region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Región</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value)
                          form.setValue('cliente_comuna', '')
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecciona región" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {regions.map((region) => (
                            <SelectItem key={region.code} value={region.code}>
                              {region.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField<LotReservationInput, 'cliente_comuna'>
                  control={form.control}
                  name="cliente_comuna"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comuna</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!selectedRegionCode || communeOptions.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={
                                isLoadingCommunes ? 'Cargando comunas...' : 'Selecciona comuna'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {communeOptions.map((commune) => (
                            <SelectItem key={commune} value={commune}>
                              {commune}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Contacto</p>
                <p className="text-xs text-muted-foreground">Canales para confirmar la gestión.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            </section>

            <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Firma y monto</p>
                <p className="text-xs text-muted-foreground">
                  Condiciones iniciales para solicitar aprobación.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField<LotReservationInput, 'fecha'>
                  control={form.control}
                  name="fecha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de firma</FormLabel>
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
                    <FormItem className="md:col-span-2">
                      <FormLabel>
                        {mode === 'direct_sale' ? 'Valor final venta ($)' : 'Valor reserva ($)'}
                      </FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="500000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>
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
