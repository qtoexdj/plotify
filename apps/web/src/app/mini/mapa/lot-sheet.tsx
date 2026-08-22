'use client'

import React, { useEffect, useState } from 'react'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { useTelegram } from '@/lib/miniapp/telegram'

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
  if (value === null || value === undefined) return 'A consultar'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(value)
}

export function LotSheet({ lotId, token, onClose, onStartReservation }: LotSheetProps) {
  const { session } = useMiniApp()
  const { haptic } = useTelegram()
  const [lot, setLot] = useState<LotDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

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
    haptic.impact('light')
    const botUsername = session?.bot_username
    if (!botUsername) {
      setShareError('No se pudo determinar el bot para compartir.')
      return
    }
    const deepLink = `https://t.me/${botUsername}/app?startapp=lot_${lotId}`

    navigator.clipboard
      .writeText(deepLink)
      .then(() => {
        haptic.notification('success')
        setShareError(null)
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2000)
      })
      .catch((err) => {
        console.error('Error al copiar link:', err)
        setShareError('No se pudo copiar el enlace en este dispositivo.')
      })
  }

  const isAvailable = lot?.status === 'disponible'

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl bg-[#161616]/98 backdrop-blur-2xl border-t border-white/[0.12] shadow-2xl p-5 animate-slide-up max-h-[85vh] overflow-y-auto safe-area-pb">
      {/* Tirador de arrastre */}
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/[0.15]" />

      {/* Cabecera */}
      <div className="flex items-start justify-between">
        <div>
          {loading ? (
            <div className="h-6 w-32 animate-pulse bg-white/[0.06] rounded-lg"></div>
          ) : lot ? (
            <>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">Lote {lot.numero_lote}</h2>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                    lot.status === 'disponible'
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                      : lot.status === 'reservado'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500/30'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700/40'
                  }`}
                >
                  {lot.status === 'disponible'
                    ? 'Disponible'
                    : lot.status === 'reservado'
                      ? 'Reservado'
                      : 'Vendido'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 font-medium">{lot.proyecto_nombre}</p>
            </>
          ) : null}
        </div>
        <button
          onClick={() => {
            haptic.impact('light')
            onClose()
          }}
          className="rounded-full bg-white/[0.06] hover:bg-white/[0.12] p-2 text-zinc-400 hover:text-white transition-all active:scale-90"
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
        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="h-16 animate-pulse bg-white/[0.04] rounded-2xl"></div>
            <div className="h-16 animate-pulse bg-white/[0.04] rounded-2xl"></div>
          </div>
          <div className="h-20 w-full animate-pulse bg-white/[0.04] rounded-2xl"></div>
        </div>
      ) : error ? (
        <div className="mt-5 text-center text-rose-400 py-4 text-xs font-medium bg-rose-950/20 rounded-xl border border-rose-800/30">
          {error}
        </div>
      ) : lot ? (
        <div className="mt-4 space-y-4">
          {/* Métricas Principales */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3.5 space-y-1">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Superficie
              </span>
              <span className="text-base font-black text-white tracking-tight block">
                {lot.superficie ? `${lot.superficie.toLocaleString('es-CL')} m²` : 'Por definir'}
              </span>
            </div>
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3.5 space-y-1">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Precio Lista
              </span>
              <span className="text-base font-black text-emerald-400 tracking-tight block">
                {formatCLP(lot.precio)}
              </span>
            </div>
          </div>

          {/* Ficha Legal / Deslindes */}
          <div className="space-y-2.5 bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 text-xs">
            <div className="flex justify-between items-center border-b border-white/[0.06] pb-2.5">
              <span className="text-zinc-400 font-medium">Rol de Avalúo SII:</span>
              <span className="font-mono font-bold text-zinc-200">
                {lot.numero_rol || 'En trámite / No asignado'}
              </span>
            </div>
            <div className="space-y-1 pt-1">
              <span className="text-zinc-400 font-medium block text-[11px]">Deslindes Técnicos:</span>
              <p className="text-zinc-300 leading-relaxed font-normal text-xs">
                {lot.deslindes || 'Deslindes oficiales cargados en el expediente de loteo.'}
              </p>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={handleShare}
              className={`flex-1 rounded-2xl py-3 text-xs font-bold transition-all border flex items-center justify-center gap-1.5 active:scale-95 ${
                shareCopied
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-950/50'
                  : 'bg-white/[0.06] hover:bg-white/[0.1] border-white/[0.1] text-zinc-200'
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
                    className="h-4 w-4 text-emerald-400"
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

            {isAvailable ? (
              <button
                onClick={() => {
                  haptic.impact('medium')
                  onStartReservation(lot.id)
                }}
                className="flex-[2] rounded-2xl bg-emerald-600 hover:bg-emerald-500 py-3 text-xs font-bold text-white shadow-lg shadow-emerald-950/60 transition-all flex items-center justify-center gap-1.5 active:scale-95"
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
                Reservar Parcela
              </button>
            ) : (
              <button
                disabled
                className="flex-[2] rounded-2xl bg-zinc-800/60 text-zinc-500 py-3 text-xs font-bold cursor-not-allowed border border-white/[0.04] text-center"
              >
                Parcela {lot.status}
              </button>
            )}
          </div>

          {shareError && <p className="text-[11px] text-rose-400 text-center">{shareError}</p>}
        </div>
      ) : null}
    </div>
  )
}
