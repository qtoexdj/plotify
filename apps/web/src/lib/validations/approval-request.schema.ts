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
        cliente_estado_civil: z.string().optional(),
        cliente_ocupacion: z.string().optional(),
        cliente_email: z.string().email('Email inválido').optional().or(z.literal('')),
        cliente_telefono: z.string().optional(),
    }),
})

export type ApprovalRequestInput = z.infer<typeof approvalRequestSchema>

/**
 * Schema simplificado para la solicitud desde el formulario del visor.
 * Solo requiere los datos del cliente — vendor info se resuelve server-side.
 */
export const reservationFormSchema = z.object({
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
    cliente_direccion: z.string().min(5, 'La dirección es obligatoria'),
    cliente_estado_civil: z.string().min(1, 'El estado civil es obligatorio'),
    cliente_ocupacion: z.string().min(1, 'La ocupación es obligatoria'),
    cliente_email: z.string().email('Email inválido'),
    cliente_telefono: z.string().min(8, 'Teléfono inválido'),
    fecha: z.string().min(1, 'La fecha es obligatoria'),
    notaria: z.string().min(3, 'La notaría es obligatoria'),
    valor_reserva: z.coerce.number().min(0, 'El valor debe ser positivo'),
})

export type ReservationFormInput = z.infer<typeof reservationFormSchema>
