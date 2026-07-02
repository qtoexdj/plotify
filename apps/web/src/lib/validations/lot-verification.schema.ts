import { z } from 'zod'

// ─── Boundaries Schema ─────────────────────────────────────────────────────

export const officialBoundariesSchema = z
  .array(
    z.object({
      label: z.string().min(1, 'La orientación es obligatoria'),
      description: z.string().min(1, 'El deslinde es obligatorio'),
      distance: z.number().optional(),
      colinda: z.string().optional(),
      es_servidumbre: z.boolean().optional(),
      neighbors_metadata: z
        .array(
          z.object({
            name: z.string(),
            is_partial: z.boolean(),
          })
        )
        .optional(),
    })
  )
  .min(1, 'Al menos un deslinde es requerido')

export type OfficialBoundariesInput = z.infer<typeof officialBoundariesSchema>

// ─── Verified Status ────────────────────────────────────────────────────────

export const VerifiedStatusEnum = z.enum(['draft', 'verified_exact', 'verified_override'])

export type VerifiedStatusInput = z.infer<typeof VerifiedStatusEnum>

// ─── Save Official Override ─────────────────────────────────────────────────

export const officialOverrideSchema = z.object({
  projectId: z.string().uuid('ID de proyecto inválido'),
  lotId: z.string().uuid('ID de lote inválido'),
  area_official_m2: z.coerce.number().positive('La superficie debe ser positiva').optional(),
  perimeter_official_m: z.coerce.number().positive('El perímetro debe ser positivo').optional(),
  servidumbre_m2: z.coerce.number().nonnegative('La servidumbre no puede ser negativa').optional(),
  servidumbre_ancho_m: z.coerce.number().positive('El ancho debe ser positivo').optional(),
  boundaries_official: officialBoundariesSchema.optional(),
})

export type OfficialOverrideInput = z.infer<typeof officialOverrideSchema>

// ─── Save + Verify (unified) ────────────────────────────────────────────────

/**
 * Une el guardado de valores oficiales y la verificación en una sola
 * escritura atómica: antes "Guardar" y "Verificar" eran acciones separadas
 * que podían pisarse entre sí (Guardar revertía a draft, Verificar no
 * persistía servidumbre). Ahora ambas cosas ocurren en el mismo update.
 */
export const saveAndVerifySchema = z.object({
  projectId: z.string().uuid('ID de proyecto inválido'),
  lotId: z.string().uuid('ID de lote inválido'),
  verified_status: z.enum(['verified_exact', 'verified_override'], {
    error: 'Estado de verificación inválido',
  }),
  area_official_m2: z.coerce
    .number()
    .positive('La superficie oficial es obligatoria para verificar'),
  perimeter_official_m: z.coerce
    .number()
    .positive('El perímetro oficial es obligatorio para verificar'),
  servidumbre_m2: z.coerce.number().nonnegative('La servidumbre no puede ser negativa').optional(),
  servidumbre_ancho_m: z.coerce.number().positive('El ancho debe ser positivo').optional(),
  boundaries_official: officialBoundariesSchema,
  calculated_snapshot: z
    .object({
      area_m2: z.number(),
      perimeter_m: z.number(),
    })
    .optional(),
})

export type SaveAndVerifyInput = z.infer<typeof saveAndVerifySchema>
