'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { updateWorkspaceEscrituraConfigAction } from '@/app/(dashboard)/settings/actions'
import { HugeiconsIcon } from '@hugeicons/react'
import { FloppyDiskIcon, StampIcon, UserAdd01Icon } from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'

const formSchema = z.object({
  razon_social: z.string().min(2, {
    message: 'La razón social debe tener al menos 2 caracteres.',
  }),
  rut: z.string().min(8, {
    message: 'El RUT debe ser válido (ej: 12.345.678-9).',
  }),
  banco: z.string().min(2, {
    message: 'Selecciona o ingresa el nombre de tu banco.',
  }),
  tipo_cuenta: z.string().min(2, {
    message: 'Selecciona el tipo de cuenta.',
  }),
  numero_cuenta: z.string().min(4, {
    message: 'Ingresa un número de cuenta válido.',
  }),
  email_transferencia: z
    .string()
    .email({ message: 'Ingresa un correo electrónico válido.' })
    .optional()
    .or(z.literal('')),
  abogado_nombre: z.string().min(2, {
    message: 'El nombre del abogado es obligatorio.',
  }),
  abogado_rut: z.string().min(8, {
    message: 'El RUT del abogado debe ser válido.',
  }),
  abogado_email: z.string().email({
    message: 'Ingresa un correo de contacto válido para el abogado.',
  }),
  mandatario_nombre: z.string().min(2, {
    message: 'El nombre del mandatario es obligatorio.',
  }),
  mandatario_rut: z.string().min(8, {
    message: 'El RUT del mandatario debe ser válido.',
  }),
  mandatario_facultades: z.string().min(10, {
    message: 'Describe las facultades mínimas del mandato.',
  }),
})

interface WorkspaceEscrituraConfigFormProps {
  orgId: string
  isAdmin: boolean
  initialPaymentInfo: {
    razon_social: string
    rut: string
    banco: string
    tipo_cuenta: string
    numero_cuenta: string
    email_transferencia: string | null
  } | null
  initialVariables: {
    'documento.abogado_redactor.nombre'?: string
    'documento.abogado_redactor.rut'?: string
    'documento.abogado_redactor.email'?: string
    'mandato.rectificacion_nombre'?: string
    'mandato.rectificacion_rut'?: string
    'mandato.facultades'?: string
  }
}

