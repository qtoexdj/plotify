'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { MiniAppHeader } from '@/lib/miniapp/mini-app-header'
import { useTelegram } from '@/lib/miniapp/telegram'

interface MinutaItem {
  id: string
  escritura_case_id: string
  proyecto: string
  numero_lote: string
  file_path: string
  url_descarga: string
  delivered_at: string
  expires_at: string
  vencido: boolean
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function DocumentosContent() {
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()
  const { haptic } = useTelegram()

  const [documentos, setDocumentos] = useState<MinutaItem[]>([])
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

    const fetchDocumentos = async () => {
      try {
        setError(null)
        setLoading(true)
        const token = session.token
        const res = await fetch('/api/miniapp/documentos', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          throw new Error('Fallo al obtener el archivador de documentos.')
        }

        const data = await res.json()
        setDocumentos(data)
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error al conectar con el servidor.'
        setError(errorMsg)
      } finally {
        setLoading(false)
      }
    }

    fetchDocumentos()
  }, [session, sessionLoading, sessionError])

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-[#121212] text-white">
        <MiniAppHeader title="Archivador Digital" subtitle="Cargando expedientes..." />
        <div className="p-4 space-y-3">
          <div className="h-28 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
          <div className="h-28 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#121212] text-white">
        <MiniAppHeader title="Archivador Digital" />
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
    <div className="min-h-screen bg-[#121212] text-white pb-12">
      <MiniAppHeader
        title="Archivador Digital"
        subtitle={`${documentos.length} minutas emitidas`}
      />

      {/* Listado de Documentos */}
      <main className="px-4 mt-4 space-y-3">
        {documentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-6">
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
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-zinc-300">Sin minutas disponibles</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs leading-relaxed">
              Cuando las ventas avancen en el pipeline y se emitan los borradores de escritura, podrás descargarlos aquí directamente.
            </p>
          </div>
        ) : (
          documentos.map((doc) => {
            const fileName = doc.file_path.split('/').pop() || 'minuta_escritura.docx'

            return (
              <div
                key={doc.id}
                className="flex flex-col rounded-2xl bg-[#181818] p-4 border border-white/[0.08] shadow-md space-y-3"
              >
                {/* Cabecera Minuta */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
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
                      <h3 className="text-sm font-bold text-white">Lote N° {doc.numero_lote}</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">{doc.proyecto}</p>
                    </div>
                  </div>

                  {doc.vencido ? (
                    <span className="rounded-lg bg-rose-950/40 border border-rose-500/20 px-2 py-0.5 text-[9px] font-bold text-rose-300">
                      Expirado
                    </span>
                  ) : (
                    <span className="rounded-lg bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                      Disponible
                    </span>
                  )}
                </div>

                {/* Fechas */}
                <div className="grid grid-cols-2 gap-2 text-[10px] bg-white/[0.02] border border-white/[0.04] rounded-xl p-2.5">
                  <div>
                    <span className="text-[9px] text-zinc-400 block font-semibold uppercase tracking-wider">
                      Generado
                    </span>
                    <span className="font-semibold text-zinc-200 mt-0.5 block">
                      {formatDate(doc.delivered_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-zinc-400 block font-semibold uppercase tracking-wider">
                      Válido hasta
                    </span>
                    <span className="font-semibold text-zinc-200 mt-0.5 block">
                      {formatDate(doc.expires_at)}
                    </span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="pt-1 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-zinc-400 font-mono truncate max-w-[150px]">
                    {fileName}
                  </span>

                  {!doc.vencido && doc.url_descarga ? (
                    <a
                      href={doc.url_descarga}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => haptic.impact('light')}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-950/50 transition-all flex items-center gap-1.5 active:scale-95"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.0}
                        stroke="currentColor"
                        className="h-3.5 w-3.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                        />
                      </svg>
                      Descargar
                    </a>
                  ) : (
                    <button
                      disabled
                      className="rounded-xl bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-500 cursor-not-allowed border border-white/[0.04]"
                    >
                      Expirado
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </main>
    </div>
  )
}

export default function DocumentosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#121212] text-white p-4 space-y-3">
          <div className="h-10 w-full animate-pulse bg-white/[0.04] rounded-xl"></div>
          <div className="h-32 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        </div>
      }
    >
      <DocumentosContent />
    </Suspense>
  )
}
