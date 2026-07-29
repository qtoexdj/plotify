import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('canonical geometry upload cutover', () => {
  it('uses only the URL-scoped canonical route', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/projects/GeometryUploadPanel.tsx'),
      'utf8'
    )
    expect(source).toContain('/api/projects/${projectId}/geometry-imports')
    expect(source).not.toContain('/api/uploads/geometry')
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/projects/[id]/geometry-imports/route.ts'),
      'utf8'
    )
    expect(route.indexOf('resolve_feature_rollout')).toBeLessThan(
      route.indexOf('request.formData()')
    )
    expect(route).toContain("return fail(503, 'FEATURE_DISABLED')")
  })
})
