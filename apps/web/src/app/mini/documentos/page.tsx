'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useMiniApp } from '../layout'

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
  const router = useRouter()
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()

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
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Actualizando archivador digital...</p>
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
        <button
          onClick={() => router.push('/mini/ventas')}
          className="mt-6 rounded-lg bg-[#2481cc] px-5 py-2 text-xs font-semibold hover:bg-[#2072b3]"
        >
          Volver a mis ventas
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0e1621] text-white pb-12">
      {/* Header Premium */}
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
          <h1 className="text-sm font-bold truncate">Archivador Digital</h1>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Minutas Entregadas</p>
        </div>
      </header>

      {/* Listado de Documentos */}
      <main className="px-4 mt-4 space-y-3">
        {documentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
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
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-300">Sin documentos</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">
              No posees minutas firmadas entregadas para descargar aún.
            </p>
          </div>
        ) : (
          documentos.map((doc) => {
            return (
              <div
                key={doc.id}
                className="flex flex-col rounded-xl bg-[#17212b] p-4 border border-[#242f3d] shadow-sm space-y-3"
              >
                {/* Cabecera Minuta */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">Lote N° {doc.numero_lote}</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">{doc.proyecto}</p>
                  </div>
                  {doc.vencido ? (
                    <span className="rounded-full bg-red-950/40 border border-red-500/20 px-2 py-0.5 text-[9px] font-semibold text-red-400">
                      Enlace Expirado
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">
                      Enlace Activo
                    </span>
                  )}
                </div>

                {/* Fechas */}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400 bg-[#121c25] rounded-lg p-2.5">
                  <div>
                    <span className="text-[8px] text-gray-500 block uppercase tracking-wider">
                      Fecha Entrega
                    </span>
                    <span className="font-semibold text-gray-300 mt-0.5 block">
                      {formatDate(doc.delivered_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[8px] text-gray-500 block uppercase tracking-wider">
                      Fecha Expiración
                    </span>
                    <span className="font-semibold text-gray-300 mt-0.5 block">
                      {formatDate(doc.expires_at)}
                    </span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="pt-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 truncate">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="h-4 w-4 text-[#2481cc] shrink-0"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                      />
                    </svg>
                    <span className="truncate max-w-[150px]">{doc.file_path.split('/').pop()}</span>
                  </div>

                  {!doc.vencido && doc.url_descarga ? (
                    <a
                      href={doc.url_descarga}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-[#2481cc] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2072b3] transition-all flex items-center gap-1.5"
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
                      className="rounded-lg bg-gray-800 px-4 py-1.5 text-xs font-semibold text-gray-500 cursor-not-allowed flex items-center gap-1.5 border border-gray-700/30"
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
        <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
          <p className="mt-4 text-sm text-gray-400">Actualizando archivador digital...</p>
        </div>
      }
    >
      <DocumentosContent />
    </Suspense>
  )
}
