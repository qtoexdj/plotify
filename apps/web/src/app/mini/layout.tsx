'use client'

import { MiniAppShell } from '@/lib/miniapp/mini-app-shell'

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return <MiniAppShell>{children}</MiniAppShell>
}