export function WorkspaceEscrituraConfigForm({
  orgId,
  isAdmin,
  initialPaymentInfo,
  initialVariables,
}: WorkspaceEscrituraConfigFormProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      razon_social: initialPaymentInfo?.razon_social || '',
      rut: initialPaymentInfo?.rut || '',
      banco: initialPaymentInfo?.banco || '',
      tipo_cuenta: initialPaymentInfo?.tipo_cuenta || 'Corriente',
      numero_cuenta: initialPaymentInfo?.numero_cuenta || '',
      email_transferencia: initialPaymentInfo?.email_transferencia || '',
      abogado_nombre: initialVariables['documento.abogado_redactor.nombre'] || '',
      abogado_rut: initialVariables['documento.abogado_redactor.rut'] || '',
      abogado_email: initialVariables['documento.abogado_redactor.email'] || '',
      mandatario_nombre: initialVariables['mandato.rectificacion_nombre'] || '',
      mandatario_rut: initialVariables['mandato.rectificacion_rut'] || '',
      mandatario_facultades:
        initialVariables['mandato.facultades'] ||
        'El mandato comprende la facultad de suscribir minutas de compraventa, escrituras públicas de rectificación, aclaración o enmienda de los deslindes, cabidas o cualquier otro error formal en la individualización del lote.',
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!isAdmin) {
      toast.error('No tienes permisos de administrador para guardar cambios.')
      return
    }

    setIsPending(true)
    const result = await updateWorkspaceEscrituraConfigAction(orgId, values)
    setIsPending(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Configuración de escrituras y defaults guardada exitosamente.')
      router.refresh()
    }
  }

  return (
    <Card className="shadow-xs border-border/60 bg-card/65 backdrop-blur-xs rounded-xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
          <HugeiconsIcon icon={StampIcon} className="h-5 w-5 text-primary" />
          Datos para escrituras y facturación
        </CardTitle>
        <CardDescription className="text-muted-foreground/80">
          Configura los datos bancarios de tu organización y los defaults legales (abogado redactor
          y mandatario) para la generación automática de minutas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* 1. Datos bancarios */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold border-b pb-2 text-foreground/90">
                1. Datos Bancarios de la Organización
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="razon_social"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Razón Social</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: Inversiones y Desarrollos Loteo Ltda"
                          {...field}
                          disabled={!isAdmin || isPending}
                          className="rounded-lg h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">RUT de la Organización</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: 76.543.210-K"
                          {...field}
                          disabled={!isAdmin || isPending}
                          className="rounded-lg h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="banco"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Banco</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: Banco de Chile"
                          {...field}
                          disabled={!isAdmin || isPending}
                          className="rounded-lg h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tipo_cuenta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Tipo de Cuenta</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={!isAdmin || isPending}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-lg h-10">
                            <SelectValue placeholder="Selecciona el tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Corriente">Corriente</SelectItem>
                          <SelectItem value="Vista">Vista / CuentaRUT</SelectItem>
                          <SelectItem value="Ahorro">Ahorro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="numero_cuenta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Número de Cuenta</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: 1234567890"
                          {...field}
                          disabled={!isAdmin || isPending}
                          className="rounded-lg h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email_transferencia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">
                      Email para confirmación de transferencia
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: pagos@inmobiliaria.cl"
                        {...field}
                        disabled={!isAdmin || isPending}
                        className="rounded-lg h-10"
                      />
                    </FormControl>
                    <FormDescription className="text-[10px]">
                      Opcional. Se utiliza para notificar sobre las transferencias de
                      reservas/ventas.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 2. Abogado redactor */}
            <div className="space-y-4 pt-4 border-t border-border/40">
              <h3 className="text-sm font-semibold border-b pb-2 text-foreground/90 flex items-center gap-1.5">
                <HugeiconsIcon icon={UserAdd01Icon} className="h-4 w-4 text-primary" />
                2. Abogado Redactor por Defecto
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="abogado_nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Nombre Completo</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: María José Contreras Silva"
                          {...field}
                          disabled={!isAdmin || isPending}
                          className="rounded-lg h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="abogado_rut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">RUT</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: 15.234.567-8"
                          {...field}
                          disabled={!isAdmin || isPending}
                          className="rounded-lg h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="abogado_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Email de contacto</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: mjcontreras@abogados.cl"
                          {...field}
                          disabled={!isAdmin || isPending}
                          className="rounded-lg h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* 3. Mandatario por defecto */}
            <div className="space-y-4 pt-4 border-t border-border/40">
              <h3 className="text-sm font-semibold border-b pb-2 text-foreground/90">
                3. Mandatario de la Organización por Defecto
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="mandatario_nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">
                        Nombre del Representante / Mandatario
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: Juan Pablo Pérez Soto"
                          {...field}
                          disabled={!isAdmin || isPending}
                          className="rounded-lg h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mandatario_rut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">RUT del Mandatario</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: 11.222.333-4"
                          {...field}
                          disabled={!isAdmin || isPending}
                          className="rounded-lg h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="mandatario_facultades"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">
                      Facultades y Comparecencia del Mandato
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describa el poder del mandatario para firmar minutas y rectificaciones..."
                        {...field}
                        disabled={!isAdmin || isPending}
                        className="rounded-lg min-h-24"
                      />
                    </FormControl>
                    <FormDescription className="text-[10px]">
                      Cláusula estándar que se insertará para comparecer en nombre del vendedor.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isAdmin && (
              <div className="pt-4 border-t border-border/50 flex justify-end">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg shadow-sm px-6 h-10"
                >
                  {isPending ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Guardando configuración...
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon
                        icon={FloppyDiskIcon}
                        className="mr-2 h-4 w-4 text-primary-foreground"
                      />{' '}
                      Guardar configuración de escrituras
                    </>
                  )}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
