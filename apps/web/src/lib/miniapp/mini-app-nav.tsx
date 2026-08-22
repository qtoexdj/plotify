'use client'

import React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { useTelegram } from '@/lib/miniapp/telegram'
import { miniAppOrgId, miniAppUrl } from '@/lib/miniapp/routes'

interface NavItem {
  key: string
  label: string
  href: string
  icon: (active: boolean) => React.ReactNode
  badge?: number
}

export function MiniAppNav() {
  let pathname = ''
  try {
    pathname = usePathname() || ''
  } catch {
    pathname = ''
  }

  const router = useRouter()
  let searchParams: URLSearchParams
  try {
    searchParams = useSearchParams() || new URLSearchParams()
  } catch {
    searchParams = new URLSearchParams()
  }
  const { session, orgId } = useMiniApp()
  const { haptic } = useTelegram()

  // No renderizar barra de navegación en onboarding de vinculación
  if (pathname.includes('/mini/vincular')) {
    return null
  }

  const currentOrg = orgId || miniAppOrgId(searchParams) || session?.user?.org_id || ''
  const role = session?.role?.toLowerCase() || ''
  const isAdmin = role === 'admin' || role === 'superadmin'

  const navigateTo = (href: string) => {
    haptic.impact('light')
    const targetUrl = currentOrg ? miniAppUrl(href, currentOrg) : href
    router.push(targetUrl)
  }

  const vendorNavItems: NavItem[] = [
    {
      key: 'mapa',
      label: 'Mapa',
      href: '/mini/mapa',
      icon: (active) => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={active ? 2.5 : 1.7}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689A1.125 1.125 0 0 0 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
          />
        </svg>
      ),
    },
    {
      key: 'ventas',
      label: 'Mis Ventas',
      href: '/mini/ventas',
      icon: (active) => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={active ? 2.5 : 1.7}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6H2.25m0 0v-.75c0-.414.336-.75.75-.75h.75m0 0h16.5m0 0h.75c.414 0 .75.336.75.75V6m0 0v.75a.75.75 0 0 1-.75.75H21m-1.5 6.75V12a.75.75 0 0 1 .75-.75h.75m0 0v.75c0 .414-.336.75-.75.75H21M3.75 12v.75a.75.75 0 0 1-.75.75H2.25m0 0v-.75c0-.414.336-.75.75-.75h.75m15-1.5v.75a.75.75 0 0 1-.75.75h-.75m0 0v-.75c0-.414.336-.75.75-.75h.75M9 10.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
          />
        </svg>
      ),
    },
    {
      key: 'reserva',
      label: 'Reservar',
      href: '/mini/reserva',
      icon: (active) => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={active ? 2.5 : 1.7}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      ),
    },
    {
      key: 'documentos',
      label: 'Minutas',
      href: '/mini/documentos',
      icon: (active) => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={active ? 2.5 : 1.7}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
          />
        </svg>
      ),
    },
  ]

  const adminNavItems: NavItem[] = [
    {
      key: 'bandeja',
      label: 'Decisiones',
      href: '/mini/bandeja',
      icon: (active) => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={active ? 2.5 : 1.7}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
          />
        </svg>
      ),
    },
    {
      key: 'mapa',
      label: 'Masterplan',
      href: '/mini/mapa',
      icon: (active) => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={active ? 2.5 : 1.7}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689A1.125 1.125 0 0 0 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
          />
        </svg>
      ),
    },
    {
      key: 'ventas',
      label: 'Ventas',
      href: '/mini/ventas',
      icon: (active) => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={active ? 2.5 : 1.7}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
          />
        </svg>
      ),
    },
    {
      key: 'documentos',
      label: 'Expedientes',
      href: '/mini/documentos',
      icon: (active) => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={active ? 2.5 : 1.7}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
          />
        </svg>
      ),
    },
  ]

  const items = isAdmin ? adminNavItems : vendorNavItems

  return (
    <nav aria-label="Navegación principal" className="fixed bottom-0 left-0 right-0 z-30 bg-[#121212]/95 backdrop-blur-xl border-t border-white/[0.08] px-2 py-1.5 safe-area-pb shadow-2xl">
      <div className="mx-auto flex max-w-md items-center justify-around">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <button
              key={item.key}
              onClick={() => navigateTo(item.href)}
              className={`relative flex flex-1 flex-col items-center justify-center py-1.5 px-1 transition-all duration-200 active:scale-90 ${
                isActive
                  ? isAdmin
                    ? 'text-rose-400 font-semibold'
                    : 'text-emerald-400 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {/* Indicador superior de pestaña activa */}
              {isActive && (
                <span
                  className={`absolute top-0 h-0.5 w-7 rounded-full transition-all ${
                    isAdmin ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  }`}
                />
              )}

              <div className="relative mt-0.5">
                {item.icon(isActive)}
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white shadow-sm">
                    {item.badge}
                  </span>
                )}
              </div>

              <span className="text-[10px] tracking-tight mt-1 truncate max-w-[70px]">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
