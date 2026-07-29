import { headers } from 'next/headers'
import Script from 'next/script'
import { MiniAppShell } from '@/lib/miniapp/mini-app-shell'

export default async function MiniAppLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
        nonce={nonce}
      />
      <MiniAppShell>{children}</MiniAppShell>
    </>
  )
}
