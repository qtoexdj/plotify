import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

test('LLM administration is linked from the super-admin sidebar', () => {
  const sidebar = readFileSync(
    resolve(process.cwd(), 'src/components/super-admin/SuperAdminSidebar.tsx'),
    'utf8'
  )

  expect(sidebar).toContain("href: '/super-admin/llms'")
  expect(sidebar).toContain("label: 'LLMs'")
})

test('LLM administration uses an authenticated same-origin gateway', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/app/(super-admin)/super-admin/llms/page.tsx'),
    'utf8'
  )
  const gateway = readFileSync(resolve(process.cwd(), 'src/app/api/llms/route.ts'), 'utf8')

  expect(page).not.toMatch(
    /PLOTIFY_CHAT_BASE_URL|OPENAI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY/
  )
  expect(gateway).toContain('requireSuperAdminRoute')
  expect(gateway).toContain('microserviceFetch')
})

test('LLM administration exposes a protected model synchronization gateway', () => {
  const gateway = readFileSync(
    resolve(process.cwd(), 'src/app/api/llms/providers/[provider]/models/sync/route.ts'),
    'utf8'
  )

  expect(gateway).toContain('requireSuperAdminRoute')
  expect(gateway).toContain('microserviceFetch')
  expect(gateway).toContain("method: 'POST'")
})
