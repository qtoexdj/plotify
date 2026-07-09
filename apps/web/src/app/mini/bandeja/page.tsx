'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useMiniApp } from '../layout'

interface BandejaItem {
  id: string
  tipo: 'reserva' | 'venta' | 'excepcion'
  titulo: string
  causa: string
  antiguedad_segundos: number
  estado: string
}

function formatRelativeTime(seconds: number): string {
  if (seconds < 60) return 'Hace instantes'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `Hace ${days} d`
}

function BandejaInboxContent() {
  const router = useRouter()
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()

  const [items, setItems] = useState<BandejaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'approvals' | 'exceptions'>('all')

  useEffect(() => {
    if (sessionLoading) return
    if (sessionError) {
      Promise.resolve().then(() => {
        setError(sessionError)
        setLoading(false)
      })
      return
    }
    if (!session) {
      Promise.resolve().then(() => {
        setError('No se pudo verificar tu sesión.')
        setLoading(false)
      })
      return
    }

    // Solo admins acceden a esta bandeja
    const role = session.role.toLowerCase()
    if (role !== 'admin' && role !== 'superadmin') {
      Promise.resolve().then(() => {
        setError('Acceso denegado. Se requiere rol de Administrador.')
        setLoading(false)
      })
      return
    }

    const fetchBandeja = async () => {
      try {
        setError(null)
        setLoading(true)
        const token = session.token
        const targetRes = await fetch('/api/miniapp/bandeja', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!targetRes.ok) {
          throw new Error('Fallo al obtener los elementos de la bandeja.')
        }

        const data = await targetRes.json()
        setItems(data)
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error al conectar con el servidor.'
        setError(errorMsg)
      } finally {
        setLoading(false)
      }
    }

    fetchBandeja()
  }, [session, sessionLoading, sessionError])

  const filteredItems = items.filter((item) => {
    if (filter === 'approvals') return item.tipo === 'reserva' || item.tipo === 'venta'
    if (filter === 'exceptions') return item.tipo === 'excepcion'
    return true
  })

  if (sessionLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Actualizando bandeja de entrada...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] p-6 text-center text-white">
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
        <h2 className="text-lg font-semibold">Error</h2>
        <p className="mt-2 text-sm text-gray-400 max-w-xs">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0e1621] text-white pb-6">
      {/* Header Fijo */}
      <header className="sticky top-0 z-10 bg-[#17212b] px-4 py-4 shadow-md border-b border-[#242f3d]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold">Bandeja de Entrada</h1>
            <p className="text-xs text-gray-400 mt-0.5">{session?.user.org_nombre}</p>
          </div>
          <span className="rounded-full bg-[#2481cc]/20 px-2.5 py-1 text-xs font-semibold text-[#2481cc]">
            {filteredItems.length} pendientes
          </span>
        </div>

        {/* Filtros Horizontales Premium */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-[#2481cc] text-white shadow-md'
                : 'bg-[#242f3d] text-gray-400 hover:bg-[#2c3b4d]'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter('approvals')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
              filter === 'approvals'
                ? 'bg-[#2481cc] text-white shadow-md'
                : 'bg-[#242f3d] text-gray-400 hover:bg-[#2c3b4d]'
            }`}
          >
            Aprobaciones
          </button>
          <button
            onClick={() => setFilter('exceptions')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
              filter === 'exceptions'
                ? 'bg-[#2481cc] text-white shadow-md'
                : 'bg-[#242f3d] text-gray-400 hover:bg-[#2c3b4d]'
            }`}
          >
            Excepciones
          </button>
        </div>
      </header>

      {/* Lista de Items */}
      <main className="px-4 mt-4 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-[#17212b] p-4 text-gray-500 mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-7 w-7"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-300">¡Bandeja al día!</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              No tienes tareas pendientes por aprobar o excepciones legales por resolver.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => router.push(`/mini/bandeja/${item.id}?tipo=${item.tipo}`)}
              className="flex items-start gap-3 rounded-xl bg-[#17212b] p-4 border border-[#242f3d] active:bg-[#1a2734] transition-all cursor-pointer shadow-sm relative overflow-hidden"
            >
              {/* Indicador de Tipo */}
              <div
                className={`mt-0.5 rounded-lg p-2 text-white ${
                  item.tipo === 'reserva'
                    ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-500/30'
                    : item.tipo === 'venta'
                      ? 'bg-blue-900/50 text-blue-400 border border-blue-500/30'
                      : 'bg-amber-900/50 text-amber-400 border border-amber-500/30'
                }`}
              >
                {item.tipo === 'reserva' && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.0}
                    stroke="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                )}
                {item.tipo === 'venta' && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.0}
                    stroke="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                )}
                {item.tipo === 'excepcion' && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.0}
                    stroke="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                    />
                  </svg>
                )}
              </div>

              {/* Contenido */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {item.tipo === 'reserva'
                      ? 'Reserva'
                      : item.tipo === 'venta'
                        ? 'Venta'
                        : 'Bloqueo Cascada'}
                  </h4>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                    {formatRelativeTime(item.antiguedad_segundos)}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mt-0.5 truncate">{item.titulo}</h3>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                  {item.causa}
                </p>
              </div>

              {/* Indicador flecha derecha */}
              <div className="self-center text-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.0}
                  stroke="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m8.25 4.5 7.5 7.5-7.5 7.5"
                  />
                </svg>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  )
}

export default function BandejaInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
          <p className="mt-4 text-sm text-gray-400">Cargando bandeja de entrada...</p>
        </div>
      }
    >
      <BandejaInboxContent />
    </Suspense>
  )
}
