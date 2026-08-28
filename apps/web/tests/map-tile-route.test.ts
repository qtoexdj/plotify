import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/map-tiles/[z]/[x]/[y]/route'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function okTileFetchMock() {
  return vi.fn().mockResolvedValue(
    new Response(Uint8Array.from([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    })
  )
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  return fetchMock.mock.calls[0][0] as string
}

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

  it('adjunta CARTO_API_KEY a la petición upstream cuando está configurada', async () => {
    vi.stubEnv('CARTO_API_KEY', 'clave-de-prueba')
    const fetchMock = okTileFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(new Request('http://localhost/api/map-tiles/3/2/1?theme=light'), {
      params: Promise.resolve({ z: '3', x: '2', y: '1' }),
    })

    expect(new URL(requestedUrl(fetchMock)).searchParams.get('key')).toBe('clave-de-prueba')
    // La clave se queda en el servidor: ni el cuerpo ni las cabeceras la exponen.
    expect(JSON.stringify([...response.headers])).not.toContain('clave-de-prueba')
  })

  it('sigue sirviendo teselas en modo anónimo cuando no hay CARTO_API_KEY', async () => {
    vi.stubEnv('CARTO_API_KEY', '')
    const fetchMock = okTileFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(new Request('http://localhost/api/map-tiles/0/0/0?theme=light'), {
      params: Promise.resolve({ z: '0', x: '0', y: '0' }),
    })

    expect(response.status).toBe(200)
    expect(requestedUrl(fetchMock)).toBe('https://a.basemaps.cartocdn.com/light_all/0/0/0.png')
  })

  it('avisa en el log cuando CARTO rechaza la clave, en vez de fallar en silencio', async () => {
    // Módulo fresco: el aviso está throttled con estado a nivel de módulo.
    vi.resetModules()
    const { GET: freshGET } = await import('@/app/api/map-tiles/[z]/[x]/[y]/route')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))

    const response = await freshGET(
      new Request('http://localhost/api/map-tiles/0/0/0?theme=light'),
      { params: Promise.resolve({ z: '0', x: '0', y: '0' }) }
    )

    expect(response.headers.get('x-plotify-tile-fallback')).toBe('transparent')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CARTO_API_KEY'))
  })

  it('rechaza temas de mapa desconocidos', async () => {
    const response = await GET(new Request('http://localhost/api/map-tiles/0/0/0?theme=unknown'), {
      params: Promise.resolve({ z: '0', x: '0', y: '0' }),
    })

    expect(response.status).toBe(400)
  })
})
