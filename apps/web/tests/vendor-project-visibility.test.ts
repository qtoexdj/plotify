import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MARKER = 'VENDOR_PROJECT_VISIBILITY_NOT_IMPLEMENTED'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('vendor project visibility contract (RED)', () => {
  it('uses active vendor_projects as the sole inventory authority', () => {
    const projects = source('src/lib/services/projects.service.ts')
    const dashboard = source('src/lib/services/dashboard.service.ts')
    const viewer = source('src/lib/services/viewer.service.ts')
    const miniapp = source('../api/api/v1/endpoints/miniapp.py')
    const combined = `${projects}\n${dashboard}\n${viewer}\n${miniapp}`

    expect(combined, MARKER).toContain('vendor_projects')
    expect(combined, MARKER).toMatch(/active/)
    expect(projects, MARKER).not.toMatch(/inferidos desde el[\s\S]*vendedor_id/i)
    expect(miniapp, MARKER).not.toMatch(
      /\.eq\(["']lots\.vendedor_id["']|lots!inner\([^)]*vendedor_id/i
    )
  })

  it('keeps lots.vendedor_id limited to own-sensitive data', () => {
    const route = source('src/app/api/projects/[id]/lots/route.ts')
    const services = `${source('src/lib/services/lots.service.ts')}\n${source(
      'src/lib/services/viewer.service.ts'
    )}`

    expect(route, MARKER).toContain('vendor_projects')
    expect(services, MARKER).toMatch(/vendedor_id/)
    expect(services, MARKER).not.toMatch(
      /\.from\(["']projects["']\)[\s\S]{0,400}\.eq\(["']vendedor_id["']/i
    )
  })
})
