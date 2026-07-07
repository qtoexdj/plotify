import { z } from 'zod'
import { validateRut } from './lot-reservation.schema'

/**
 * Schema de validación para solicitud de reserva con aprobación cruzada.
 * Usado tanto por el formulario del visor como por la API del Agente IA.
 */
export const approvalRequestSchema = z.object({
  lot_id: z.string().uuid('ID de lote inválido'),
  organization_id: z.string().uuid('ID de organización inválido'),
  vendor_id: z.string().uuid('ID de vendedor inválido'),
  vendor_name: z.string().min(2, 'El nombre del vendedor es obligatorio'),
  vendor_phone: z.string().min(8, 'Teléfono del vendedor inválido'),
  vendor_platform: z.enum(['telegram', 'whatsapp'], {
    error: 'Plataforma debe ser telegram o whatsapp',
  }),
  payload: z.object({
    cliente_nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
    cliente_run: z
      .string()
      .min(8, 'RUT inválido')
      .transform((val) => val.replace(/\./g, '').replace(/\s/g, ''))
      .refine((val) => /^[0-9]+-[0-9kK]{1}$/.test(val), {
        message: 'Formato inválido. Use 12345678-9',
      })
      .refine(validateRut, {
        message: 'RUT inválido (dígito verificador incorrecto)',
      }),
    valor_reserva: z.coerce.number().min(0, 'El valor debe ser positivo'),
    notaria: z.string().min(3, 'La notaría es obligatoria'),
    fecha_firma: z.string().optional(),
    cliente_direccion: z.string().optional(),
    cliente_region: z.string().optional(),
    cliente_comuna: z.string().optional(),
    cliente_estado_civil: z.string().optional(),
    cliente_nacionalidad: z.string().optional(),
    cliente_ocupacion: z.string().optional(),
    cliente_email: z.string().email('Email inválido').optional().or(z.literal('')),
    cliente_telefono: z.string().optional(),
  }),
})

export type ApprovalRequestInput = z.infer<typeof approvalRequestSchema>

const clienteIdentificacionFields = {
  cliente_nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  cliente_run: z
    .string()
    .min(8, 'RUT inválido')
    .transform((val) => val.replace(/\./g, '').replace(/\s/g, ''))
    .refine((val) => /^[0-9]+-[0-9kK]{1}$/.test(val), {
      message: 'Formato inválido. Use 12345678-9',
    })
    .refine(validateRut, {
      message: 'RUT inválido (dígito verificador incorrecto)',
    }),
}

const clienteContactoFields = {
  cliente_email: z.string().email('Email inválido'),
  cliente_telefono: z.string().min(8, 'Teléfono inválido'),
}

/**
 * Schema liviano para la solicitud de reserva desde el formulario del visor
 * (FR-015): solo identificación + contacto + valor de reserva son
 * obligatorios. Vendor info se resuelve server-side. Sin notaría ni fecha
 * de firma — la reserva es un compromiso comercial, no legal completo.
 */
export const reservationFormSchema = z.object({
  ...clienteIdentificacionFields,
  ...clienteContactoFields,
  cliente_direccion: z.string().optional().or(z.literal('')),
  cliente_region: z.string().optional().or(z.literal('')),
  cliente_comuna: z.string().optional().or(z.literal('')),
  cliente_estado_civil: z.string().optional().or(z.literal('')),
  cliente_nacionalidad: z.string().optional().or(z.literal('')),
  cliente_ocupacion: z.string().optional().or(z.literal('')),
  valor_reserva: z.coerce.number().min(0, 'El valor debe ser positivo'),
})

export type ReservationFormInput = z.infer<typeof reservationFormSchema>

/**
 * Schema estricto para la solicitud de venta (FR-015): legal completo + firma.
 */
export const saleFormSchema = z.object({
  ...clienteIdentificacionFields,
  ...clienteContactoFields,
  cliente_direccion: z.string().min(5, 'La dirección es obligatoria'),
  cliente_region: z.string().min(1, 'La región es obligatoria'),
  cliente_comuna: z.string().min(1, 'La comuna es obligatoria'),
  cliente_estado_civil: z.string().min(1, 'El estado civil es obligatorio'),
  cliente_nacionalidad: z.string().min(1, 'La nacionalidad es obligatoria'),
  cliente_ocupacion: z.string().min(1, 'La ocupación es obligatoria'),
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  notaria: z.string().min(3, 'La notaría es obligatoria'),
  valor_reserva: z.coerce.number().min(0, 'El valor debe ser positivo'),
})

export type SaleFormInput = z.infer<typeof saleFormSchema>
