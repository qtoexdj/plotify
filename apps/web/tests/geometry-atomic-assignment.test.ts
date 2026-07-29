import { describe, expect, it } from 'vitest'
import {
  assignGeometrySchema,
  infrastructureGeometrySchema,
} from '@/lib/validations/geometry-operation.schema'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('canonical geometry operations', () => {
  it('requires existing ids, operation key and expected assignment state', () => {
    const result = assignGeometrySchema.safeParse({
      projectId: crypto.randomUUID(),
      lotId: crypto.randomUUID(),
      geometryId: crypto.randomUUID(),
      idempotencyKey: 'assignment-1',
      expectedGeometryId: null,
    })
    expect(result.success).toBe(true)
    expect(
      assignGeometrySchema.safeParse({ projectId: 'x', lotId: 'y', geometry: {} }).success
    ).toBe(false)
  })

  it('keeps derivations as references to source geometries', () => {
    const sourceGeometryIds = [crypto.randomUUID(), crypto.randomUUID()]
    expect(
      infrastructureGeometrySchema.safeParse({
        projectId: crypto.randomUUID(),
        geometryType: 'road',
        sourceGeometryIds,
        config: { widthM: 6 },
        idempotencyKey: 'road-1',
      }).success
    ).toBe(true)
  })

  it('routes assignment and derivation through the canonical RPCs', () => {
    const service = readFileSync(
      join(process.cwd(), 'src/lib/services/onboarding.service.ts'),
      'utf8'
    )
    expect(service).toContain("rpc('assign_project_geometry'")
    expect(service).toContain("rpc('commit_project_infrastructure'")
    expect(service).not.toContain("from('geometries').delete")
  })
})
