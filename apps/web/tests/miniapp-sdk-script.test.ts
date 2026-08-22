import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Telegram Mini App SDK bootstrap', () => {
  it('loads the official SDK before Next.js hydrates the client', () => {
    const rootLayout = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8')
    const miniLayout = readFileSync(resolve(process.cwd(), 'src/app/mini/layout.tsx'), 'utf8')

    expect(rootLayout).not.toContain('https://telegram.org/js/telegram-web-app.js')
    expect(miniLayout).toContain('src="https://telegram.org/js/telegram-web-app.js"')
    expect(miniLayout).toContain('nonce={nonce')
  })

  it('usa script plano del server (next/script client component causa hydration mismatch por nonce)', () => {
    const miniLayout = readFileSync(resolve(process.cwd(), 'src/app/mini/layout.tsx'), 'utf8')

    expect(miniLayout).not.toContain("import Script from 'next/script'")
    expect(miniLayout).not.toContain('strategy="beforeInteractive"')
    expect(miniLayout).toMatch(/<script\s+src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"/)
  })

  it('mounts the Mini App shell directly instead of leaving a dynamic fallback mounted', () => {
    const miniLayout = readFileSync(resolve(process.cwd(), 'src/app/mini/layout.tsx'), 'utf8')

    expect(miniLayout).toContain("import { MiniAppShell } from '@/lib/miniapp/mini-app-shell'")
    expect(miniLayout).not.toContain("from 'next/dynamic'")
    expect(miniLayout).not.toContain('Cargando aplicación...')
  })
})
