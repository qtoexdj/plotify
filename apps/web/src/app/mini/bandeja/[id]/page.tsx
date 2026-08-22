'use client'

import React, { useEffect, useState, use, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { useTelegram } from '@/lib/miniapp/telegram'
import { formatCLP, formatRelativeTime } from '@/lib/miniapp/format'

interface DetalleLote {
  numero?: string
  precio?: number
  proyecto?: string
}

interface Comprador {
  nombre?: string
  rut?: string
  email?: string
  telefono?: string
}

interface Discrepancia {
  nombre: string
  valor_certificado: string
  valor_vendedor: string
  diferencia_detectada: string
}

interface DetalleBandeja {
  id: string
  tipo: 'reserva' | 'venta' | 'excepcion'
  titulo: string
  estado: string
  causa: string
  antiguedad_segundos: number
  detalles_lote?: DetalleLote
  comprador?: Comprador
  conflictos?: Discrepancia[]
  evidence_file_id?: string
}

function DetalleBandejaContent({ id }: { id: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tipo = searchParams.get('tipo') || 'reserva'
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()
  const { haptic } = useTelegram()

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
    haptic.impact('medium')
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

      haptic.notification('success')
      setSuccessMessage(
        decision === 'approve'
          ? '¡Solicitud aprobada! Cascada legal iniciada.'
          : '¡Solicitud rechazada con éxito!'
      )

      setTimeout(() => {
        router.replace('/mini/bandeja')
      }, 1500)
    } catch (err: unknown) {
      haptic.notification('error')
      const errorMsg = err instanceof Error ? err.message : 'Error al procesar la decisión.'
      setError(errorMsg)
      setSubmitting(false)
    }
  }

  const handleReintentarCascada = async () => {
    if (!session || submitting) return
    haptic.impact('medium')
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

      haptic.notification('success')
      setSuccessMessage('¡Se ha iniciado el reintento del pipeline legal!')

      setTimeout(() => {
        router.replace('/mini/bandeja')
      }, 1500)
    } catch (err: unknown) {
      haptic.notification('error')
      const errorMsg = err instanceof Error ? err.message : 'Error al reintentar la cascada.'
      setError(errorMsg)
      setSubmitting(false)
    }
  }

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-[#121212] text-white p-4 space-y-4">
        <div className="h-8 w-24 animate-pulse bg-white/[0.04] rounded-lg"></div>
        <div className="h-36 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        <div className="h-44 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
      </div>
    )
  }

  if (error && !detalle) {
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
            router.push('/mini/bandeja')
          }}
          className="mt-6 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] px-5 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all"
        >
          Volver a Aprobaciones
        </button>
      </div>
    )
  }

  if (successMessage) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center text-center text-white px-6">
        <div className="rounded-2xl bg-emerald-950/60 border border-emerald-500/30 p-5 text-emerald-400 mb-4 shadow-xl">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-10 w-10"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white tracking-tight">{successMessage}</h2>
        <p className="mt-2 text-xs text-zinc-400">Actualizando lista de decisiones...</p>
      </div>
    )
  }

  if (!detalle) return null

  const lote = detalle.detalles_lote
  const comprador = detalle.comprador
  const esExcepcion = detalle.tipo === 'excepcion'

  return (
    <div className="min-h-screen bg-[#121212] text-white pb-28">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#121212]/95 backdrop-blur-md border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              haptic.impact('light')
              router.push('/mini/bandeja')
            }}
            disabled={submitting}
            className="rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] p-2 text-zinc-300 transition-all active:scale-90 disabled:opacity-50"
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
            <h1 className="text-sm font-bold truncate max-w-[220px]">
              {esExcepcion ? 'Excepción de Cascada' : 'Revisión Ejecutiva'}
            </h1>
            <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">
              {detalle.tipo}
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-bold border ${
            esExcepcion
              ? 'bg-amber-950/60 text-amber-300 border-amber-500/30'
              : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
          }`}
        >
          {esExcepcion ? 'Excepción' : 'Pendiente'}
        </span>
      </header>

      {/* Alerta de Error no Crítico */}
      {error && (
        <div className="mx-4 mt-4 rounded-xl bg-rose-950/40 border border-rose-800/30 p-3 flex items-start gap-2.5 text-rose-300 text-xs">
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
          <span>{error}</span>
        </div>
      )}

      {/* Contenido Principal */}
      <main className="px-4 mt-4 space-y-4">
        {/* Ficha Resumen de la Operación */}
        <section className="rounded-2xl bg-[#181818] border border-white/[0.08] p-4 space-y-3.5 shadow-md">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                Parcela
              </span>
              <h2 className="text-base font-black text-white mt-0.5">
                Lote N° {lote?.numero ?? '—'}
              </h2>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                Proyecto
              </span>
              <p className="text-sm font-bold text-rose-400 mt-0.5">
                {lote?.proyecto ?? 'Desconocido'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
              <span className="text-zinc-400 text-[10px] block font-medium">Motivo:</span>
              <span className="font-semibold text-zinc-200 block mt-0.5">{detalle.causa}</span>
            </div>
            <div className="bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
              <span className="text-zinc-400 text-[10px] block font-medium">Antigüedad:</span>
              <span className="font-semibold text-zinc-200 block mt-0.5 font-mono">
                {formatRelativeTime(detalle.antiguedad_segundos)}
              </span>
            </div>
          </div>

          {typeof lote?.precio === 'number' && (
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-zinc-400 font-medium">Monto Transacción:</span>
              <span className="text-base font-black text-emerald-400 tracking-tight">
                {formatCLP(lote.precio)}
              </span>
            </div>
          )}
        </section>

        {/* Ficha del Comprador */}
        {comprador && (
          <section className="rounded-2xl bg-[#181818] border border-white/[0.08] p-4 space-y-3 shadow-md">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Datos del Comprador
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-white/[0.04] pb-2">
                <span className="text-zinc-400">Nombre:</span>
                <span className="font-bold text-white text-sm">{comprador.nombre ?? '—'}</span>
              </div>
              {comprador.rut && (
                <div className="flex justify-between items-center border-b border-white/[0.04] pb-2">
                  <span className="text-zinc-400">RUT:</span>
                  <span className="font-mono font-bold text-zinc-200">{comprador.rut}</span>
                </div>
              )}
              {comprador.email && (
                <div className="flex justify-between items-center border-b border-white/[0.04] pb-2">
                  <span className="text-zinc-400">Email:</span>
                  <span className="text-zinc-200">{comprador.email}</span>
                </div>
              )}
              {comprador.telefono && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Teléfono:</span>
                  <span className="text-zinc-200">{comprador.telefono}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Sección de Excepción / Discrepancias Legales */}
        {esExcepcion && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Discrepancias Minuta vs Base de Datos
              </h3>
              <span className="rounded-lg bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                Intervención Requerida
              </span>
            </div>

            {detalle.conflictos && detalle.conflictos.length > 0 ? (
              <div className="space-y-3">
                {detalle.conflictos.map((conf, index) => (
                  <div
                    key={index}
                    className="rounded-2xl bg-[#181818] border border-white/[0.08] p-3.5 space-y-2.5 shadow-md"
                  >
                    <div className="border-b border-white/[0.06] pb-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200 capitalize">
                        {conf.nombre.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-rose-950/50 text-rose-300 border border-rose-700/30">
                        Discrepancia
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="rounded-xl bg-emerald-950/20 border border-emerald-500/20 p-2.5">
                        <span className="text-[10px] text-emerald-400 font-bold block mb-1">
                          Base de Datos
                        </span>
                        <span className="text-zinc-200 font-semibold break-all leading-normal block">
                          {conf.valor_certificado || '—'}
                        </span>
                      </div>
                      <div className="rounded-xl bg-rose-950/20 border border-rose-500/20 p-2.5">
                        <span className="text-[10px] text-rose-400 font-bold block mb-1">
                          Minuta Borrador
                        </span>
                        <span className="text-zinc-200 font-semibold break-all leading-normal block">
                          {conf.valor_vendedor || '—'}
                        </span>
                      </div>
                    </div>

                    {conf.diferencia_detectada && (
                      <p className="text-[10px] text-zinc-400 leading-relaxed pt-1 font-medium">
                        {conf.diferencia_detectada}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-[#181818] border border-white/[0.08] p-4 text-center">
                <span className="text-xs text-zinc-400">
                  Sin discrepancias de variables registradas en este caso.
                </span>
              </div>
            )}

            {/* Referencia documental */}
            {detalle.evidence_file_id && (
              <div className="flex items-center gap-3 rounded-2xl bg-zinc-900 border border-white/[0.08] p-3.5">
                <div className="rounded-xl bg-rose-950/50 p-2 text-rose-400 border border-rose-800/30">
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
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-zinc-200">Expediente Registrado</h4>
                  <p className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate">
                    Ref. #{detalle.evidence_file_id.slice(0, 8)} (Auditable en consola web)
                  </p>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Barra de Acciones Fija Inferior */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 bg-[#121212]/98 backdrop-blur-xl border-t border-white/[0.1] px-4 py-3.5 flex gap-3 shadow-2xl safe-area-pb">
        {esExcepcion ? (
          <button
            onClick={handleReintentarCascada}
            disabled={submitting}
            className="flex-1 h-12 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all active:scale-[0.98] shadow-lg shadow-amber-950/50 flex items-center justify-center gap-2 disabled:opacity-50"
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
                Reintentar Pipeline Legal
              </>
            )}
          </button>
        ) : (
          <>
            <button
              onClick={() => handleDecision('reject')}
              disabled={submitting}
              className="flex-1 h-12 rounded-2xl border border-rose-500/30 bg-rose-950/30 hover:bg-rose-950/50 text-rose-300 font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              Rechazar Solicitud
            </button>
            <button
              onClick={() => handleDecision('approve')}
              disabled={submitting}
              className="flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all active:scale-[0.98] shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : (
                'Aprobar y Emitir'
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
        <div className="min-h-screen bg-[#121212] text-white p-4 space-y-4">
          <div className="h-8 w-24 animate-pulse bg-white/[0.04] rounded-lg"></div>
          <div className="h-36 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        </div>
      }
    >
      <DetalleBandejaContent id={resolvedParams.id} />
    </Suspense>
  )
}
