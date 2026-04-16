import { z } from 'zod'

export function validateRut(rut: string): boolean {
    if (!/^[0-9]+-[0-9kK]{1}$/.test(rut)) return false
    const [body, dv] = rut.split('-')
    let suma = 0
    let multiplo = 2
    for (let i = body.length - 1; i >= 0; i--) {
        suma += parseInt(body.charAt(i)) * multiplo
        if (multiplo < 7) multiplo += 1
        else multiplo = 2
    }
    const dvEsperado = 11 - (suma % 11)
    const dvCalc = dvEsperado === 11 ? '0' : dvEsperado === 10 ? 'k' : dvEsperado.toString()
    return dvCalc === dv.toLowerCase()
}

export function formatRut(rut: string): string {
    const cleanRut = rut.replace(/[^0-9kK]/g, '')
    if (cleanRut.length < 2) return cleanRut
    const body = cleanRut.slice(0, -1)
    const dv = cleanRut.slice(-1)
    return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

export const lotReservationSchema = z.object({
    cliente_nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
    cliente_run: z
        .string()
        .min(8, 'RUT inválido')
        .transform((val) => val.replace(/\./g, '').replace(/\s/g, '')) // Remove dots/spaces before validation
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

export type LotReservationInput = z.infer<typeof lotReservationSchema>
