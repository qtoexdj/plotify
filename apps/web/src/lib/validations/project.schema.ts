import { z } from 'zod'

const lotCount = z
  .number()
  .int('PROJECT_LOT_COUNT_LIMIT')
  .min(1, 'PROJECT_LOT_COUNT_LIMIT')
  .max(100, 'PROJECT_LOT_COUNT_LIMIT')
const money = z.number().finite().nonnegative().nullable().optional()

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    region: z.string().trim().min(1).max(120),
    comuna: z.string().trim().min(1).max(120),
    descripcion: z.string().trim().max(2000).optional(),
    total_lotes: lotCount,
    lotPrefix: z.string().max(40).optional(),
    precio: money,
    valor_reserva: money,
  })
  .strict()

export const projectPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    region: z.string().trim().min(1).max(120).optional(),
    comuna: z.string().trim().min(1).max(120).optional(),
    descripcion: z.string().trim().max(2000).nullable().optional(),
    estado: z.enum(['draft', 'activo', 'pausado', 'completado']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'EMPTY_PATCH')

/**
 * Confirmación de borrado. `acknowledgedExport` es literal `true`: un `false`
 * explícito se rechaza igual que su ausencia.
 */
export const projectDeleteSchema = z
  .object({
    confirmedName: z.string().min(1).max(160),
    acknowledgedExport: z.literal(true),
  })
  .strict()

export type CreateProjectInput = z.infer<typeof createProjectSchema>
