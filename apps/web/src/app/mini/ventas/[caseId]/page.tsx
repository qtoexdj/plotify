'use client'

import React, { useEffect, useState, use, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { useTelegram } from '@/lib/miniapp/telegram'

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

function getEtapaInfo(etapa: string): { title: string; desc: string; detail: string } {
  switch (etapa.toLowerCase()) {
    case 'venta':
      return {
        title: 'Venta Registrada',
        desc: 'Ingreso inicial del acuerdo comercial.',
        detail: 'La solicitud fue ingresada y recibida por el sistema para validación de antecedentes.',
      }
    case 'validacion':
      return {
        title: 'Validación de Antecedentes',
        desc: 'Comprobación de consistencia y datos del comprador.',
        detail: 'Los datos del comprador y la parcela están siendo procesados de forma automatizada.',
      }
    case 'revision':
      return {
        title: 'Revisión Legal',
        desc: 'Mesa jurídica preparando matriz y cláusulas notariales.',
        detail: 'El expediente se encuentra en validación jurídica para estructurar el borrador oficial.',
      }
    case 'minuta':
      return {
        title: 'Minuta Lista para Entrega',
        desc: 'Borrador de escritura generado exitosamente.',
        detail: 'El documento final está generado y listo para ser entregado o descargado por las partes.',
      }
    default:
      return {
        title: 'En Tramitación',
        desc: 'Expediente en curso.',
        detail: 'El trámite avanza a través del flujo de escrituración.',
      }
  }
}

function VentaDetalleContent({ caseId }: { caseId: string }) {
  const router = useRouter()
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()
  const { haptic } = useTelegram()

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
      <div className="min-h-screen bg-[#121212] text-white p-4 space-y-4">
        <div className="h-8 w-24 animate-pulse bg-white/[0.04] rounded-lg"></div>
        <div className="h-32 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        <div className="h-40 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
      </div>
    )
  }

  if (error && !venta) {
    return (
      <div className="min-h-screen bg-[#121212] p-6 text-center text-white flex flex-col items-center justify-center">
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
        <button
          onClick={() => {
            haptic.impact('light')
            router.push('/mini/ventas')
          }}
          className="mt-6 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] px-5 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all"
        >
          Volver a Mis Ventas
        </button>
      </div>
    )
  }

  if (!venta) return null

  const activeStep = getEtapaPaso(venta.etapa)
  const isReady = venta.etapa === 'minuta'
  const etapaInfo = getEtapaInfo(venta.etapa)

  return (
    <div className="min-h-screen bg-[#121212] text-white pb-12">
      {/* Header con botón Atrás */}
      <header className="sticky top-0 z-20 bg-[#121212]/95 backdrop-blur-md border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              haptic.impact('light')
              router.push('/mini/ventas')
            }}
            className="rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] p-2 text-zinc-300 transition-all active:scale-90"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.0}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-sm font-bold text-white">Lote N° {venta.numero_lote}</h1>
            <p className="text-[11px] text-zinc-400 font-medium">{venta.proyecto}</p>
          </div>
        </div>

        <span
          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-bold border ${
            isReady
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
              : 'bg-zinc-800/80 text-zinc-300 border-zinc-700/40'
          }`}
        >
          {isReady ? 'Minuta Lista' : 'En Trámite'}
        </span>
      </header>

      {/* Contenido Principal */}
      <main className="px-4 mt-4 space-y-4">
        {/* Ficha Resumen */}
        <section className="rounded-2xl bg-[#181818] border border-white/[0.08] p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider block">
                Estado Actual
              </span>
              <h2 className="text-base font-bold text-white mt-0.5">{etapaInfo.title}</h2>
            </div>
            <span className="text-xs font-mono text-zinc-400 bg-white/[0.04] border border-white/[0.06] px-2 py-1 rounded-lg">
              Fase {activeStep}/4
            </span>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed font-normal">{etapaInfo.detail}</p>

          {isReady && (
            <button
              onClick={() => {
                haptic.impact('medium')
                router.push('/mini/documentos')
              }}
              className="w-full mt-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 active:scale-[0.98] transition-all"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              Ver Minuta en Archivador
            </button>
          )}
        </section>

        {/* Flujo Visual Paso a Paso */}
        <section className="rounded-2xl bg-[#181818] border border-white/[0.08] p-4 space-y-4 shadow-md">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Flujo de Tramitación Plotify
          </h3>

          <div className="space-y-3">
            {ETAPAS_ORDENADAS.map((et, index) => {
              const stepNum = index + 1
              const isCompleted = stepNum < activeStep
              const isCurrent = stepNum === activeStep
              const info = getEtapaInfo(et)

              return (
                <div
                  key={et}
                  className={`flex items-start gap-3 rounded-xl p-3 border transition-all ${
                    isCurrent
                      ? 'bg-white/[0.06] border-emerald-500/30'
                      : isCompleted
                        ? 'bg-white/[0.02] border-white/[0.06] opacity-80'
                        : 'bg-transparent border-white/[0.04] opacity-40'
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                          ? 'bg-emerald-500 text-black font-black'
                          : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {isCompleted ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                        stroke="currentColor"
                        className="h-3.5 w-3.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    ) : (
                      stepNum
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4
                        className={`text-xs font-bold ${
                          isCurrent ? 'text-emerald-400' : 'text-zinc-200'
                        }`}
                      >
                        {info.title}
                      </h4>
                      {isCompleted && (
                        <span className="text-[10px] text-emerald-400 font-semibold">Listo</span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] text-emerald-400 font-bold animate-pulse">
                          En curso
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{info.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
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
        <div className="min-h-screen bg-[#121212] text-white p-4 space-y-4">
          <div className="h-8 w-24 animate-pulse bg-white/[0.04] rounded-lg"></div>
          <div className="h-32 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        </div>
      }
    >
      <VentaDetalleContent caseId={resolvedParams.caseId} />
    </Suspense>
  )
}
