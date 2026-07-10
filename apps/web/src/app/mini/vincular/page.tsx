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
  const { webApp } = useTelegram()

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
        const detail = await res.json()
        setError(
          detail.error === 'email_not_registered'
            ? 'Este correo electrónico no está registrado en Plotify para esta organización.'
            : detail.error || 'Error al solicitar el código OTP.'
        )
        setLoading(false)
        return
      }

      setStep(2)
    } catch (err) {
      console.error('Error al solicitar OTP:', err)
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

      setSuccess(true)
      setTimeout(() => {
        router.push(miniAppUrl('/mini', orgId))
      }, 2000)
    } catch (err) {
      console.error('Error al confirmar OTP:', err)
      setError('Fallo de conexión de red con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#17212b] p-6 text-center text-white font-sans animate-fadeIn">
        <div className="rounded-full bg-emerald-950/50 p-6 text-emerald-400 mb-6 border border-emerald-800/30 animate-pulse">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-16 w-16"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">¡Vinculación Exitosa!</h1>
        <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
          Tu cuenta de Telegram ha sido enlazada correctamente con tu perfil de Plotify.
          Redirigiéndote...
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#17212b] p-6 text-white font-sans">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800/80 bg-[#0e1621] p-6 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#2481cc]/10 text-[#2481cc] mb-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
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
          <h1 className="text-xl font-bold">Vincular con Plotify</h1>
          <p className="text-xs text-gray-400 mt-1">
            Conecta tu cuenta de Telegram para operar en ruta
          </p>
        </div>

        {/* Alertas de error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-950/30 border border-red-800/30 p-3 text-xs text-red-400 leading-relaxed">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleSolicitar} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="text-xs font-medium text-gray-400">
                Correo Electrónico
              </label>
              <Input
                id="email"
                type="email"
                placeholder="nombre@plotify.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="bg-[#17212b] border-zinc-800 text-white placeholder-gray-500 focus-visible:ring-[#2481cc] focus-visible:border-transparent"
                required
              />
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Ingresa el correo electrónico con el que estás registrado en Plotify para verificar tu
              cuenta y enviarte un código.
            </p>

            <Button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full bg-[#2481cc] hover:bg-[#2072b3] text-white font-medium"
            >
              {loading ? 'Solicitando...' : 'Solicitar Código de Acceso'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleConfirmar} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="code" className="text-xs font-medium text-gray-400">
                Código OTP
              </label>
              <Input
                id="code"
                type="text"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
                className="bg-[#17212b] border-zinc-800 text-white placeholder-gray-500 text-center tracking-widest text-lg font-bold focus-visible:ring-[#2481cc] focus-visible:border-transparent"
                required
              />
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed text-center">
              Hemos enviado un mensaje con tu código de seguridad OTP al chat de Telegram desde el
              bot oficial de Plotify.
            </p>

            <Button
              type="submit"
              disabled={loading || code.trim().length !== 6}
              className="w-full bg-[#2481cc] hover:bg-[#2072b3] text-white font-medium"
            >
              {loading ? 'Confirmando...' : 'Vincular Cuenta'}
            </Button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading}
                className="text-xs text-gray-400 hover:text-white underline underline-offset-4"
              >
                Volver a ingresar correo
              </button>
            </div>
          </form>
        )}

        {/* Footer info */}
        <div className="mt-6 border-t border-zinc-800/80 pt-4 text-center">
          <p className="text-[10px] text-gray-500">
            ID Chat: <span className="font-mono">{chatId || 'no detectado'}</span>
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
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#17212b] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
          <p className="mt-4 text-sm text-gray-400">Cargando vinculación...</p>
        </div>
      }
    >
      <VincularContent />
    </Suspense>
  )
}
