import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'

const UF_UPSTREAM_URL = 'https://mindicador.cl/api'
const UF_TIMEOUT_MS = 5_000

type UfPayload = {
  value: number
  date: string | null
}

function parseUfPayload(payload: unknown): UfPayload | null {
  if (!payload || typeof payload !== 'object' || !('uf' in payload)) return null

  const uf = payload.uf
  if (!uf || typeof uf !== 'object' || !('valor' in uf)) return null

  const value = Number(uf.valor)
  if (!Number.isFinite(value) || value <= 0) return null

  const date = 'fecha' in uf && typeof uf.fecha === 'string' ? uf.fecha : null
  return { value, date }
}

export async function GET() {
  try {
    const upstream = await fetch(UF_UPSTREAM_URL, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(UF_TIMEOUT_MS),
      next: { revalidate: 1_800 },
    })

    if (!upstream.ok) {
      logger.warn({ code: 'UF_UPSTREAM_ERROR', status: upstream.status }, 'uf_indicator_failed')
      return NextResponse.json({ error: 'UF_UPSTREAM_UNAVAILABLE' }, { status: 502 })
    }

    const payload = parseUfPayload(await upstream.json())
    if (!payload) {
      logger.warn({ code: 'UF_UPSTREAM_INVALID' }, 'uf_indicator_failed')
      return NextResponse.json({ error: 'UF_UPSTREAM_INVALID' }, { status: 502 })
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
    })
  } catch {
    logger.warn({ code: 'UF_UPSTREAM_UNAVAILABLE' }, 'uf_indicator_failed')
    return NextResponse.json({ error: 'UF_UPSTREAM_UNAVAILABLE' }, { status: 502 })
  }
}
