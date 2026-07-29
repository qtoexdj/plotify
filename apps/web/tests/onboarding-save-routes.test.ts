import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assignGeometrySchema,
  infrastructureGeometrySchema,
} from '@/lib/validations/geometry-operation.schema'

describe('onboarding canonical geometry routes', () => {
  it('accepts only existing geometry IDs for assignment', () => {
    expect(
      assignGeometrySchema.safeParse({
        projectId: crypto.randomUUID(),
        lotId: crypto.randomUUID(),
        geometryId: crypto.randomUUID(),
        expectedGeometryId: null,
        idempotencyKey: 'assign-1',
      }).success
    ).toBe(true)
    expect(
      assignGeometrySchema.safeParse({
        projectId: crypto.randomUUID(),
        lotId: crypto.randomUUID(),
        geometry: {},
      }).success
    ).toBe(false)
  })

  it('persists infrastructure as source references plus config', () => {
    expect(
      infrastructureGeometrySchema.safeParse({
        projectId: crypto.randomUUID(),
        geometryType: 'road',
        sourceGeometryIds: [crypto.randomUUID()],
        config: { inputMode: 'centerline', widthM: 10 },
        idempotencyKey: 'road-1',
      }).success
    ).toBe(true)
  })

  it('enforces authorization and idempotency across mutation routes', () => {
    for (const file of [
      'save-and-assign/route.ts',
      'save-infrastructure/route.ts',
      'unassign-geometry/route.ts',
      'recalculate-servidumbres/route.ts',
    ]) {
      const source = readFileSync(join(process.cwd(), 'src/app/api/onboarding', file), 'utf8')
      expect(source).toContain('authorizeGeometryOperation')
      expect(source).toContain('claimGeometryOperation')
    }
  })
})
