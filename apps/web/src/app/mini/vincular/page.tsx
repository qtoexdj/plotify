'use client'

import React, { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTelegram } from '@/lib/miniapp/telegram'
import { miniAppOrgId, miniAppUrl } from '@/lib/miniapp/routes'

function VincularContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { webApp, haptic } = useTelegram()

  const qOrgId = miniAppOrgId(searchParams)
  const qChatId = searchParams.get('chat_id')
  const tgChatId = webApp?.initDataUnsafe?.user?.id ? String(webApp.initDataUnsafe.user.id) : null

  const orgId = qOrgId || null
  const chatId = qChatId || tgChatId || null

  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSolicitar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !orgId || !chatId) {
      setError('Falta información requerida para la vinculación (org_id o chat_id).')
      return
    }

    setLoading(true)
    setError(null)
    haptic.impact('medium')

    try {
      const res = await fetch('/api/miniapp/vincular/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          chat_id: parseInt(chatId, 10),
          org_id: orgId,
        }),
      })

      if (!res.ok) {
        haptic.notification('error')
        const detail = await res.json()
        setError(
          detail.error === 'email_not_registered'
            ? 'Este correo electrónico no está registrado en Plotify para esta organización.'
            : detail.error || 'Error al solicitar el código OTP.'
        )
        setLoading(false)
        return
      }

      haptic.notification('success')
      setStep(2)
    } catch (err) {
      console.error('Error al solicitar OTP:', err)
      haptic.notification('error')
      setError('Fallo de conexión de red con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !email.trim() || !orgId || !chatId) {
      setError('Código u otros parámetros requeridos ausentes.')
      return
    }

    setLoading(true)
    setError(null)
    haptic.impact('medium')

    try {
      const res = await fetch('/api/miniapp/vincular/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          chat_id: parseInt(chatId, 10),
          org_id: orgId,
          code: code.trim(),
        }),
      })

      if (!res.ok) {
        haptic.notification('error')
        const detail = await res.json()
        setError(
          detail.error === 'otp_invalid'
            ? 'El código de seguridad ingresado es inválido.'
            : detail.error === 'otp_expired'
              ? 'El código ha expirado. Por favor, solicita uno nuevo.'
              : detail.error || 'Fallo en la confirmación de la vinculación.'
        )
        setLoading(false)
        return
      }

      haptic.notification('success')
      setSuccess(true)
      setTimeout(() => {
        router.push(miniAppUrl('/mini', orgId))
      }, 1800)
    } catch (err) {
      console.error('Error al confirmar OTP:', err)
      haptic.notification('error')
      setError('Fallo de conexión de red con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#121212] p-6 text-center text-white font-sans">
        <div className="rounded-2xl bg-emerald-950/60 p-6 text-emerald-400 mb-4 border border-emerald-500/30 shadow-2xl animate-fade-in-up">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-12 w-12"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">¡Vinculación Exitosa!</h1>
        <p className="text-zinc-400 text-xs max-w-xs leading-relaxed">
          Tu cuenta de Telegram ha sido enlazada correctamente con tu perfil de Plotify. Redirigiéndote a la aplicación...
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#121212] p-6 text-white font-sans">
      <div className="w-full max-w-sm rounded-3xl border border-white/[0.08] bg-[#181818] p-6 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3 shadow-inner">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-6 w-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white">Vincular con Plotify</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Conecta tu cuenta de Telegram para operar en ruta
          </p>
        </div>

        {/* Alertas de error */}
        {error && (
          <div className="mb-4 rounded-xl bg-rose-950/40 border border-rose-800/30 p-3 text-xs text-rose-300 leading-relaxed font-medium">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleSolicitar} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[11px] font-medium text-zinc-400">
                Correo Electrónico
              </label>
              <Input
                id="email"
                type="email"
                placeholder="nombre@plotify.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="bg-[#121212] border-white/[0.08] text-white placeholder-zinc-500 focus-visible:ring-emerald-500 rounded-xl text-xs h-11"
                required
              />
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Ingresa el correo con el que estás registrado en Plotify para recibir tu código OTP de confirmación vía Telegram.
            </p>

            <Button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 transition-all active:scale-[0.98]"
            >
              {loading ? 'Solicitando código...' : 'Solicitar Código de Acceso'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleConfirmar} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="code" className="text-[11px] font-medium text-zinc-400 text-center block">
                Código OTP de 6 Dígitos
              </label>
              <Input
                id="code"
                type="text"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
                className="bg-[#121212] border-white/[0.08] text-white placeholder-zinc-600 text-center tracking-widest text-lg font-mono font-bold focus-visible:ring-emerald-500 rounded-xl h-12"
                required
              />
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
              Revisa el chat de este bot: te hemos enviado el código de 6 dígitos para autorizar el acceso.
            </p>

            <Button
              type="submit"
              disabled={loading || code.trim().length !== 6}
              className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 transition-all active:scale-[0.98]"
            >
              {loading ? 'Confirmando...' : 'Vincular Cuenta'}
            </Button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading}
                className="text-xs text-zinc-400 hover:text-white underline underline-offset-4"
              >
                Volver a ingresar correo
              </button>
            </div>
          </form>
        )}

        {/* Footer info */}
        <div className="mt-6 border-t border-white/[0.06] pt-3 text-center">
          <p className="text-[10px] text-zinc-500 font-mono">
            Chat ID: {chatId || 'no detectado'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function VincularPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#121212] text-white">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
        </div>
      }
    >
      <VincularContent />
    </Suspense>
  )
}
