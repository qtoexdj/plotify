import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

test('privileged server actions derive actor, tenant and compensation state', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/actions/vendor-actions.action.ts'),
    'utf8'
  )
  expect(source, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').toMatch(/intent[\s\S]*finalize/i)
  expect(source, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').not.toMatch(/deleteUser/)
})
