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

interface Proyecto {
  id: string
  name: string
}

interface AvailableLot {
  id: string
  numero_lote: string
  status: string
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
  'bg-[#181818] border-white/[0.08] text-white placeholder-zinc-500 focus-visible:ring-emerald-500 focus-visible:border-transparent rounded-xl h-11 text-xs'

function ReservaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lotIdParam = searchParams.get('lot_id') || ''
  const { session, loading: sessionLoading, error: sessionError, isTelegram } = useMiniApp()
  const { webApp, haptic } = useTelegram()

  const [currentLotId, setCurrentLotId] = useState<string>(lotIdParam)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [availableLots, setAvailableLots] = useState<AvailableLot[]>([])
  const [loadingLots, setLoadingLots] = useState(false)

  const idempotencyKeyRef = useRef<string>('')
  useEffect(() => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID()
    }
  }, [])

  const [lot, setLot] = useState<LotSummary | null>(null)
  const [lotLoading, setLotLoading] = useState(false)
  const [lotError, setLotError] = useState<string | null>(null)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [approvalId, setApprovalId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty, isValid },
  } = useForm<ReservaMiniappInput>({
    resolver: zodResolver(reservaMiniappSchema),
    mode: 'onChange',
    defaultValues: { lot_id: currentLotId, payment_method: 'transfer' },
  })

  const rutValue = watch('buyer_rut')
  const rutIsValid = !!rutValue && !errors.buyer_rut

  // Cargar proyectos si no viene un lot_id específico
  useEffect(() => {
    if (!session || sessionLoading) return
    const fetchProjs = async () => {
      try {
        const res = await fetch('/api/miniapp/proyectos', {
          headers: { Authorization: `Bearer ${session.token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setProyectos(data)
          if (data.length > 0 && !selectedProjectId) {
            setSelectedProjectId(data[0].id)
          }
        }
      } catch (err) {
        console.error('Error cargando proyectos para reserva:', err)
      }
    }
    fetchProjs()
  }, [session, sessionLoading, selectedProjectId])

  // Cargar lotes disponibles cuando se selecciona un proyecto
  useEffect(() => {
    if (!selectedProjectId || !session || currentLotId) return
    const fetchLotsOfProj = async () => {
      try {
        setLoadingLots(true)
        const res = await fetch(`/api/miniapp/proyectos/${selectedProjectId}/mapa`, {
          headers: { Authorization: `Bearer ${session.token}` },
        })
        if (res.ok) {
          const geojson = await res.json()
          const lotsList: AvailableLot[] = (geojson.features || [])
            .map((f: { id: string; properties: { numero_lote: string; status: string } }) => ({
              id: String(f.id),
              numero_lote: String(f.properties?.numero_lote || 'S/N'),
              status: f.properties?.status || 'disponible',
            }))
            .filter((l: AvailableLot) => l.status === 'disponible')
          setAvailableLots(lotsList)
        }
      } catch (err) {
        console.error('Error cargando lotes del proyecto:', err)
      } finally {
        setLoadingLots(false)
      }
    }
    fetchLotsOfProj()
  }, [selectedProjectId, session, currentLotId])

  // Cargar ficha del lote seleccionado
  useEffect(() => {
    if (sessionLoading || !session || !currentLotId) {
      return
    }
    let active = true
    const fetchLot = async () => {
      try {
        setLotLoading(true)
        setLotError(null)
        const res = await fetch(`/api/miniapp/lotes/${currentLotId}`, {
          headers: { Authorization: `Bearer ${session.token}` },
        })
        if (!res.ok) throw new Error('No se pudo cargar la ficha del lote.')
        const data = await res.json()
        if (!active) return
        setLot(data)
        setValue('lot_id', currentLotId, { shouldValidate: true })
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
  }, [currentLotId, session, sessionLoading, setValue])

  // Confirmación de cierre en Telegram
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
    if (!session || !values.lot_id) return
    haptic.impact('medium')
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
          lot_id: values.lot_id,
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
        haptic.notification('warning')
        setSubmitState('lot_unavailable')
        setSubmitError(
          typeof data.error === 'string' ? data.error : 'Este lote acaba de reservarse.'
        )
        return
      }

      if (!res.ok) {
        haptic.notification('error')
        setSubmitState('error')
        setSubmitError(
          typeof data.error === 'string' ? data.error : 'No se pudo enviar la solicitud.'
        )
        return
      }

      haptic.notification('success')
      setApprovalId(data.approval_id || null)
      setSubmitState('success')
    } catch {
      haptic.notification('error')
      setSubmitState('error')
      setSubmitError('Fallo de conexión de red. Puedes reintentar sin duplicar la solicitud.')
    }
  }

  // MainButton nativo de Telegram como submit principal
  useEffect(() => {
    if (!webApp) return

    if (submitState === 'success' || submitState === 'lot_unavailable') {
      webApp.MainButton.hide()
      return
    }

    webApp.MainButton.setText(submitState === 'submitting' ? 'Enviando solicitud...' : 'Enviar Solicitud a Aprobación')
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

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center text-white">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
        <p className="mt-3 text-xs text-zinc-400">Cargando...</p>
      </div>
    )
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-[#121212] p-6 text-center text-white flex flex-col items-center justify-center">
        <h2 className="text-base font-bold">Error</h2>
        <p className="mt-2 text-xs text-zinc-400 max-w-xs">{sessionError}</p>
      </div>
    )
  }

  if (submitState === 'success') {
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
        <h2 className="text-lg font-bold text-white tracking-tight">
          ¡Reserva Ingresada con Éxito!
        </h2>
        {approvalId && (
          <p className="mt-2 text-xs text-zinc-400 font-mono bg-white/[0.04] px-3 py-1 rounded-lg border border-white/[0.06]">
            Expediente #{approvalId.slice(0, 8)}
          </p>
        )}
        <p className="mt-3 text-xs text-zinc-400 max-w-xs leading-relaxed">
          La solicitud fue enviada al administrador. Recibirás una notificación por Telegram cuando sea aprobada.
        </p>
        <button
          onClick={() => {
            haptic.impact('light')
            router.push('/mini/ventas')
          }}
          className="mt-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-emerald-950/50 active:scale-95 transition-all"
        >
          Ver Mis Ventas
        </button>
      </div>
    )
  }

  if (submitState === 'lot_unavailable') {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="rounded-2xl bg-amber-950/50 border border-amber-500/30 p-4 text-amber-400 mb-4">
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
        <h2 className="text-base font-bold text-amber-400">Parcela no disponible</h2>
        <p className="mt-2 text-xs text-zinc-400 max-w-xs">
          {submitError || 'Esta parcela acaba de ser reservada o vendida. Por favor, selecciona otra en el mapa.'}
        </p>
        <button
          onClick={() => {
            haptic.impact('light')
            router.push('/mini/mapa')
          }}
          className="mt-6 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] px-5 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all"
        >
          Explorar en el Mapa
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white pb-28">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#121212]/95 backdrop-blur-md border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              haptic.impact('light')
              router.back()
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
            <h1 className="text-sm font-bold text-white">Nueva Reserva</h1>
            <p className="text-[11px] text-zinc-400">
              {lot ? `Lote ${lot.numero_lote} · ${lot.proyecto_nombre}` : 'Selecciona parcela y comprador'}
            </p>
          </div>
        </div>
      </header>

      {/* Formulario */}
      <form onSubmit={handleSubmit(onSubmit)} className="px-4 mt-4 space-y-4">
        {/* Selector de Lote si no viene por parámetro */}
        {!lotIdParam && (
          <div className="rounded-2xl bg-[#181818] border border-white/[0.08] p-4 space-y-3 shadow-md">
            <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              1. Selección de Parcela
            </h3>
            
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400">Proyecto</label>
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  haptic.selection()
                  setSelectedProjectId(e.target.value)
                  setCurrentLotId('')
                  setValue('lot_id', '', { shouldValidate: true })
                }}
                className="w-full rounded-xl bg-[#121212] border border-white/[0.08] px-3 py-2.5 text-xs font-semibold text-white outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#181818]">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400">Lote Disponible</label>
              {loadingLots ? (
                <div className="h-10 animate-pulse bg-white/[0.04] rounded-xl"></div>
              ) : availableLots.length > 0 ? (
                <select
                  value={currentLotId}
                  onChange={(e) => {
                    haptic.selection()
                    setCurrentLotId(e.target.value)
                    setValue('lot_id', e.target.value, { shouldValidate: true })
                  }}
                  className="w-full rounded-xl bg-[#121212] border border-white/[0.08] px-3 py-2.5 text-xs font-semibold text-white outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Elige un lote --</option>
                  {availableLots.map((l) => (
                    <option key={l.id} value={l.id} className="bg-[#181818]">
                      Lote N° {l.numero_lote} (Disponible)
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-amber-400 py-1 font-medium">
                  No hay lotes disponibles en este proyecto o están todos reservados.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Ficha Resumen del Lote */}
        {lot && (
          <div className="rounded-2xl bg-gradient-to-r from-emerald-950/30 to-zinc-900 border border-emerald-500/20 p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">
                Parcela Seleccionada
              </span>
              <h2 className="text-base font-black text-white mt-0.5">
                Lote N° {lot.numero_lote}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">{lot.proyecto_nombre}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 font-semibold block uppercase tracking-wider">
                Precio
              </span>
              <span className="text-sm font-black text-emerald-400 block mt-0.5">
                {formatCLP(lot.precio)}
              </span>
            </div>
          </div>
        )}

        {/* Datos del Comprador */}
        <div className="rounded-2xl bg-[#181818] border border-white/[0.08] p-4 space-y-3.5 shadow-md">
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            2. Datos del Comprador
          </h3>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400">Nombre Completo</label>
            <Input {...register('buyer_name')} placeholder="Juan Soto Pérez" className={inputClass} />
            {errors.buyer_name && (
              <p className="text-[10px] text-rose-400 font-medium">{errors.buyer_name.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400">RUT Comprador</label>
            <div className="relative">
              <Input
                {...register('buyer_rut', {
                  onBlur: (e) => {
                    e.target.value = formatRut(e.target.value)
                  },
                })}
                placeholder="12.345.678-9"
                className={`${inputClass} pr-10`}
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
                      className="h-4 w-4 text-rose-400"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  )}
                </span>
              )}
            </div>
            {errors.buyer_rut && (
              <p className="text-[10px] text-rose-400 font-medium">{errors.buyer_rut.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400">Correo Electrónico</label>
              <Input
                {...register('buyer_email')}
                type="email"
                placeholder="juan@correo.cl"
                className={inputClass}
              />
              {errors.buyer_email && (
                <p className="text-[10px] text-rose-400 font-medium">{errors.buyer_email.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400">Teléfono</label>
              <Input {...register('buyer_phone')} placeholder="+56912345678" className={inputClass} />
              {errors.buyer_phone && (
                <p className="text-[10px] text-rose-400 font-medium">{errors.buyer_phone.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Pago y Observaciones */}
        <div className="rounded-2xl bg-[#181818] border border-white/[0.08] p-4 space-y-3.5 shadow-md">
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            3. Modalidad de Pago & Notas
          </h3>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400">Medio de Pago</label>
            <select
              {...register('payment_method')}
              className="w-full rounded-xl bg-[#121212] border border-white/[0.08] px-3 py-2.5 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value} className="bg-[#181818]">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400">Comprobante de Pago (Enlace)</label>
            <Input
              {...register('payment_evidence_url')}
              placeholder="https://drive.google.com/..."
              className={inputClass}
            />
            {errors.payment_evidence_url && (
              <p className="text-[10px] text-rose-400 font-medium">{errors.payment_evidence_url.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400">Notas para el Administrador</label>
            <Textarea
              {...register('observation')}
              placeholder="Observaciones sobre la reserva o cliente..."
              className="bg-[#121212] border-white/[0.08] text-white placeholder-zinc-500 focus-visible:ring-emerald-500 rounded-xl text-xs min-h-16"
            />
          </div>
        </div>

        {submitError && (
          <div className="rounded-xl bg-rose-950/40 border border-rose-800/30 p-3 text-xs text-rose-400 font-medium">
            {submitError}
          </div>
        )}

        {/* Botón de página (visible fuera de Telegram o como alternativa) */}
        {!isTelegram && (
          <Button
            type="submit"
            disabled={!isValid || submitState === 'submitting'}
            className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 transition-all active:scale-[0.98]"
          >
            {submitState === 'submitting' ? 'Enviando...' : 'Enviar Solicitud a Aprobación'}
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
        <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center text-white">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
        </div>
      }
    >
      <ReservaContent />
    </Suspense>
  )
}
