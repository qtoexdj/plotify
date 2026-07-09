import { z } from 'zod'
import { validateRut, formatRut } from '@/lib/validations/lot-reservation.schema'

export { validateRut, formatRut }

const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/

export const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Transferencia' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'check', label: 'Cheque' },
  { value: 'other', label: 'Otro' },
] as const

/**
 * Espejo del contrato POST /api/v1/miniapp/reservas (MiniappReservationRequest
 * en apps/api/api/v1/endpoints/miniapp.py): mismos límites, validados también
 * en el servidor porque la validación de cliente es solo UX.
 */
export const reservaMiniappSchema = z.object({
  lot_id: z.string().min(1),
  buyer_name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  buyer_rut: z
    .string()
    .min(7, 'RUT inválido')
    .transform((val) => val.replace(/\./g, '').replace(/\s/g, ''))
    .refine((val) => /^[0-9]+-[0-9kK]{1}$/.test(val), {
      message: 'Formato inválido. Use 12345678-9',
    })
    .refine(validateRut, {
      message: 'RUT inválido (dígito verificador incorrecto)',
    }),
  buyer_email: z.string().trim().email('Email inválido'),
  buyer_phone: z.string().trim().regex(PHONE_REGEX, 'Teléfono inválido. Use formato +56912345678'),
  payment_method: z.enum(['transfer', 'cash', 'check', 'other'], {
    error: 'Selecciona un método de pago',
  }),
  payment_evidence_url: z.string().trim().url('URL inválida').optional().or(z.literal('')),
  observation: z.string().trim().max(500, 'Máximo 500 caracteres').optional().or(z.literal('')),
})

export type ReservaMiniappInput = z.infer<typeof reservaMiniappSchema>
