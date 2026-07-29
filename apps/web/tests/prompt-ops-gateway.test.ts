import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

test('Prompt Ops is served through authenticated same-origin handlers', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/app/(super-admin)/super-admin/prompt-ops/page.tsx'),
    'utf8'
  )
  expect(page, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').toMatch(/\/api\/prompt-ops/)
  expect(page, 'SAME_ORIGIN_SECURITY_GATEWAY_NOT_IMPLEMENTED').not.toMatch(/PLOTIFY_CHAT_BASE_URL/)
})
