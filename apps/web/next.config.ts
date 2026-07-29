import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  distDir: process.env.PLOTIFY_E2E_DIST_DIR || '.next',
  // La Mini App de desarrollo se abre desde Telegram mediante un túnel
  // ngrok. Next.js bloquea por defecto sus recursos internos cuando el
  // hostname del navegador no coincide con el dev server.
  allowedDevOrigins: ['*.ngrok-free.app'],
  experimental: {
    proxyClientMaxBodySize: '260mb',
  },
  async rewrites() {
    return [
      {
        // Un único túnel ngrok apunta a Next.js (:3000). Los webhooks y
        // demás rutas públicas de FastAPI conservan su URL /api/v1/* y se
        // reenvían internamente al API local (:8005).
        source: '/api/v1/:path*',
        destination: 'http://127.0.0.1:8005/api/v1/:path*',
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
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
}

export default nextConfig
