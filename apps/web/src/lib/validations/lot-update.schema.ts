import { z } from 'zod'

export const lotUpdateSchema = z.object({
    precio: z.number().positive().optional(),
    valor_reserva: z.number().positive().nullable().optional(),
    m2: z.number().positive().optional(),
    observaciones: z.string().max(1000).optional(),
    vendedor_id: z.string().uuid().nullable().optional(),
    servidumbre_m2: z.number().min(0).optional(),
    servidumbre_ancho_m: z.number().min(0).optional(),
    numero_lote: z.string().max(50).optional(),
}).strict()
// .strict() rechaza cualquier campo que no esté declarado en el schema

export type LotUpdateInput = z.infer<typeof lotUpdateSchema>
