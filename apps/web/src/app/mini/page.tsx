'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMiniApp } from './layout'
import { useTelegram } from '@/lib/miniapp/telegram'

export default function MiniAppRouterPage() {
  const router = useRouter()
  const { session, loading, error } = useMiniApp()
  const { startParam } = useTelegram()

  useEffect(() => {
    if (loading || error || !session) return

    const role = session.role.toLowerCase()
    const orgId = session.user.org_id

    const redirectDefaultRole = () => {
      if (role === 'admin' || role === 'superadmin') {
        router.replace(`/mini/admin?org_id=${orgId}`)
      } else if (role === 'vendor' || role === 'vendedor') {
        router.replace(`/mini/vendedor?org_id=${orgId}`)
      } else {
        console.warn(`Rol no reconocido para la mini app: ${session.role}`)
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
            router.replace(`/mini/mapa?project_id=${lot.project_id}&lot_id=${lotId}`)
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

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#17212b] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Verificando sesión segura...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#17212b] p-6 text-center text-white">
        <div className="rounded-full bg-red-950/50 p-4 text-red-500 mb-4">
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
        <h2 className="text-lg font-semibold">Error de Acceso</h2>
        <p className="mt-2 text-sm text-gray-400 max-w-xs">{error}</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#17212b] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Iniciando Mini App...</p>
      </div>
    )
  }

  const roleText =
    session.role === 'admin' || session.role === 'superadmin' ? 'Administrador' : 'Vendedor'

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#17212b] text-white">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
      <p className="mt-4 text-sm text-gray-400">Bienvenido {session.user.nombre}.</p>
      <p className="text-xs text-gray-500 mt-1">Redirigiendo al panel de {roleText}...</p>
    </div>
  )
}
