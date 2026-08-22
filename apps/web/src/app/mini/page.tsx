'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { useTelegram } from '@/lib/miniapp/telegram'
import { miniAppUrl } from '@/lib/miniapp/routes'

export default function MiniAppRouterPage() {
  const router = useRouter()
  const { session, loading, error } = useMiniApp()
  const { startParam } = useTelegram()
  const [roleError, setRoleError] = useState<string | null>(null)

  useEffect(() => {
    if (loading || error || !session) return

    const role = session.role.toLowerCase()
    const orgId = session.user.org_id

    // El backend (resolve_miniapp_user) solo emite sesiones con role
    // "admin" o "vendor" — nunca el valor crudo "user" de organization_members.
    // Este else es defensivo ante un rol futuro no contemplado: evita dejar
    // el spinner girando para siempre.
    const redirectDefaultRole = () => {
      if (role === 'admin' || role === 'superadmin') {
        router.replace(miniAppUrl('/mini/admin', orgId))
      } else if (role === 'vendor' || role === 'vendedor') {
        router.replace(miniAppUrl('/mini/vendedor', orgId))
      } else {
        console.warn(`Rol no reconocido para la mini app: ${session.role}`)
        setRoleError(`Rol no soportado por la mini app: ${session.role}`)
      }
    }

    // Lógica de parseo de start_param de Telegram para deep linking
    if (startParam && startParam.startsWith('lot_')) {
      const lotId = startParam.replace('lot_', '')

      const resolveLotAndRedirect = async () => {
        try {
          const res = await fetch(`/api/miniapp/lotes/${lotId}`, {
            headers: {
              Authorization: `Bearer ${session.token}`,
            },
          })
          if (res.ok) {
            const lot = await res.json()
            router.replace(
              miniAppUrl('/mini/mapa', orgId, {
                project_id: lot.project_id,
                lot_id: lotId,
              })
            )
            return
          }
        } catch (err) {
          console.error('Error resolviendo deep link para lote:', err)
        }

        // Fallback de rol normal si falla la resolución
        redirectDefaultRole()
      }

      resolveLotAndRedirect()
      return
    }

    redirectDefaultRole()
  }, [session, loading, error, router, startParam])

  if (roleError) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#121212] p-6 text-center text-white">
        <div className="rounded-2xl bg-rose-950/40 border border-rose-800/30 p-4 text-rose-400 mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-8 w-8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h2 className="text-base font-bold">Error de Acceso</h2>
        <p className="mt-2 text-xs text-zinc-400 max-w-xs">{roleError}</p>
      </div>
    )
  }

  if (loading || !session) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#121212] text-white">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-2xl">
          <div className="absolute inset-0 rounded-2xl border border-emerald-500/30 animate-ping opacity-25"></div>
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
        </div>
        <p className="mt-4 text-xs font-medium text-zinc-400">Iniciando Plotify Mini App...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#121212] p-6 text-center text-white">
        <div className="rounded-2xl bg-rose-950/40 border border-rose-800/30 p-4 text-rose-400 mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-8 w-8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h2 className="text-base font-bold">Error de Acceso</h2>
        <p className="mt-2 text-xs text-zinc-400 max-w-xs">{error}</p>
      </div>
    )
  }

  const roleText =
    session.role === 'admin' || session.role === 'superadmin' ? 'Administrador' : 'Vendedor'

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#121212] text-white">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-2xl">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
      </div>
      <p className="mt-4 text-xs font-semibold text-white">Bienvenido, {session.user.nombre}</p>
      <p className="text-[11px] text-zinc-400 mt-1">Accediendo a {session.user.org_nombre} ({roleText})...</p>
    </div>
  )
}
