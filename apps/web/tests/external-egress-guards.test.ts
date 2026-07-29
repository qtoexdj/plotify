import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

test('browser code uses guarded same-origin egress only', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/lib/services/microservice.client.ts'),
    'utf8'
  )
  expect(source, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').toMatch(/same.origin/i)
  expect(source, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').not.toMatch(
    /NEXT_PUBLIC.*BASE_URL/
  )
})
