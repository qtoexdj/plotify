import { z } from 'zod'

const uuid = z.string().uuid()
const operationKey = z.string().trim().min(1).max(128)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)

export const assignGeometrySchema = z
  .object({
    projectId: uuid,
    lotId: uuid,
    geometryId: uuid.nullable(),
    expectedGeometryId: uuid.nullable(),
    idempotencyKey: operationKey,
  })
  .strict()

export const infrastructureGeometrySchema = z
  .object({
    projectId: uuid,
    geometryType: z.enum(['road', 'common_area']),
    sourceGeometryIds: z.array(uuid).min(1).max(100),
    config: z.record(z.string(), z.unknown()).default({}),
    idempotencyKey: operationKey,
  })
  .strict()

export const geometryReplacementSchema = z
  .object({
    expectedSourceSha256: sha256,
    confirmReplacement: z.literal(true),
    idempotencyKey: operationKey,
  })
  .strict()

export const geometryImportMetadataSchema = z
  .object({
    idempotencyKey: operationKey,
    expectedSourceSha256: sha256.optional(),
    confirmReplacement: z.boolean().optional(),
  })
  .strict()
