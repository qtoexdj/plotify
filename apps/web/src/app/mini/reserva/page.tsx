'use client'

import React, { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { useTelegram } from '@/lib/miniapp/telegram'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  reservaMiniappSchema,
  ReservaMiniappInput,
  PAYMENT_METHODS,
  formatRut,
} from '@/lib/miniapp/validation'

interface LotSummary {
  id: string
  numero_lote: string
  status: string
  precio: number | null
  proyecto_nombre: string
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'lot_unavailable' | 'error'

function formatCLP(value: number | null): string {
  if (value === null || value === undefined) return 'No definido'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(value)
}

const inputClass =
  'bg-[#17212b] border-[#242f3d] text-white placeholder-gray-500 focus-visible:ring-[#2481cc] focus-visible:border-transparent'

function ReservaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lotId = searchParams.get('lot_id') || ''
  const { session, loading: sessionLoading, error: sessionError, isTelegram } = useMiniApp()
  const { webApp } = useTelegram()

  const idempotencyKeyRef = useRef<string>('')
  useEffect(() => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID()
    }
  }, [])

  const [lot, setLot] = useState<LotSummary | null>(null)
  const [lotLoading, setLotLoading] = useState(true)
  const [lotError, setLotError] = useState<string | null>(null)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [approvalId, setApprovalId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty, isValid },
  } = useForm<ReservaMiniappInput>({
    resolver: zodResolver(reservaMiniappSchema),
    mode: 'onChange',
    defaultValues: { lot_id: lotId, payment_method: 'transfer' },
  })

  const rutValue = watch('buyer_rut')
  const rutIsValid = !!rutValue && !errors.buyer_rut

  // Cargar la ficha del lote para confirmar que sigue disponible y mostrar contexto
  useEffect(() => {
    if (sessionLoading || !session || !lotId) {
      if (!lotId) setLotLoading(false)
      return
    }
    let active = true
    const fetchLot = async () => {
      try {
        setLotLoading(true)
        setLotError(null)
        const res = await fetch(`/api/miniapp/lotes/${lotId}`, {
          headers: { Authorization: `Bearer ${session.token}` },
        })
        if (!res.ok) throw new Error('No se pudo cargar la ficha del lote.')
        const data = await res.json()
        if (!active) return
        setLot(data)
        if (data.status !== 'disponible') {
          setSubmitState('lot_unavailable')
        }
      } catch (err) {
        if (!active) return
        setLotError(err instanceof Error ? err.message : 'Error de red.')
      } finally {
        if (active) setLotLoading(false)
      }
    }
    fetchLot()
    return () => {
      active = false
    }
  }, [lotId, session, sessionLoading])

  // enableClosingConfirmation mientras haya datos sin enviar (evita perder la reserva a mitad de tipeo)
  useEffect(() => {
    if (!webApp) return
    if (isDirty && submitState !== 'success') {
      webApp.enableClosingConfirmation()
    } else {
      webApp.disableClosingConfirmation()
    }
    return () => {
      webApp.disableClosingConfirmation()
    }
  }, [webApp, isDirty, submitState])

  const onSubmit = async (values: ReservaMiniappInput) => {
    if (!session || !lotId) return
    setSubmitState('submitting')
    setSubmitError(null)
    try {
      const res = await fetch('/api/miniapp/reservas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
          'X-Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          lot_id: lotId,
          buyer_name: values.buyer_name,
          buyer_rut: values.buyer_rut,
          buyer_email: values.buyer_email,
          buyer_phone: values.buyer_phone,
          payment_method: values.payment_method,
          payment_evidence_url: values.payment_evidence_url || undefined,
          observation: values.observation || undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.status === 409) {
        setSubmitState('lot_unavailable')
        setSubmitError(
          typeof data.error === 'string' ? data.error : 'Este lote acaba de reservarse.'
        )
        return
      }

      if (!res.ok) {
        setSubmitState('error')
        setSubmitError(
          typeof data.error === 'string' ? data.error : 'No se pudo enviar la solicitud.'
        )
        return
      }

      setApprovalId(data.approval_id || null)
      setSubmitState('success')
    } catch {
      setSubmitState('error')
      setSubmitError('Fallo de conexión de red. Puedes reintentar sin duplicar la solicitud.')
    }
  }

  // MainButton nativo de Telegram como submit principal (fuera de Telegram se usa el botón de página)
  useEffect(() => {
    if (!webApp) return

    if (submitState === 'success' || submitState === 'lot_unavailable') {
      webApp.MainButton.hide()
      return
    }

    webApp.MainButton.setText(submitState === 'submitting' ? 'Enviando...' : 'Enviar a aprobación')
    webApp.MainButton.show()
    if (isValid && submitState !== 'submitting') {
      webApp.MainButton.enable()
    } else {
      webApp.MainButton.disable()
    }

    const onMainButtonClick = () => handleSubmit(onSubmit)()
    webApp.MainButton.onClick(onMainButtonClick)
    return () => {
      webApp.MainButton.offClick(onMainButtonClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webApp, isValid, submitState])

  useEffect(() => {
    return () => {
      webApp?.MainButton.hide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (sessionLoading || lotLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Cargando ficha del lote...</p>
      </div>
    )
  }

  if (sessionError || !lotId || lotError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] p-6 text-center text-white">
        <h2 className="text-lg font-semibold">Error</h2>
        <p className="mt-2 text-sm text-gray-400 max-w-xs">
          {sessionError || lotError || 'Falta el lote a reservar.'}
        </p>
        <button
          onClick={() => router.push('/mini/mapa')}
          className="mt-6 rounded-lg bg-[#2481cc] px-5 py-2 text-xs font-semibold hover:bg-[#2072b3]"
        >
          Volver al mapa
        </button>
      </div>
    )
  }

  if (submitState === 'success') {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-center text-white px-6">
        <div className="rounded-full bg-emerald-950/50 p-4 text-emerald-400 mb-4">
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
        <h2 className="text-lg font-semibold text-emerald-400">
          Solicitud enviada al administrador
        </h2>
        {approvalId && (
          <p className="mt-2 text-xs text-gray-500 font-mono">Caso {approvalId.slice(0, 8)}</p>
        )}
        <p className="mt-2 text-sm text-gray-400 max-w-xs">
          Te avisaremos por Telegram cuando quede aprobada.
        </p>
        <button
          onClick={() => router.push('/mini/ventas')}
          className="mt-6 rounded-lg bg-[#2481cc] px-5 py-2 text-xs font-semibold hover:bg-[#2072b3]"
        >
          Ver mis ventas
        </button>
      </div>
    )
  }

  if (submitState === 'lot_unavailable') {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] p-6 text-center text-white">
        <div className="rounded-full bg-amber-950/50 p-4 text-amber-400 mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.0}
            stroke="currentColor"
            className="h-8 w-8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-amber-400">Lote no disponible</h2>
        <p className="mt-2 text-sm text-gray-400 max-w-xs">
          {submitError || 'Este lote acaba de reservarse. Vuelve al mapa para ver otro.'}
        </p>
        <button
          onClick={() => router.push('/mini/mapa')}
          className="mt-6 rounded-lg bg-[#2481cc] px-5 py-2 text-xs font-semibold hover:bg-[#2072b3]"
        >
          Volver al mapa
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0e1621] text-white pb-28">
      <header className="sticky top-0 z-10 bg-[#17212b] px-4 py-3 shadow-md border-b border-[#242f3d] flex items-center gap-3">
        <button
          onClick={() => router.back()}
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
          <h1 className="text-sm font-bold">Nueva reserva</h1>
          {lot && (
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">
              Lote {lot.numero_lote} · {lot.proyecto_nombre}
              {lot.precio ? ` · ${formatCLP(lot.precio)}` : ''}
            </p>
          )}
        </div>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="px-4 mt-4 space-y-4">
        {submitError && submitState === 'error' && (
          <div className="rounded-lg bg-red-950/40 border border-red-500/20 p-3 text-xs text-red-400">
            {submitError}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">Nombre del comprador</label>
          <Input {...register('buyer_name')} placeholder="Juan Soto Pérez" className={inputClass} />
          {errors.buyer_name && (
            <p className="text-[11px] text-red-400">{errors.buyer_name.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">RUT</label>
          <div className="relative">
            <Input
              {...register('buyer_rut', {
                onBlur: (e) => {
                  e.target.value = formatRut(e.target.value)
                },
              })}
              placeholder="12.345.678-9"
              className={`${inputClass} pr-9`}
            />
            {rutValue && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {rutIsValid ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    className="h-4 w-4 text-emerald-400"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    className="h-4 w-4 text-red-400"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                )}
              </span>
            )}
          </div>
          {errors.buyer_rut && (
            <p className="text-[11px] text-red-400">{errors.buyer_rut.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">Correo electrónico</label>
          <Input
            {...register('buyer_email')}
            type="email"
            placeholder="juan@correo.cl"
            className={inputClass}
          />
          {errors.buyer_email && (
            <p className="text-[11px] text-red-400">{errors.buyer_email.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">Teléfono</label>
          <Input {...register('buyer_phone')} placeholder="+56912345678" className={inputClass} />
          {errors.buyer_phone && (
            <p className="text-[11px] text-red-400">{errors.buyer_phone.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">Método de pago</label>
          <select
            {...register('payment_method')}
            className="w-full rounded-md bg-[#17212b] border border-[#242f3d] px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-[#2481cc]"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">
            Comprobante de pago (opcional, enlace)
          </label>
          <Input
            {...register('payment_evidence_url')}
            placeholder="https://..."
            className={inputClass}
          />
          {errors.payment_evidence_url && (
            <p className="text-[11px] text-red-400">{errors.payment_evidence_url.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">Observación (opcional)</label>
          <Textarea
            {...register('observation')}
            placeholder="Notas cortas para el administrador"
            className={`${inputClass} min-h-20`}
          />
          {errors.observation && (
            <p className="text-[11px] text-red-400">{errors.observation.message}</p>
          )}
        </div>

        {/* Botón de página: visible fuera de Telegram, donde no existe MainButton nativo */}
        {!isTelegram && (
          <Button
            type="submit"
            disabled={!isValid || submitState === 'submitting'}
            className="w-full bg-[#2481cc] hover:bg-[#2072b3] text-white font-medium"
          >
            {submitState === 'submitting' ? 'Enviando...' : 'Enviar a aprobación'}
          </Button>
        )}
      </form>
    </div>
  )
}

export default function ReservaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
          <p className="mt-4 text-sm text-gray-400">Cargando...</p>
        </div>
      }
    >
      <ReservaContent />
    </Suspense>
  )
}
