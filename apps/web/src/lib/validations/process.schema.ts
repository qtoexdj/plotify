import { z } from 'zod'

export const ProcessStageEnum = z.enum([
  'espera_firma_reserva',
  'reserva_firmada',
  'espera_firma_escritura',
  'escritura_firmada',
])

export type ProcessStage = z.infer<typeof ProcessStageEnum>

export const updateStageSchema = z.object({
  projectId: z.string().uuid(),
  lotId: z.string().uuid(),
  newStage: ProcessStageEnum,
})
