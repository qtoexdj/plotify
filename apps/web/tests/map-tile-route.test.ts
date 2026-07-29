import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/map-tiles/[z]/[x]/[y]/route'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/map-tiles/[z]/[x]/[y]', () => {
  it('rechaza coordenadas fuera del rango de la tesela', async () => {
    const response = await GET(new Request('http://localhost/api/map-tiles/2/4/0'), {
      params: Promise.resolve({ z: '2', x: '4', y: '0' }),
    })

    expect(response.status).toBe(400)
  })

  it('devuelve una tesela transparente cuando el proveedor no responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))

    const response = await GET(new Request('http://localhost/api/map-tiles/0/0/0?theme=light'), {
      params: Promise.resolve({ z: '0', x: '0', y: '0' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('x-plotify-tile-fallback')).toBe('transparent')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it.each([
    ['light', 'light_all'],
    ['dark', 'dark_all'],
  ])('sirve el tema %s desde el basemap Carto correspondiente', async (theme, cartoStyle) => {
    const upstreamBody = Uint8Array.from([1, 2, 3])
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(upstreamBody, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(new Request(`http://localhost/api/map-tiles/0/0/0?theme=${theme}`), {
      params: Promise.resolve({ z: '0', x: '0', y: '0' }),
    })

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      `https://a.basemaps.cartocdn.com/${cartoStyle}/0/0/0.png`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('Plotify'),
        }),
      })
    )
  })

  it('rechaza temas de mapa desconocidos', async () => {
    const response = await GET(new Request('http://localhost/api/map-tiles/0/0/0?theme=unknown'), {
      params: Promise.resolve({ z: '0', x: '0', y: '0' }),
    })

    expect(response.status).toBe(400)
  })
})
