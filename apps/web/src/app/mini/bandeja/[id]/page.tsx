'use client'

import React, { useEffect, useState, use, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMiniApp } from '../../layout'

interface ConflictItem {
  campo: string
  valor_db: string
  valor_minuta: string
}

interface DetalleBandeja {
  id: string
  tipo: 'reserva' | 'venta' | 'excepcion'
  titulo: string
  proyecto: string
  numero_lote: string
  vendedor: string
  comprador?: string
  fecha: string
  monto?: number
  // Para excepciones de cascada
  conflictos?: ConflictItem[]
  evidence_url?: string
}

function DetalleBandejaContent({ id }: { id: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tipo = searchParams.get('tipo') || 'reserva'
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()

  const [detalle, setDetalle] = useState<DetalleBandeja | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

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
        const res = await fetch(`/api/miniapp/bandeja/${id}?tipo=${tipo}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          throw new Error('No se pudo obtener el detalle del elemento.')
        }

        const data = await res.json()
        setDetalle(data)
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error al conectar con el servidor.'
        setError(errorMsg)
      } finally {
        setLoading(false)
      }
    }

    fetchDetalle()
  }, [id, tipo, session, sessionLoading, sessionError])

  const handleDecision = async (decision: 'approve' | 'reject') => {
    if (!session || submitting) return
    try {
      setError(null)
      setSubmitting(true)
      const token = session.token

      const res = await fetch(`/api/miniapp/bandeja/${id}/decidir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ocurrió un error al procesar tu decisión.')
      }

      setSuccessMessage(
        decision === 'approve'
          ? '¡Solicitud aprobada con éxito!'
          : '¡Solicitud rechazada con éxito!'
      )

      setTimeout(() => {
        router.replace('/mini/bandeja')
      }, 1500)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al procesar la decisión.'
      setError(errorMsg)
      setSubmitting(false)
    }
  }

  const handleReintentarCascada = async () => {
    if (!session || submitting) return
    try {
      setError(null)
      setSubmitting(true)
      const token = session.token

      const res = await fetch(`/api/miniapp/bandeja/${id}/reintentar-cascada`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ocurrió un error al reintentar la cascada.')
      }

      setSuccessMessage('¡Se ha iniciado el reintento de la cascada legal!')

      setTimeout(() => {
        router.replace('/mini/bandeja')
      }, 1500)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al reintentar la cascada.'
      setError(errorMsg)
      setSubmitting(false)
    }
  }

  if (sessionLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Cargando detalles...</p>
      </div>
    )
  }

  if (error && !detalle) {
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
          onClick={() => router.push('/mini/bandeja')}
          className="mt-6 rounded-lg bg-[#2481cc] px-5 py-2 text-xs font-semibold hover:bg-[#2072b3]"
        >
          Volver a la bandeja
        </button>
      </div>
    )
  }

  if (successMessage) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-center text-white px-6">
        <div className="rounded-full bg-emerald-950/50 p-4 text-emerald-400 mb-4 animate-bounce">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.0}
            stroke="currentColor"
            className="h-8 w-8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-emerald-400">{successMessage}</h2>
        <p className="mt-2 text-xs text-gray-400">Redirigiendo a tu bandeja...</p>
      </div>
    )
  }

  if (!detalle) return null

  return (
    <div className="min-h-screen bg-[#0e1621] text-white pb-24">
      {/* Navbar Premium */}
      <header className="sticky top-0 z-10 bg-[#17212b] px-4 py-3 shadow-md border-b border-[#242f3d] flex items-center gap-3">
        <button
          onClick={() => router.push('/mini/bandeja')}
          disabled={submitting}
          className="rounded-lg p-1.5 hover:bg-[#242f3d] transition-all disabled:opacity-50"
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
          <h1 className="text-sm font-bold truncate max-w-[220px]">
            {detalle.tipo === 'excepcion' ? 'Conflicto de Cascada' : 'Detalle de Aprobación'}
          </h1>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">{detalle.tipo}</p>
        </div>
      </header>

      {/* Alerta de Error no Crítico */}
      {error && (
        <div className="mx-4 mt-4 rounded-lg bg-red-950/40 border border-red-500/20 p-3 flex items-start gap-2.5 text-red-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.0}
            stroke="currentColor"
            className="h-4 w-4 mt-0.5 shrink-0"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Contenido Detalle */}
      <main className="px-4 mt-4 space-y-4">
        {/* Tarjeta de Ficha Básica */}
        <section className="rounded-xl bg-[#17212b] border border-[#242f3d] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#242f3d] pb-2">
            <div>
              <h3 className="text-xs text-gray-400">Lote</h3>
              <p className="text-sm font-bold text-white mt-0.5">N° {detalle.numero_lote}</p>
            </div>
            <div className="text-right">
              <h3 className="text-xs text-gray-400">Proyecto</h3>
              <p className="text-sm font-bold text-[#2481cc] mt-0.5">{detalle.proyecto}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400 block">Vendedor:</span>
              <span className="font-semibold text-gray-200 block mt-0.5">{detalle.vendedor}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Fecha Solicitud:</span>
              <span className="font-semibold text-gray-200 block mt-0.5">{detalle.fecha}</span>
            </div>
            {detalle.comprador && (
              <div className="col-span-2">
                <span className="text-gray-400 block">Comprador:</span>
                <span className="font-semibold text-gray-100 block mt-0.5 text-sm">
                  {detalle.comprador}
                </span>
              </div>
            )}
            {detalle.monto && (
              <div className="col-span-2 pt-1 border-t border-[#242f3d]">
                <span className="text-gray-400 block">Monto Transacción:</span>
                <span className="font-bold text-emerald-400 block mt-0.5 text-base">
                  ${detalle.monto.toLocaleString('es-CL')}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Sección de Excepción / Discrepancias Legales */}
        {detalle.tipo === 'excepcion' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Discrepancias Minuta vs DB
              </h2>
              <span className="rounded-full bg-amber-900/40 border border-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400">
                Bloqueado
              </span>
            </div>

            {detalle.conflictos && detalle.conflictos.length > 0 ? (
              <div className="space-y-3">
                {detalle.conflictos.map((conf, index) => (
                  <div
                    key={index}
                    className="rounded-xl bg-[#17212b] border border-[#242f3d] p-3 space-y-2 relative overflow-hidden"
                  >
                    {/* Campo */}
                    <div className="border-b border-[#242f3d] pb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-300 capitalize">
                        {conf.campo.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-950/30 text-red-400 border border-red-500/10">
                        Discrepancia
                      </span>
                    </div>

                    {/* Comparación side-by-side */}
                    <div className="grid grid-cols-2 gap-3 text-xs pt-0.5">
                      <div className="rounded-lg bg-emerald-950/20 border border-emerald-500/10 p-2">
                        <span className="text-[10px] text-emerald-400 font-bold block mb-1">
                          Base de Datos
                        </span>
                        <span className="text-gray-300 font-semibold break-all leading-normal block">
                          {conf.valor_db || '—'}
                        </span>
                      </div>
                      <div className="rounded-lg bg-red-950/20 border border-red-500/10 p-2">
                        <span className="text-[10px] text-red-400 font-bold block mb-1">
                          Minuta Borrador
                        </span>
                        <span className="text-gray-300 font-semibold break-all leading-normal block">
                          {conf.valor_minuta || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-[#17212b] border border-[#242f3d] p-4 text-center">
                <span className="text-xs text-gray-500">
                  Sin discrepancias de variables registradas.
                </span>
              </div>
            )}

            {/* Enlace de evidencia documental */}
            {detalle.evidence_url && (
              <a
                href={detalle.evidence_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl bg-blue-950/30 border border-blue-500/20 p-4 hover:bg-blue-950/40 transition-all cursor-pointer mt-4"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-900/50 p-2 text-blue-400">
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
                        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-200">Ver Minuta Borrador</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Abrir archivo PDF de evidencia
                    </p>
                  </div>
                </div>
                <div className="text-blue-400">
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
                      d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                </div>
              </a>
            )}
          </section>
        )}
      </main>

      {/* Barra de Acciones Fija Inferior */}
      <footer className="fixed bottom-0 left-0 right-0 z-10 bg-[#17212b] border-t border-[#242f3d] px-4 py-4 flex gap-3 shadow-lg">
        {detalle.tipo === 'excepcion' ? (
          <button
            onClick={handleReintentarCascada}
            disabled={submitting}
            className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 text-sm transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            ) : (
              <>
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
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                Reintentar Cascada
              </>
            )}
          </button>
        ) : (
          <>
            <button
              onClick={() => handleDecision('reject')}
              disabled={submitting}
              className="flex-1 rounded-xl border border-red-500/30 bg-red-950/20 hover:bg-red-950/30 text-red-400 font-bold py-3 text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              Rechazar
            </button>
            <button
              onClick={() => handleDecision('approve')}
              disabled={submitting}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 text-sm transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : (
                'Aprobar'
              )}
            </button>
          </>
        )}
      </footer>
    </div>
  )
}

export default function DetalleBandejaPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  return (
    <Suspense
      fallback={
        <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
          <p className="mt-4 text-sm text-gray-400">Cargando detalles...</p>
        </div>
      }
    >
      <DetalleBandejaContent id={resolvedParams.id} />
    </Suspense>
  )
}
