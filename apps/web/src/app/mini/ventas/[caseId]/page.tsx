'use client'

import React, { useEffect, useState, use, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'

interface DetalleVenta {
  id: string
  proyecto: string
  numero_lote: string
  status: string
  etapa: 'venta' | 'validacion' | 'revision' | 'minuta'
  blockers: string[]
  blockers_humanizados: string[]
  created_at: string
}

const ETAPAS_ORDENADAS = ['venta', 'validacion', 'revision', 'minuta']

function getEtapaPaso(etapa: string): number {
  const idx = ETAPAS_ORDENADAS.indexOf(etapa.toLowerCase())
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

function getEtapaDescripcion(etapa: string): string {
  const descripciones: Record<string, string> = {
    venta: 'Carga inicial del acuerdo de venta y datos primarios.',
    validacion: 'Validación automatizada de consistencia y datos del comprador.',
    revision: 'Verificación legal y de firmas de contratos en mesa.',
    minuta: 'Minuta borrador generada y lista para entrega.',
  }
  return descripciones[etapa.toLowerCase()] || ''
}

function VentaDetalleContent({ caseId }: { caseId: string }) {
  const router = useRouter()
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()

  const [venta, setVenta] = useState<DetalleVenta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

    const fetchDetalle = async () => {
      try {
        setError(null)
        setLoading(true)
        const token = session.token
        const res = await fetch(`/api/miniapp/ventas/${caseId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          throw new Error('No se pudo obtener el detalle de la venta.')
        }

        const data = await res.json()
        setVenta(data)
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error al conectar con el servidor.'
        setError(errorMsg)
      } finally {
        setLoading(false)
      }
    }

    fetchDetalle()
  }, [caseId, session, sessionLoading, sessionError])

  if (sessionLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Cargando detalles de venta...</p>
      </div>
    )
  }

  if (error && !venta) {
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
        <button
          onClick={() => router.push('/mini/ventas')}
          className="mt-6 rounded-lg bg-[#2481cc] px-5 py-2 text-xs font-semibold hover:bg-[#2072b3]"
        >
          Volver a mis ventas
        </button>
      </div>
    )
  }

  if (!venta) return null

  const hasBlockers = venta.blockers && venta.blockers.length > 0
  const activeStep = getEtapaPaso(venta.etapa)

  return (
    <div className="min-h-screen bg-[#0e1621] text-white pb-12">
      {/* Navbar Premium */}
      <header className="sticky top-0 z-10 bg-[#17212b] px-4 py-3 shadow-md border-b border-[#242f3d] flex items-center gap-3">
        <button
          onClick={() => router.push('/mini/ventas')}
          className="rounded-lg p-1.5 hover:bg-[#242f3d] transition-all"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.0}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
            />
          </svg>
        </button>
        <div>
          <h1 className="text-sm font-bold truncate">Lote N° {venta.numero_lote}</h1>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">{venta.proyecto}</p>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="px-4 mt-4 space-y-5">
        {/* Ficha Básica */}
        <section className="rounded-xl bg-[#17212b] border border-[#242f3d] p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-500 block uppercase tracking-wider">
              Estado de Trámite
            </span>
            <span className="text-sm font-bold text-gray-200 block mt-0.5 capitalize">
              {venta.status.replace(/_/g, ' ')}
            </span>
          </div>
          {hasBlockers ? (
            <span className="rounded-full bg-amber-900/40 border border-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-400">
              Trabas Pendientes
            </span>
          ) : (
            <span className="rounded-full bg-emerald-900/40 border border-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-400">
              Sin Blockers
            </span>
          )}
        </section>

        {/* Stepper Pipeline (Horizontal / Premium) */}
        <section className="rounded-xl bg-[#17212b] border border-[#242f3d] p-4 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Flujo de Escrituración
          </h2>

          <div className="relative flex items-center justify-between w-full mt-2">
            {/* Línea de Fondo del Stepper */}
            <div className="absolute left-0 right-0 h-0.5 bg-[#242f3d] -z-0"></div>

            {/* Línea de Progreso Activa */}
            <div
              className={`absolute left-0 h-0.5 -z-0 transition-all ${
                hasBlockers ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{
                width: `${((activeStep - 1) / (ETAPAS_ORDENADAS.length - 1)) * 100}%`,
              }}
            ></div>

            {/* Pasos */}
            {ETAPAS_ORDENADAS.map((et, index) => {
              const stepNum = index + 1
              const isCompleted = stepNum < activeStep
              const isActive = stepNum === activeStep

              return (
                <div key={et} className="relative z-10 flex flex-col items-center">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all border ${
                      isCompleted
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : isActive
                          ? hasBlockers
                            ? 'bg-amber-600 border-amber-500 text-white animate-pulse'
                            : 'bg-emerald-600 border-emerald-500 text-white animate-pulse'
                          : 'bg-[#17212b] border-[#242f3d] text-gray-500'
                    }`}
                  >
                    {isCompleted ? (
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
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                    ) : (
                      stepNum
                    )}
                  </div>
                  <span
                    className={`text-[9px] font-semibold mt-1.5 absolute top-7 whitespace-nowrap ${
                      isActive
                        ? hasBlockers
                          ? 'text-amber-400 font-bold'
                          : 'text-emerald-400 font-bold'
                        : 'text-gray-500'
                    }`}
                  >
                    {getEtapaNombre(et)}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="pt-6 text-xs text-gray-400 leading-relaxed border-t border-[#242f3d] mt-2">
            <span className="font-bold text-gray-300 block mb-0.5">
              Etapa Actual: {getEtapaNombre(venta.etapa)}
            </span>
            <p>{getEtapaDescripcion(venta.etapa)}</p>
          </div>
        </section>

        {/* Bloqueadores / Tareas Requeridas */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Estado de Requisitos
          </h2>

          {hasBlockers ? (
            <div className="space-y-2">
              {venta.blockers_humanizados.map((bl, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-3.5 flex items-start gap-3"
                >
                  <div className="rounded-lg bg-amber-900/40 p-2 text-amber-400 shrink-0">
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
                        d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      Acción Requerida
                    </h4>
                    <p className="text-sm font-semibold text-gray-200 mt-0.5 leading-relaxed">
                      {bl}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Por favor, regulariza este campo con el comprador o mesa jurídica para avanzar
                      de etapa.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 flex items-start gap-3">
              <div className="rounded-lg bg-emerald-900/40 p-2 text-emerald-400 shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.0}
                  stroke="currentColor"
                  className="h-4 w-4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Venta Libre de Trabas
                </h4>
                <p className="text-sm font-semibold text-gray-200 mt-0.5 leading-relaxed">
                  Todo está al día para esta venta. El pipeline de validaciones se completó con
                  éxito.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default function VentaDetallePage({ params }: { params: Promise<{ caseId: string }> }) {
  const resolvedParams = use(params)
  return (
    <Suspense
      fallback={
        <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
          <p className="mt-4 text-sm text-gray-400">Cargando detalles de venta...</p>
        </div>
      }
    >
      <VentaDetalleContent caseId={resolvedParams.caseId} />
    </Suspense>
  )
}
