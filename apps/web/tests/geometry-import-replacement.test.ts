import { describe, expect, it } from 'vitest'
import { geometryReplacementSchema } from '@/lib/validations/geometry-operation.schema'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('geometry import replacement', () => {
  it('requires explicit confirmation, old hash and operation identity', () => {
    const base = {
      expectedSourceSha256: 'a'.repeat(64),
      confirmReplacement: true,
      idempotencyKey: 'replace-1',
    }
    expect(geometryReplacementSchema.safeParse(base).success).toBe(true)
    expect(
      geometryReplacementSchema.safeParse({ ...base, confirmReplacement: false }).success
    ).toBe(false)
    expect(
      geometryReplacementSchema.safeParse({ ...base, expectedSourceSha256: 'bad' }).success
    ).toBe(false)
  })

  it('uses the atomic supersede RPC and preserves content-addressed sources', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/projects/[id]/geometry-imports/route.ts'),
      'utf8'
    )
    expect(route).toContain("'supersede_geometry_import'")
    expect(route).toContain('expectedSourceSha256')
    expect(route).toContain('geometry/${sourceSha256}')
  })
})
