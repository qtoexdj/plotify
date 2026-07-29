import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

import { buildContentSecurityPolicy } from '@/lib/security/content-security-policy'

test('production responses set strict browser security and abuse controls', () => {
  const config = readFileSync(resolve(process.cwd(), 'next.config.ts'), 'utf8')
  const proxy = readFileSync(resolve(process.cwd(), 'src/proxy.ts'), 'utf8')
  const rootLayout = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8')
  for (const header of ['Strict-Transport-Security', 'X-Content-Type-Options'] as const) {
    expect(config, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').toContain(header)
  }
  expect(proxy, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').toContain('Content-Security-Policy')
  expect(rootLayout, 'CSP_NONCE_REQUIRES_DYNAMIC_RENDERING').toContain('await connection()')
  expect(config, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').toMatch(
    /frame-ancestors|X-Frame-Options/
  )
})

test('nonce CSP permits Next hydration without weakening production scripts', () => {
  const nonce = 'test-request-nonce'
  const policy = buildContentSecurityPolicy({ nonce, isDevelopment: false })

  expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`)
  expect(policy).toContain("style-src 'self' 'unsafe-inline'")
  expect(policy).toContain("style-src-attr 'unsafe-inline'")
  expect(policy).toContain('https://telegram.org')
  expect(policy).not.toContain("'unsafe-eval'")
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
})

test('development CSP permits the Next.js development runtime only', () => {
  const policy = buildContentSecurityPolicy({ nonce: 'dev-nonce', isDevelopment: true })

  expect(policy).toMatch(/script-src[^;]*'unsafe-eval'/)
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
})
