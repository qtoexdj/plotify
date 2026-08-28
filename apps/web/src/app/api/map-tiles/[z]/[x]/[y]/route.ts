import { NextResponse } from 'next/server'

const MAX_ZOOM = 19
const CACHE_SECONDS = 60 * 60 * 24 * 7
const CARTO_STYLES = {
  light: 'light_all',
  dark: 'dark_all',
} as const
const TRANSPARENT_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0,
  0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31, 0, 3, 3, 2, 0, 238,
  126, 218, 145, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
])

interface TileRouteContext {
  params: Promise<{ z: string; x: string; y: string }>
}

type MapTheme = keyof typeof CARTO_STYLES

// La key viaja solo en la llamada servidor→CARTO: el navegador pide siempre
// /api/map-tiles/... y nunca la ve. Sin key el proxy sigue funcionando en
// modo anónimo, que es como operaba antes de que CARTO las exigiera.
function buildUpstreamTileUrl(style: string, z: number, x: number, y: number): string {
  const url = new URL(`https://a.basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png`)
  const apiKey = process.env.CARTO_API_KEY
  if (apiKey) url.searchParams.set('key', apiKey)
  return url.toString()
}

// Una tesela fallida se sirve transparente y el mapa queda en blanco sin avisar,
// así que dejamos rastro en el log. Throttled: un pan dispara decenas de teselas.
let lastUpstreamWarningAt = 0
const WARNING_INTERVAL_MS = 60_000

function warnUpstreamFailure(status: number | 'network') {
  const now = Date.now()
  if (now - lastUpstreamWarningAt < WARNING_INTERVAL_MS) return
  lastUpstreamWarningAt = now

  const hint =
    status === 401 || status === 403
      ? ' Falta o es inválida CARTO_API_KEY: consíguela gratis en https://carto.com/basemaps/apikey/'
      : status === 429
        ? ' Cuota de CARTO agotada (5M teselas/mes en el plan gratuito).'
        : ''
  console.warn(
    `[map-tiles] CARTO no entregó la tesela (${status}); sirviendo transparente, el mapa se verá en blanco.${hint}`
  )
}

function parseTileCoordinate(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const coordinate = Number(value)
  return Number.isSafeInteger(coordinate) ? coordinate : null
}

function transparentTile() {
  return new NextResponse(TRANSPARENT_PNG, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
      'X-Plotify-Tile-Fallback': 'transparent',
    },
  })
}

function parseMapTheme(request: Request): MapTheme | null {
  const theme = new URL(request.url).searchParams.get('theme') ?? 'light'
  return theme === 'light' || theme === 'dark' ? theme : null
}

export async function GET(request: Request, { params }: TileRouteContext) {
  const raw = await params
  const z = parseTileCoordinate(raw.z)
  const x = parseTileCoordinate(raw.x)
  const y = parseTileCoordinate(raw.y)
  const theme = parseMapTheme(request)

  if (z === null || x === null || y === null || z > MAX_ZOOM || theme === null) {
    return NextResponse.json({ error: 'Invalid tile coordinates' }, { status: 400 })
  }

  const dimension = 2 ** z
  if (x >= dimension || y >= dimension) {
    return NextResponse.json({ error: 'Tile coordinates out of range' }, { status: 400 })
  }

  try {
    const cartoStyle = CARTO_STYLES[theme]
    const upstream = await fetch(buildUpstreamTileUrl(cartoStyle, z, x, y), {
      headers: {
        'User-Agent': 'Plotify/1.0 (+https://plotify.cl)',
        Referer: 'https://plotify.cl/',
      },
      next: { revalidate: CACHE_SECONDS },
    })

    if (!upstream.ok) {
      warnUpstreamFailure(upstream.status)
      return transparentTile()
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
      },
    })
  } catch {
    warnUpstreamFailure('network')
    return transparentTile()
  }
}
