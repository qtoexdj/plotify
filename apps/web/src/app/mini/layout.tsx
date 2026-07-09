'use client'

import NextDynamic from 'next/dynamic'

export { useMiniApp } from '@/lib/miniapp/mini-app-shell'

// `export const dynamic = 'force-dynamic'` (route segment config) no-ops
// aquí: layout y páginas son 100% Client Components sin fetch de datos en
// el servidor, así que Next igual las prerenderiza como shell estático y
// las sirve con Cache-Control de un año (confirmado con `next start` +
// curl -D-: x-nextjs-cache: HIT, s-maxage=31536000). El mecanismo correcto
// para una sección puramente cliente es sacarla del prerenderizado con
// next/dynamic + ssr:false (guía oficial "Single Page Applications"), que
// sí cambia el build output a `ƒ` (Dynamic) — riesgo de shell/JS stale
// dentro del WebView de Telegram documentado en plan.md.
const MiniAppShell = NextDynamic(
  () => import('@/lib/miniapp/mini-app-shell').then((mod) => mod.MiniAppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#17212b] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Cargando aplicación...</p>
      </div>
    ),
  }
)

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return <MiniAppShell>{children}</MiniAppShell>
}
