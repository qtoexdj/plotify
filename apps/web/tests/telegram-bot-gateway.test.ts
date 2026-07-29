import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

test('bot setup uses an admin same-origin gateway without token projection', () => {
  const sources = ['src/app/(super-admin)/super-admin/page.tsx', 'src/app/api']
    .map((path) => {
      try {
        return readFileSync(resolve(process.cwd(), path), 'utf8')
      } catch {
        return ''
      }
    })
    .join('\n')
  expect(sources, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').toMatch(
    /telegram[\s\S]*same.origin/i
  )
  expect(sources, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').not.toMatch(/bot[_-]?token/i)
})
