'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { MiniAppHeader } from '@/lib/miniapp/mini-app-header'
import { useTelegram } from '@/lib/miniapp/telegram'

interface VentaItem {
  id: string
  proyecto: string
  numero_lote: string
  status: string
  etapa: 'venta' | 'validacion' | 'revision' | 'minuta'
  blockers: string[]
  blockers_humanizados: string[]
  created_at: string
}

function getEtapaPaso(etapa: string): number {
  const etapas = ['venta', 'validacion', 'revision', 'minuta']
  const idx = etapas.indexOf(etapa.toLowerCase())
  return idx !== -1 ? idx + 1 : 1
}

function getEtapaLabel(etapa: string): { label: string; color: string } {
  switch (etapa.toLowerCase()) {
    case 'minuta':
      return { label: 'Minuta Lista', color: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30' }
    case 'revision':
      return { label: 'Revisión Legal', color: 'bg-sky-950/60 text-sky-300 border-sky-500/30' }
    case 'validacion':
      return { label: 'En Validación', color: 'bg-amber-950/60 text-amber-300 border-amber-500/30' }
    default:
      return { label: 'Ingresada', color: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/40' }
  }
}

function VentasContent() {
  const router = useRouter()
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()
  const { haptic } = useTelegram()

  const [ventas, setVentas] = useState<VentaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'ready'>('all')

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

    const fetchVentas = async () => {
      try {
        setError(null)
        setLoading(true)
        const token = session.token
        const res = await fetch('/api/miniapp/ventas', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          throw new Error('Fallo al obtener tus ventas.')
        }

        const data = await res.json()
        setVentas(data)
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error al conectar con el servidor.'
        setError(errorMsg)
      } finally {
        setLoading(false)
      }
    }

    fetchVentas()
  }, [session, sessionLoading, sessionError])

  const filteredVentas = ventas.filter((venta) => {
    if (filter === 'ready') return venta.etapa === 'minuta'
    if (filter === 'in_progress') return venta.etapa !== 'minuta'
    return true
  })

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-[#121212] text-white">
        <MiniAppHeader subtitle="Cargando ventas..." />
        <div className="p-4 space-y-3">
          <div className="h-10 w-full animate-pulse bg-white/[0.04] rounded-xl"></div>
          <div className="h-32 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
          <div className="h-32 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#121212] text-white">
        <MiniAppHeader />
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
          <h2 className="text-base font-bold">Error al cargar ventas</h2>
          <p className="mt-2 text-xs text-zinc-400 max-w-xs">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white pb-6">
      {/* Header Unificado Plotify */}
      <MiniAppHeader
        title="Gestión de Ventas"
        subtitle={`${ventas.length} operaciones registradas`}
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
              className="h-3.5 w-3.5 text-emerald-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689A1.125 1.125 0 0 0 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
              />
            </svg>
            Ver Mapa
          </button>
        }
      />

      {/* Banner de Acción Rápida */}
      <div className="px-4 mt-4">
        <div
          onClick={() => {
            haptic.impact('medium')
            router.push('/mini/reserva')
          }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 border border-emerald-500/20 p-4 shadow-lg cursor-pointer active:scale-[0.99] transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Operación Rápida
              </span>
              <h3 className="text-sm font-bold text-white">Ingresar Nueva Reserva</h3>
              <p className="text-[11px] text-zinc-400">Registra un comprador y asegura la parcela en segundos</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
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
            Todas ({ventas.length})
          </button>
          <button
            onClick={() => {
              haptic.selection()
              setFilter('in_progress')
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
              filter === 'in_progress'
                ? 'bg-white/[0.12] text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            En Trámite ({ventas.filter((v) => v.etapa !== 'minuta').length})
          </button>
          <button
            onClick={() => {
              haptic.selection()
              setFilter('ready')
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
              filter === 'ready'
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Listas ({ventas.filter((v) => v.etapa === 'minuta').length})
          </button>
        </div>
      </div>

      {/* Lista de Ventas */}
      <main className="px-4 mt-4 space-y-3">
        {filteredVentas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-6">
            <div className="rounded-2xl bg-white/[0.04] p-4 text-zinc-500 mb-3 border border-white/[0.06]">
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
                  d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-zinc-300">Sin operaciones</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs leading-relaxed">
              No tienes ventas en esta categoría. Puedes iniciar una nueva reserva tocando el botón superior.
            </p>
          </div>
        ) : (
          filteredVentas.map((venta) => {
            const step = getEtapaPaso(venta.etapa)
            const badge = getEtapaLabel(venta.etapa)
            const isReady = venta.etapa === 'minuta'

            return (
              <div
                key={venta.id}
                onClick={() => {
                  haptic.impact('light')
                  router.push(`/mini/ventas/${venta.id}`)
                }}
                className="group flex flex-col rounded-2xl bg-[#181818] p-4 border border-white/[0.08] hover:border-white/[0.15] active:scale-[0.99] transition-all cursor-pointer shadow-md space-y-3"
              >
                {/* Cabecera Tarjeta */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                        Lote N° {venta.numero_lote}
                      </h3>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 font-medium">{venta.proyecto}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-bold border ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                </div>

                {/* Pipeline Stepper Pro */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium">
                    <span>Avance: {badge.label}</span>
                    <span className="font-mono text-zinc-300">Paso {step} de 4</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden p-0.5">
                    {[1, 2, 3, 4].map((s) => (
                      <div
                        key={s}
                        className={`h-full rounded-full transition-all ${
                          s <= step
                            ? isReady
                              ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                              : 'bg-emerald-600'
                            : 'bg-transparent'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Estado y Acciones Rápidas */}
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                  {isReady ? (
                    <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="h-3.5 w-3.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      Escritura disponible para entrega
                    </span>
                  ) : (
                    <span className="text-zinc-400 text-[11px]">
                      {venta.blockers_humanizados?.[0] || 'En revisión del equipo'}
                    </span>
                  )}

                  <div className="flex items-center gap-1 text-zinc-400 text-xs font-medium">
                    <span>Detalles</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </main>
    </div>
  )
}

export default function VentasPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#121212] text-white p-4 space-y-3">
          <div className="h-10 w-full animate-pulse bg-white/[0.04] rounded-xl"></div>
          <div className="h-32 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        </div>
      }
    >
      <VentasContent />
    </Suspense>
  )
}
