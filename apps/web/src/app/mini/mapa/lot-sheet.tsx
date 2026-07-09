'use client'

import React, { useEffect, useState } from 'react'

interface LotDetail {
  id: string
  project_id: string
  numero_lote: string
  status: string
  superficie: number | null
  precio: number | null
  numero_rol: string | null
  deslindes: string | null
  proyecto_nombre: string
}

interface LotSheetProps {
  lotId: string
  token: string
  onClose: () => void
  onStartReservation: (lotId: string) => void
}

function formatCLP(value: number | null): string {
  if (value === null || value === undefined) return 'No definido'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(value)
}

export function LotSheet({ lotId, token, onClose, onStartReservation }: LotSheetProps) {
  const [lot, setLot] = useState<LotDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => {
    let active = true
    const fetchLotDetail = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/miniapp/lotes/${lotId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          throw new Error('No se pudo cargar la ficha del lote.')
        }

        const data = await res.json()
        if (active) {
          setLot(data)
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Error de red.'
          setError(msg)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchLotDetail()

    return () => {
      active = false
    }
  }, [lotId, token])

  const handleShare = () => {
    // Generar el deep link de la Mini App con startapp
    // El bot lee este start_param para abrir el visor en este lote directamente
    const botUsername = 'PlotifyBot' // Bot por defecto o recuperado dinámicamente
    const deepLink = `https://t.me/${botUsername}/app?startapp=lot_${lotId}`

    // Intentar compartir vía Clipboard
    navigator.clipboard
      .writeText(deepLink)
      .then(() => {
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2000)
      })
      .catch((err) => {
        console.error('Error al copiar link:', err)
      })
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 rounded-t-2xl bg-[#17212b] border-t border-[#242f3d] shadow-2xl p-5 animate-slide-up max-h-[85vh] overflow-y-auto">
      {/* Indicador de arrastre visual */}
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-600/50" />

      {/* Cerrar / Cabecera */}
      <div className="flex items-start justify-between">
        <div>
          {loading ? (
            <div className="h-6 w-32 animate-pulse bg-gray-800 rounded"></div>
          ) : lot ? (
            <>
              <h2 className="text-lg font-bold text-white">Lote {lot.numero_lote}</h2>
              <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider">
                {lot.proyecto_nombre}
              </p>
            </>
          ) : null}
        </div>
        <button
          onClick={onClose}
          className="rounded-full bg-gray-800/60 p-1.5 text-gray-400 hover:text-white transition-all active:scale-90"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-4 w-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="mt-6 space-y-4">
          <div className="h-10 w-full animate-pulse bg-gray-800 rounded-lg"></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-14 animate-pulse bg-gray-800 rounded-lg"></div>
            <div className="h-14 animate-pulse bg-gray-800 rounded-lg"></div>
          </div>
          <div className="h-16 w-full animate-pulse bg-gray-800 rounded-lg"></div>
        </div>
      ) : error ? (
        <div className="mt-6 text-center text-red-400 py-4 text-xs font-medium">{error}</div>
      ) : lot ? (
        <div className="mt-5 space-y-5">
          {/* Badge Estado */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Disponibilidad:</span>
            {lot.status === 'disponible' ? (
              <span className="rounded-full bg-emerald-950/40 border border-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Disponible
              </span>
            ) : lot.status === 'reservado' ? (
              <span className="rounded-full bg-amber-950/40 border border-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                Reservado
              </span>
            ) : (
              <span className="rounded-full bg-gray-800/40 border border-gray-700/20 px-3 py-1 text-xs font-semibold text-gray-500">
                Vendido
              </span>
            )}
          </div>

          {/* Grid Técnico */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#0e1621]/50 border border-[#242f3d]/60 p-3">
              <span className="text-[9px] text-gray-500 block uppercase tracking-wider font-semibold">
                Superficie
              </span>
              <span className="text-sm font-bold text-white mt-1 block">
                {lot.superficie ? `${lot.superficie} m²` : 'No definida'}
              </span>
            </div>
            <div className="rounded-xl bg-[#0e1621]/50 border border-[#242f3d]/60 p-3">
              <span className="text-[9px] text-gray-500 block uppercase tracking-wider font-semibold">
                Precio Lote
              </span>
              <span className="text-sm font-bold text-white mt-1 block">
                {formatCLP(lot.precio)}
              </span>
            </div>
          </div>

          {/* Detalles e Info Fina */}
          <div className="space-y-3 bg-[#0e1621]/40 border border-[#242f3d]/40 rounded-xl p-3.5 text-xs">
            <div className="flex justify-between border-b border-[#242f3d]/40 pb-2">
              <span className="text-gray-400">Rol de Avalúo:</span>
              <span className="font-bold text-gray-200">{lot.numero_rol || 'No asignado'}</span>
            </div>
            <div className="space-y-1 pt-1">
              <span className="text-gray-400 block">Límites y Deslindes:</span>
              <p className="text-gray-300 leading-normal italic font-medium">
                {lot.deslindes || 'No se han ingresado los deslindes técnicos para este lote.'}
              </p>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleShare}
              className={`flex-1 rounded-xl py-3 text-xs font-bold transition-all border flex items-center justify-center gap-1.5 active:scale-95 ${
                shareCopied
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-transparent border-[#242f3d] text-gray-300 hover:bg-gray-800/40'
              }`}
            >
              {shareCopied ? (
                <>
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
                  ¡Copiado!
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.0}
                    stroke="currentColor"
                    className="h-4 w-4 text-[#2481cc]"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186.003-.004c.007-.007.015-.016.024-.027l5.005-2.597m-5.032 2.628c-.01.012-.018.022-.024.029a2.25 2.25 0 0 0-.003.004l5.032 2.631m1.344-11.667a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Zm0 11.25a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Z"
                    />
                  </svg>
                  Compartir
                </>
              )}
            </button>

            {lot.status === 'disponible' ? (
              <button
                onClick={() => onStartReservation(lot.id)}
                className="flex-[2] rounded-xl bg-[#2481cc] py-3 text-xs font-bold text-white shadow-md hover:bg-[#2072b3] transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="h-4 w-4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Iniciar Reserva
              </button>
            ) : (
              <button
                disabled
                className="flex-[2] rounded-xl bg-gray-800 text-gray-500 py-3 text-xs font-bold cursor-not-allowed border border-gray-700/20 text-center"
              >
                No Disponible
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
