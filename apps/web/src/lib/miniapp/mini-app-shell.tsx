'use client'

import React, { createContext, useContext, useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTelegram } from '@/lib/miniapp/telegram'
import {
  getMiniappSession,
  setMiniappSession,
  clearMiniappSession,
  isSessionExpired,
  MiniappSession,
} from '@/lib/miniapp/session'
import { miniAppOrgId, miniAppUrl, resolveMiniAppOrgId } from '@/lib/miniapp/routes'

import { MiniAppNav } from '@/lib/miniapp/mini-app-nav'

const SESSION_REQUEST_TIMEOUT_MS = 15_000

interface MiniAppContextType {
  session: MiniappSession | null
  loading: boolean
  error: string | null
  orgId: string | null
  isTelegram: boolean
}

const MiniAppContext = createContext<MiniAppContextType>({
  session: null,
  loading: true,
  error: null,
  orgId: null,
  isTelegram: false,
})

export const useMiniApp = () => useContext(MiniAppContext)

function MiniAppContent({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const routerRef = useRef(router)
  const searchParams = useSearchParams()

  useEffect(() => {
    routerRef.current = router
  }, [router])

  const { isAvailable, webApp, initData } = useTelegram()
  const [session, setSession] = useState<MiniappSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const queryOrgId = miniAppOrgId(searchParams)
  const bypass = searchParams.get('bypass') === 'true'
  const startParam = webApp?.initDataUnsafe
    ? (webApp.initDataUnsafe as { start_param?: string }).start_param
    : null
  const telegramChatId = webApp?.initDataUnsafe?.user?.id || ''
  // start_param puede ser el org_id de la org O un deep link de lote (lot_<id>).
  // En este último caso nunca debe usarse como org: la sesión guardada provee la org.
  const orgId = resolveMiniAppOrgId(queryOrgId, startParam || null)

  useEffect(() => {
    // Recuperar sesión persistida
    const savedSession = getMiniappSession()
    const targetOrgId = orgId || savedSession?.user.org_id
    if (!targetOrgId) {
      Promise.resolve().then(() => {
        setError('Organización no provista (?org=...)')
        setLoading(false)
      })
      return
    }

    async function authenticate() {
      try {
        setLoading(true)
        setError(null)

        // Si ya hay sesión válida para el mismo targetOrgId, cargarla de inmediato
        if (
          savedSession &&
          !isSessionExpired(savedSession.token) &&
          savedSession.user.org_id === targetOrgId
        ) {
          setSession(savedSession)
          setLoading(false)
          return
        }

        // El script oficial puede crear window.Telegram fuera del cliente de
        // Telegram. El bypass de desarrollo debe resolverse antes de usar esa
        // presencia como señal de disponibilidad real.
        if (bypass || (process.env.NODE_ENV === 'development' && !initData)) {
          const devSession: MiniappSession = {
            token: 'jwt-mock-dev-token',
            role: 'admin',
            user: {
              id: '00000000-0000-4000-8000-000000000777',
              nombre: 'Vendedor Desarrollo (Bypass)',
              org_id: targetOrgId as string,
              org_nombre: 'Plotify Local Dev',
            },
          }
          setMiniappSession(devSession)
          setSession(devSession)
          setLoading(false)
          return
        }

        // Si no estamos en Telegram, no existe initData verificable.
        if (!isAvailable) {
          setError('Esta aplicación solo está disponible dentro de Telegram.')
          setLoading(false)
          return
        }

        if (!initData) {
          setError(
            'Telegram no entregó los datos de inicio. Cierra esta ventana y vuelve a abrir la Mini App desde el bot.'
          )
          setLoading(false)
          return
        }

        // Autenticar llamando al API proxy de Next.js
        const abortController = new AbortController()
        const timeoutId = window.setTimeout(
          () => abortController.abort(),
          SESSION_REQUEST_TIMEOUT_MS
        )
        const res = await fetch('/api/miniapp/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: targetOrgId,
            init_data: initData,
          }),
          signal: abortController.signal,
        }).finally(() => window.clearTimeout(timeoutId))

        if (res.status === 403) {
          const detail = await res.json()
          if (detail.error === 'not_linked') {
            clearMiniappSession()
            setLoading(false)
            routerRef.current.push(
              miniAppUrl('/mini/vincular', targetOrgId as string, {
                chat_id: String(telegramChatId),
              })
            )
            return
          } else if (detail.error === 'not_member') {
            setError('Acceso denegado: No tienes membresía activa en esta organización.')
            setLoading(false)
            return
          } else if (detail.error === 'not_vendor') {
            setError(
              'Tu cuenta no tiene un perfil de vendedor activo en esta organización. Pide a un administrador que te asigne como vendedor.'
            )
            setLoading(false)
            return
          }
        }

        if (!res.ok) {
          const detail = await res.json()
          setError(detail.error || 'Error autenticando sesión en Plotify.')
          setLoading(false)
          return
        }

        const data: MiniappSession = await res.json()
        setMiniappSession(data)
        setSession(data)
        setLoading(false)
      } catch (err) {
        console.error('Error autenticando sesión de mini app:', err)
        setError(
          err instanceof DOMException && err.name === 'AbortError'
            ? 'La verificación de sesión tardó demasiado. Cierra esta ventana y vuelve a abrir la Mini App.'
            : 'Fallo de conexión de red con el servidor.'
        )
        setLoading(false)
      }
    }

    authenticate()
  }, [bypass, initData, isAvailable, orgId, telegramChatId])

  return (
    <MiniAppContext.Provider
      value={{
        session,
        loading,
        error,
        orgId,
        isTelegram: isAvailable,
      }}
    >
      {loading ? (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#121212] text-white">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-2xl">
            <div className="absolute inset-0 rounded-2xl border border-emerald-500/30 animate-ping opacity-25"></div>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
          </div>
          <p className="mt-4 text-xs font-medium text-zinc-400">Verificando sesión segura...</p>
        </div>
      ) : error ? (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#121212] p-6 text-center text-white">
          <div className="rounded-2xl bg-rose-950/40 border border-rose-800/30 p-4 text-rose-400">
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
          <h2 className="mt-4 text-base font-bold">Acceso no autorizado</h2>
          <p className="mt-2 text-xs text-zinc-400 max-w-xs leading-relaxed">{error}</p>
        </div>
      ) : (
        <div className="min-h-screen bg-[#121212] text-white flex flex-col justify-between">
          <div className="flex-1 pb-16">{children}</div>
          <MiniAppNav />
        </div>
      )}
    </MiniAppContext.Provider>
  )
}

export function MiniAppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#17212b] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
          <p className="mt-4 text-sm text-gray-400">Cargando aplicación...</p>
        </div>
      }
    >
      <MiniAppContent>{children}</MiniAppContent>
    </Suspense>
  )
}
