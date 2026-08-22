import { headers } from 'next/headers'
import { MiniAppShell } from '@/lib/miniapp/mini-app-shell'

export default async function MiniAppLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <>
      {/* Script plano del server: next/script (client component) re-renderiza el
          <script> al hidratar y el navegador oculta el atributo nonce del DOM
          (CSP nonce activo, bug Chromium 1211471) → hydration mismatch.
          Un <script> render-blocking en el layout server no tiene representación
          client-side: el SDK carga antes de hidratar y sin diff de nonce. */}
      <script
        src="https://telegram.org/js/telegram-web-app.js"
        nonce={nonce}
        suppressHydrationWarning
      />
      <MiniAppShell>{children}</MiniAppShell>
    </>
  )
}
