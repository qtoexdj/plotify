import type { Metadata } from 'next'
import { Bricolage_Grotesque, Geist_Mono, Onest, Source_Serif_4 } from 'next/font/google'
import { connection } from 'next/server'
import './globals.css'

const onest = Onest({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

const bricolageGrotesque = Bricolage_Grotesque({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
})

const sourceSerif4 = Source_Serif_4({
  variable: '--font-serif',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Plotify — Gestión de loteos',
  description: 'Plataforma premium para el control de inventario de loteos y comisiones de ventas.',
}

import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // A request-bound render is required for Next.js to propagate the CSP nonce
  // from proxy.ts to every framework script and style tag.
  await connection()

  return (
    <html lang="es" className={onest.variable} suppressHydrationWarning>
      <body
        className={`${bricolageGrotesque.variable} ${sourceSerif4.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
