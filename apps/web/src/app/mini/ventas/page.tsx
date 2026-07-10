'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'

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

function getEtapaNombre(etapa: string): string {
  const nombres: Record<string, string> = {
    venta: 'Venta',
    validacion: 'Validación',
    revision: 'Revisión Jurídica',
    minuta: 'Minuta Lista',
  }
  return nombres[etapa.toLowerCase()] || etapa
}

function VentasContent() {
  const router = useRouter()
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()

  const [ventas, setVentas] = useState<VentaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'blocked' | 'active'>('all')

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
    if (filter === 'blocked') return venta.blockers && venta.blockers.length > 0
    if (filter === 'active') return !venta.blockers || venta.blockers.length === 0
    return true
  })

  if (sessionLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Actualizando tus ventas...</p>
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
    <div className="min-h-screen bg-[#0e1621] text-white pb-24">
      {/* Header Premium */}
      <header className="sticky top-0 z-10 bg-[#17212b] px-4 py-4 shadow-md border-b border-[#242f3d]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold">Mis Ventas</h1>
            <p className="text-xs text-gray-400 mt-0.5">{session?.user.nombre} · Vendedor</p>
          </div>
          <button
            onClick={() => router.push('/mini/documentos')}
            className="flex items-center gap-1.5 rounded-lg bg-[#2481cc]/15 px-3 py-1.5 text-xs font-semibold text-[#2481cc] border border-[#2481cc]/30 hover:bg-[#2481cc]/25 transition-all"
          >
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
                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
              />
            </svg>
            Minutas
          </button>
        </div>

        {/* Pestañas de Filtro */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-[#2481cc] text-white shadow-md'
                : 'bg-[#242f3d] text-gray-400 hover:bg-[#2c3b4d]'
            }`}
          >
            Todas ({ventas.length})
          </button>
          <button
            onClick={() => setFilter('blocked')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
              filter === 'blocked'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-[#242f3d] text-gray-400 hover:bg-[#2c3b4d]'
            }`}
          >
            Bloqueadas ({ventas.filter((v) => v.blockers && v.blockers.length > 0).length})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
              filter === 'active'
                ? 'bg-[#2481cc] text-white shadow-md'
                : 'bg-[#242f3d] text-gray-400 hover:bg-[#2c3b4d]'
            }`}
          >
            Sin Trabas
          </button>
        </div>
      </header>

      {/* Lista de Ventas */}
      <main className="px-4 mt-4 space-y-3">
        {filteredVentas.length === 0 ? (
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
                  d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-300">Sin registros</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              No se encontraron ventas para el filtro seleccionado.
            </p>
          </div>
        ) : (
          filteredVentas.map((venta) => {
            const hasBlockers = venta.blockers && venta.blockers.length > 0
            const step = getEtapaPaso(venta.etapa)

            return (
              <div
                key={venta.id}
                onClick={() => router.push(`/mini/ventas/${venta.id}`)}
                className="flex flex-col rounded-xl bg-[#17212b] p-4 border border-[#242f3d] active:bg-[#1a2734] transition-all cursor-pointer shadow-sm relative overflow-hidden space-y-3"
              >
                {/* Cabecera Tarjeta */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">Lote N° {venta.numero_lote}</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">{venta.proyecto}</p>
                  </div>
                  {hasBlockers ? (
                    <span className="rounded-full bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 text-[9px] font-semibold text-amber-400 flex items-center gap-1 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                      Bloqueada
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 shrink-0">
                      Activa
                    </span>
                  )}
                </div>

                {/* Pipeline Stepper Visual (1 a 4) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>Progreso: {getEtapaNombre(venta.etapa)}</span>
                    <span>{step}/4</span>
                  </div>
                  <div className="flex gap-1 h-1.5 w-full bg-[#242f3d] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        hasBlockers ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${(step / 4) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Resumen de Trabas */}
                {hasBlockers && (
                  <div className="rounded-lg bg-amber-950/15 border border-amber-500/10 p-2.5 space-y-1 text-xs">
                    <span className="text-amber-400 font-bold block text-[10px] uppercase tracking-wider">
                      Acción Requerida:
                    </span>
                    <p className="text-gray-300 font-medium line-clamp-1 leading-normal">
                      {venta.blockers_humanizados[0]}
                    </p>
                    {venta.blockers.length > 1 && (
                      <span className="text-[10px] text-gray-500 block">
                        Y otros {venta.blockers.length - 1} blockers pendientes.
                      </span>
                    )}
                  </div>
                )}
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
        <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
          <p className="mt-4 text-sm text-gray-400">Cargando tus ventas...</p>
        </div>
      }
    >
      <VentasContent />
    </Suspense>
  )
}
