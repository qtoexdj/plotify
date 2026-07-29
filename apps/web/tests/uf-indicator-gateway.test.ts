import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/indicators/uf/route'

describe('UF indicator same-origin gateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('projects only the current UF value and date from the fixed upstream', async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          uf: { valor: 39_123.45, fecha: '2026-07-21T00:00:00.000Z', nombre: 'UF' },
          dolar: { valor: 999 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', upstreamFetch)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      value: 39_123.45,
      date: '2026-07-21T00:00:00.000Z',
    })
    expect(upstreamFetch).toHaveBeenCalledWith(
      'https://mindicador.cl/api',
      expect.objectContaining({ redirect: 'error' })
    )
  })

  it('fails closed when the upstream payload is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ uf: { valor: 0 } })))

    const response = await GET()

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'UF_UPSTREAM_INVALID' })
  })

  it('keeps the browser on the same origin', () => {
    const overview = readFileSync(
      resolve(process.cwd(), 'src/components/projects/detail/overview-tab.tsx'),
      'utf8'
    )

    expect(overview).toContain("fetch('/api/indicators/uf')")
    expect(overview).not.toContain("fetch('https://mindicador.cl/api')")
  })
})
