import { z } from 'zod'

// ─── Boundaries Schema ─────────────────────────────────────────────────────

export const officialBoundariesSchema = z.array(
    z.object({
        label: z.string().min(1, 'La orientación es obligatoria'),
        description: z.string().min(1, 'El deslinde es obligatorio'),
        distance: z.number().optional(),
        colinda: z.string().optional(),
        es_servidumbre: z.boolean().optional(),
        neighbors_metadata: z.array(z.object({
            name: z.string(),
            is_partial: z.boolean()
        })).optional(),
    })
).min(1, 'Al menos un deslinde es requerido')

export type OfficialBoundariesInput = z.infer<typeof officialBoundariesSchema>

// ─── Verified Status ────────────────────────────────────────────────────────

export const VerifiedStatusEnum = z.enum([
    'draft',
    'verified_exact',
    'verified_override',
])

export type VerifiedStatusInput = z.infer<typeof VerifiedStatusEnum>

// ─── Save Official Override ─────────────────────────────────────────────────

export const officialOverrideSchema = z.object({
    projectId: z.string().uuid('ID de proyecto inválido'),
    lotId: z.string().uuid('ID de lote inválido'),
    area_official_m2: z.coerce
        .number()
        .positive('La superficie debe ser positiva')
        .optional(),
    servidumbre_m2: z.coerce
        .number()
        .nonnegative('La servidumbre no puede ser negativa')
        .optional(),
    servidumbre_ancho_m: z.coerce
        .number()
        .positive('El ancho debe ser positivo')
        .optional(),
    boundaries_official: officialBoundariesSchema.optional(),
})

export type OfficialOverrideInput = z.infer<typeof officialOverrideSchema>

// ─── Mark Verified ──────────────────────────────────────────────────────────

/**
 * verified_exact: los valores calculados coinciden con los oficiales.
 *   - Requiere: area_official_m2 + boundaries_official
 * 
 * verified_override: el usuario ingresó valores distintos a los calculados.
 *   - Requiere: area_official_m2 + perimeter_official_m + boundaries_official
 */
export const markVerifiedSchema = z.object({
    projectId: z.string().uuid('ID de proyecto inválido'),
    lotId: z.string().uuid('ID de lote inválido'),
    verified_status: z.enum(['verified_exact', 'verified_override'], {
        error: 'Estado de verificación inválido',
    }),
    // Datos que deben existir ya en el lote al momento de verificar
    area_official_m2: z.coerce
        .number()
        .positive('La superficie oficial es obligatoria para verificar'),

    boundaries_official: officialBoundariesSchema,
    // Snapshot de valores calculados para trazabilidad (se envía desde el cliente)
    calculated_snapshot: z.object({
        area_m2: z.number(),
        perimeter_m: z.number(),
    }).optional(),
})

export type MarkVerifiedInput = z.infer<typeof markVerifiedSchema>
