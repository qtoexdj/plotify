'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { MiniAppHeader } from '@/lib/miniapp/mini-app-header'
import { useTelegram } from '@/lib/miniapp/telegram'
import { formatRelativeTime } from '@/lib/miniapp/format'

interface BandejaItem {
  id: string
  tipo: 'reserva' | 'venta' | 'excepcion'
  titulo: string
  causa: string
  antiguedad_segundos: number
  estado: string
}

function BandejaInboxContent() {
  const router = useRouter()
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()
  const { haptic } = useTelegram()

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
          throw new Error('Fallo al obtener las solicitudes de la organización.')
        }

        const data = await resJson(targetRes)
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

  async function resJson(res: Response) {
    return res.json()
  }

  const approvalsCount = items.filter((i) => i.tipo === 'reserva' || i.tipo === 'venta').length
  const exceptionsCount = items.filter((i) => i.tipo === 'excepcion').length

  const filteredItems = items.filter((item) => {
    if (filter === 'approvals') return item.tipo === 'reserva' || item.tipo === 'venta'
    if (filter === 'exceptions') return item.tipo === 'excepcion'
    return true
  })

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-[#121212] text-white">
        <MiniAppHeader title="Centro de Mando" subtitle="Cargando solicitudes..." />
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 animate-pulse bg-white/[0.04] rounded-2xl"></div>
            <div className="h-20 animate-pulse bg-white/[0.04] rounded-2xl"></div>
          </div>
          <div className="h-28 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
          <div className="h-28 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#121212] text-white">
        <MiniAppHeader title="Centro de Mando" />
        <div className="flex flex-col items-center justify-center p-6 text-center mt-12">
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
          <h2 className="text-base font-bold">Error</h2>
          <p className="mt-2 text-xs text-zinc-400 max-w-xs">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white pb-6">
      {/* Header Unificado */}
      <MiniAppHeader
        title="Centro de Control"
        subtitle={`${items.length} decisiones pendientes`}
        rightElement={
          <button
            onClick={() => {
              haptic.impact('light')
              router.push('/mini/mapa')
            }}
            className="flex items-center gap-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] px-3 py-1.5 text-xs font-semibold text-zinc-200 active:scale-95 transition-all shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-3.5 w-3.5 text-rose-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689A1.125 1.125 0 0 0 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
              />
            </svg>
            Masterplan
          </button>
        }
      />

      {/* Tarjetas de Métricas Ejecutivas */}
      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        <div
          onClick={() => {
            haptic.selection()
            setFilter('approvals')
          }}
          className={`rounded-2xl p-4 border transition-all cursor-pointer shadow-md ${
            filter === 'approvals'
              ? 'bg-gradient-to-br from-emerald-950/50 to-zinc-900 border-emerald-500/40 shadow-emerald-950/30'
              : 'bg-[#181818] border-white/[0.08] hover:border-white/[0.15]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Aprobaciones
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white tracking-tight">{approvalsCount}</span>
            <span className="text-[11px] text-zinc-400 font-medium">por revisar</span>
          </div>
        </div>

        <div
          onClick={() => {
            haptic.selection()
            setFilter('exceptions')
          }}
          className={`rounded-2xl p-4 border transition-all cursor-pointer shadow-md ${
            filter === 'exceptions'
              ? 'bg-gradient-to-br from-amber-950/50 to-zinc-900 border-amber-500/40 shadow-amber-950/30'
              : 'bg-[#181818] border-white/[0.08] hover:border-white/[0.15]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Excepciones
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.008v.008H12v-.008Z"
                />
              </svg>
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white tracking-tight">{exceptionsCount}</span>
            <span className="text-[11px] text-zinc-400 font-medium">intervenciones</span>
          </div>
        </div>
      </div>

      {/* Pestañas de Filtro */}
      <div className="px-4 mt-4">
        <div className="flex rounded-xl bg-zinc-900/80 p-1 border border-white/[0.06]">
          <button
            onClick={() => {
              haptic.selection()
              setFilter('all')
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
              filter === 'all'
                ? 'bg-white/[0.12] text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Todas ({items.length})
          </button>
          <button
            onClick={() => {
              haptic.selection()
              setFilter('approvals')
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
              filter === 'approvals'
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Aprobaciones ({approvalsCount})
          </button>
          <button
            onClick={() => {
              haptic.selection()
              setFilter('exceptions')
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
              filter === 'exceptions'
                ? 'bg-amber-950/60 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Excepciones ({exceptionsCount})
          </button>
        </div>
      </div>

      {/* Lista de Solicitudes y Excepciones */}
      <main className="px-4 mt-4 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-6">
            <div className="rounded-2xl bg-emerald-950/30 border border-emerald-500/20 p-4 text-emerald-400 mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
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
            <h3 className="text-sm font-bold text-zinc-200">¡Todo al día en la organización!</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs leading-relaxed">
              No hay solicitudes comerciales ni excepciones pendientes de revisión en este momento.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isReserva = item.tipo === 'reserva'
            const isVenta = item.tipo === 'venta'
            const isExcepcion = item.tipo === 'excepcion'

            return (
              <div
                key={item.id}
                onClick={() => {
                  haptic.impact('light')
                  router.push(`/mini/bandeja/${item.id}?tipo=${item.tipo}`)
                }}
                className="group flex flex-col rounded-2xl bg-[#181818] p-4 border border-white/[0.08] hover:border-white/[0.15] active:scale-[0.99] transition-all cursor-pointer shadow-md space-y-2.5"
              >
                {/* Cabecera Item */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                        isReserva
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                          : isVenta
                            ? 'bg-sky-950/60 text-sky-300 border-sky-500/30'
                            : 'bg-amber-950/60 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {isReserva ? 'Reserva' : isVenta ? 'Venta' : 'Excepción Legal'}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {formatRelativeTime(item.antiguedad_segundos)}
                    </span>
                  </div>

                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300 transition-colors"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>

                {/* Título y Causa */}
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors">
                    {item.titulo}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                    {item.causa}
                  </p>
                </div>

                {/* Footer de Acción */}
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">
                    {isExcepcion ? 'Requiere reintento o resolución' : 'Requiere decisión de firma'}
                  </span>
                  <span className="font-semibold text-rose-400 group-hover:underline">
                    Revisar caso →
                  </span>
                </div>
              </div>
            )
          })
        )}
      </main>
    </div>
  )
}

export default function BandejaInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#121212] text-white p-4 space-y-3">
          <div className="h-10 w-full animate-pulse bg-white/[0.04] rounded-xl"></div>
          <div className="h-32 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        </div>
      }
    >
      <BandejaInboxContent />
    </Suspense>
  )
}
