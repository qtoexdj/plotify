import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '260mb',
  },
  async headers() {
    return [
      {
        // La mini app (/mini) es 100% Client Components sin fetch de datos
        // en el servidor, así que `force-dynamic` / next/dynamic({ssr:false})
        // no cambian la clasificación estática de Next y el HTML se sigue
        // sirviendo con Cache-Control de un año (confirmado con
        // `next start` + curl -D-: x-nextjs-cache HIT, s-maxage=31536000).
        // Riesgo documentado en plan.md: el WebView de Telegram podría
        // servir un shell/bundle viejo tras un redeploy. Esta es la única
        // palanca que efectivamente sobreescribe el Cache-Control emitido
        // (next.config `headers()` tiene prioridad sobre el default).
        source: '/mini/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, max-age=0, must-revalidate',
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '8000',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
