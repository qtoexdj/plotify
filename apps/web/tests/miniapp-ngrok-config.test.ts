import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Mini App local ngrok gateway', () => {
  it('forwards public /api/v1 requests from Next.js to FastAPI on port 8005', () => {
    const config = readFileSync(resolve(process.cwd(), 'next.config.ts'), 'utf8')

    expect(config).toContain("source: '/api/v1/:path*'")
    expect(config).toContain("destination: `${chatBaseUrl}/api/v1/:path*`")
    expect(config).toContain("allowedDevOrigins: ['*.ngrok-free.app']")
  })
})
