'use client'

import React from 'react'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'

export function MiniAppHeader({
  title,
  subtitle,
  rightElement,
}: {
  title?: string
  subtitle?: string
  rightElement?: React.ReactNode
}) {
  const { session } = useMiniApp()
  const isAdmin = session?.role?.toLowerCase() === 'admin' || session?.role?.toLowerCase() === 'superadmin'

  return (
    <header className="sticky top-0 z-20 bg-[#121212]/95 backdrop-blur-md border-b border-white/[0.08] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Plotify Mark Isotipo */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.08] shadow-inner">
            <svg viewBox="0 0 54 48" className="h-5 w-5" fill="none">
              <path
                fill="#16A34A"
                d="M37.5 33.9c-.7.4-1.3.7-2 .1-3.2-1.9-5.7-1.7-9.1-3.6-2.4-1.4-4.9-2.8-7.3-4.2-3-1.8-6.1-3.5-9.1-5.3-1.3-.7-2.5-1.5-3.8-2.2-.6-.4-.6-.5 0-.9 4.4-2.6 8.7-5.1 13.1-7.7 2.3-1.4 4.7-2.7 7-4.1.5-.3.8-.3 1.3 0 4 2.4 8 4.7 12 7.1 2.7 1.6 5.4 3.1 8.1 4.7.7.4.7.5 0 .9-2.3 1.4-4.7 2.7-7 4.1-2.9 1.7-5.9 3.4-8.8 5.1-.8.5-1.6.9-2.4 1.4z"
                transform="scale(0.8) translate(-10, -5)"
              />
              <path
                fill="#ffffff"
                opacity="0.9"
                d="M28.6 29.8c1.9 1.1 3.8 2.2 5.6 3.3.6.4 1 .4 1.7 0 5.6-3.3 11.3-6.6 16.9-9.9.1-.1.3-.1.3-.3-.3-.2-.6-.4-.9-.6-5.5-3.2-11-6.4-16.5-9.7-.5-.3-.8-.3-1.3 0-5.1 3-10.2 6-15.3 9-.8.4-1.5.8-2.3 1.4 3.9 2.3 7.8 4.6 11.8 6.9z"
                transform="scale(0.8) translate(-10, -5)"
              />
            </svg>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold text-white tracking-tight truncate">
                {title || session?.user.org_nombre || 'Plotify'}
              </h1>
              {session?.role && (
                <span
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    isAdmin
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-700/30'
                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/30'
                  }`}
                >
                  {isAdmin ? 'Admin' : 'Vendedor'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 truncate">
              {subtitle || (session ? `${session.user.nombre}` : 'Cargando...')}
            </p>
          </div>
        </div>

        {rightElement && <div className="shrink-0 flex items-center gap-2">{rightElement}</div>}
      </div>
    </header>
  )
}
